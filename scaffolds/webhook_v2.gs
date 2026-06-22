/**
 * MediCall AI — Pilot MVP Webhook Handler v2 (DUAL-STACK: Vapi + LiveKit)
 * Google Apps Script Web App bound to the 'medicall-pilot-log' Google Sheet.
 *
 * Accepts EITHER a Vapi end-of-call-report payload OR a LiveKit end-of-call
 * payload so the same Sheet powers the A/B comparison across both stacks.
 * Appends one row per call to the 'call_logs' tab, populating a "stack"
 * column with either 'vapi' or 'livekit'.
 *
 * =========================================================================
 * SCHEMA MIGRATION FROM v1 (REQUIRED — manual one-time step)
 * =========================================================================
 *  v1 call_logs columns:
 *    timestamp | parent_name | phone | outcome | transcript_excerpt |
 *    duration_sec | raw_payload_json
 *
 *  v2 call_logs columns (NEW — insert "stack" between duration_sec and raw):
 *    timestamp | parent_name | phone | outcome | transcript_excerpt |
 *    duration_sec | stack | raw_payload_json
 *
 *  To migrate an existing sheet:
 *   1. Open the 'call_logs' tab
 *   2. Right-click column G (raw_payload_json) -> Insert 1 column left
 *   3. Header cell G1 = "stack"
 *   4. Backfill existing rows with "vapi" (all historic rows were Vapi)
 *   5. Replace Code.gs in Apps Script with this file's contents
 *   6. Save -> Deploy -> Manage deployments -> Edit -> New version -> Deploy
 *
 *  Payload routing rules:
 *   - LiveKit: payload.type == 'end-of-call-report' AND payload.stack == 'livekit'
 *   - Vapi:    payload.type starts with 'end-of-call' AND no stack field
 *   - else:    error (logged to error_log tab, 4xx-style JSON returned)
 * =========================================================================
 */

// ---------- Configuration ----------
var SCHEDULE_TAB = 'schedule';
var CALL_LOGS_TAB = 'call_logs';
var ERROR_LOG_TAB = 'error_log';
var TRANSCRIPT_EXCERPT_MAX = 500;

// Column indexes (0-based) in 'schedule' tab — must match schedule_template.csv
var SCHED_COL_PARENT_NAME = 0;
var SCHED_COL_PHONE = 1;

// ---------- Entry points ----------
function doPost(e) {
  var rawBody = '{}';
  try {
    rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(rawBody);

    var stack = detectStack_(payload);
    var extracted = (stack === 'livekit')
      ? extractLiveKitFields_(payload)
      : extractVapiFields_(payload);

    // Idempotency — dedupe by vapi_call_id OR livekit_call_id stored in raw_payload_json
    if (extracted.callId && isDuplicate_(extracted.callId)) {
      return jsonResponse_({ status: 'ok', deduped: true, call_id: extracted.callId });
    }

    var parentName = lookupParentName_(extracted.phone);

    var row = [
      extracted.timestamp,
      parentName,
      extracted.phone,
      extracted.outcome,
      extracted.transcriptExcerpt,
      extracted.durationSec,
      stack,
      rawBody
    ];

    appendCallLogRow_(row);
    return jsonResponse_({ status: 'ok', stack: stack, logged_at: new Date().toISOString() });
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    logError_(msg, rawBody);
    Logger.log('doPost error: ' + (err && err.stack ? err.stack : err));
    return jsonResponse_({ status: 'error', message: msg });
  }
}

function doGet(e) {
  return jsonResponse_({
    status: 'ok',
    message: 'MediCall webhook v2 (dual-stack) live. POST Vapi or LiveKit end-of-call events here.',
    timestamp: new Date().toISOString()
  });
}

// ---------- Stack detection ----------
function detectStack_(payload) {
  var type = String(payload && payload.type || '');
  var stackHint = String(payload && payload.stack || '').toLowerCase();

  if (type === 'end-of-call-report' && stackHint === 'livekit') return 'livekit';
  if (type.indexOf('end-of-call') === 0 && !stackHint) return 'vapi';
  throw new Error('Unrecognized payload — type="' + type + '", stack="' + stackHint + '"');
}

// ---------- LiveKit payload parsing ----------
// Expected shape (per A/B test contract):
//   { type: "end-of-call-report", stack: "livekit",
//     call_id, phone_e164, started_at, ended_at, duration_sec,
//     outcome: "CONFIRMED"|"DENIED"|"NO_ANSWER", transcript: "..." }
function extractLiveKitFields_(payload) {
  var startedAt = payload.started_at || null;
  var endedAt = payload.ended_at || null;
  var timestamp = startedAt ? new Date(startedAt).toISOString() : new Date().toISOString();

  var phone = payload.phone_e164 || payload.phone || '';
  var durationSec = 0;
  if (typeof payload.duration_sec === 'number') {
    durationSec = payload.duration_sec;
  } else if (startedAt && endedAt) {
    durationSec = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  }

  // LiveKit upstream is trusted to map outcome — take it directly, normalize case
  var outcome = String(payload.outcome || 'NO_ANSWER').toUpperCase();
  if (outcome !== 'CONFIRMED' && outcome !== 'DENIED' && outcome !== 'NO_ANSWER') {
    outcome = 'NO_ANSWER';
  }

  var transcript = String(payload.transcript || '');
  var transcriptExcerpt = transcript.substring(0, TRANSCRIPT_EXCERPT_MAX);

  return {
    timestamp: timestamp,
    phone: phone,
    outcome: outcome,
    transcriptExcerpt: transcriptExcerpt,
    durationSec: durationSec,
    callId: payload.call_id || payload.livekit_call_id || ''
  };
}

// ---------- Vapi payload parsing (ported from v1 webhook.gs) ----------
function extractVapiFields_(payload) {
  var call = payload.call || (payload.message && payload.message.call) || {};
  var artifact = payload.artifact || (payload.message && payload.message.artifact) || {};
  var analysis = payload.analysis || (payload.message && payload.message.analysis) || {};
  var messages = payload.messages || (payload.message && payload.message.messages) || [];

  var startedAt = call.startedAt || (payload.message && payload.message.startedAt) || null;
  var endedAt = call.endedAt || (payload.message && payload.message.endedAt) || null;
  var timestamp = startedAt ? new Date(startedAt).toISOString() : new Date().toISOString();

  var customer = call.customer || (payload.message && payload.message.customer) || {};
  var phone = customer.number || '';

  var durationSec = 0;
  if (typeof call.duration === 'number') {
    durationSec = call.duration;
  } else if (startedAt && endedAt) {
    durationSec = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  }

  var endedReason = call.endedReason || (payload.message && payload.message.endedReason) || '';
  var summary = (analysis && analysis.summary) ? String(analysis.summary) : '';
  var outcome = mapOutcome_(endedReason, summary);

  var transcript = '';
  if (artifact && typeof artifact.transcript === 'string' && artifact.transcript.length > 0) {
    transcript = artifact.transcript;
  } else if (Array.isArray(messages) && messages.length > 0) {
    transcript = messages.map(function (m) {
      var role = m.role || m.type || '';
      var content = m.message || m.content || m.text || '';
      return role ? (role + ': ' + content) : String(content);
    }).join(' | ');
  }
  var transcriptExcerpt = transcript.substring(0, TRANSCRIPT_EXCERPT_MAX);

  return {
    timestamp: timestamp,
    phone: phone,
    outcome: outcome,
    transcriptExcerpt: transcriptExcerpt,
    durationSec: durationSec,
    callId: call.id || (payload.message && payload.message.call && payload.message.call.id) || ''
  };
}

// Ported verbatim from v1 webhook.gs — maps Vapi endedReason + summary
// to CONFIRMED | DENIED | NO_ANSWER.
function mapOutcome_(endedReason, summary) {
  var reason = String(endedReason || '').toLowerCase();
  var sum = String(summary || '').toLowerCase();

  if (reason.indexOf('silence') >= 0 ||
      reason.indexOf('assistant-error') >= 0 ||
      reason.indexOf('no-answer') >= 0 ||
      reason.indexOf('busy') >= 0 ||
      reason.indexOf('failed') >= 0 ||
      reason.indexOf('voicemail') >= 0) {
    return 'NO_ANSWER';
  }

  if (reason.indexOf('customer-ended-call') >= 0 || reason.indexOf('assistant-ended-call') >= 0) {
    if (sum.indexOf('denied') >= 0 || sum.indexOf('did not take') >= 0 || sum.indexOf('refused') >= 0 || sum.indexOf('nahi') >= 0) {
      return 'DENIED';
    }
    return 'CONFIRMED';
  }

  if (sum.indexOf('confirmed') >= 0 || sum.indexOf('took') >= 0 || sum.indexOf('haan') >= 0 || sum.indexOf('le liya') >= 0) {
    return 'CONFIRMED';
  }
  if (sum.indexOf('denied') >= 0 || sum.indexOf('nahi') >= 0) {
    return 'DENIED';
  }
  return 'NO_ANSWER';
}

// ---------- Sheet helpers ----------
function lookupParentName_(phone) {
  if (!phone) return '';
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCHEDULE_TAB);
  if (!sheet) return '';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var range = sheet.getRange(2, 1, lastRow - 1, Math.max(SCHED_COL_PHONE, SCHED_COL_PARENT_NAME) + 1);
  var values = range.getValues();
  var target = normalizePhone_(phone);
  for (var i = 0; i < values.length; i++) {
    if (normalizePhone_(values[i][SCHED_COL_PHONE]) === target) {
      return String(values[i][SCHED_COL_PARENT_NAME] || '');
    }
  }
  return '';
}

function normalizePhone_(value) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/[^0-9+]/g, '');
  if (s.indexOf('+') === 0) s = s.substring(1);
  return s;
}

// Idempotency check — scans raw_payload_json column for a matching call_id
// substring. Cheap enough for pilot volumes (< 500 rows). For larger
// volumes, add a dedicated call_id column and index it.
function isDuplicate_(callId) {
  if (!callId) return false;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALL_LOGS_TAB);
  if (!sheet) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  // raw_payload_json is column H (8) in v2 schema
  var values = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  var needle = '"' + String(callId) + '"';
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).indexOf(needle) >= 0) return true;
  }
  return false;
}

function appendCallLogRow_(row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALL_LOGS_TAB);
  if (!sheet) {
    throw new Error("Tab '" + CALL_LOGS_TAB + "' not found. Create it per deployment instructions.");
  }
  sheet.appendRow(row);
}

function logError_(message, rawBody) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(ERROR_LOG_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(ERROR_LOG_TAB);
      sheet.appendRow(['timestamp', 'error_message', 'raw_payload']);
    }
    sheet.appendRow([new Date().toISOString(), message, String(rawBody).substring(0, 4000)]);
  } catch (e) {
    Logger.log('logError_ failed: ' + e);
  }
}

// ---------- HTTP response helper ----------
function jsonResponse_(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
