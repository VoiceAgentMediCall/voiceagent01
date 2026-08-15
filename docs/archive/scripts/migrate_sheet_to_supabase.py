"""
Production-grade migration: Google Sheet (medicall-pilot-log) → Supabase.

Spec: voiceagent/docs/2026-06-22-master-control-spec.md §11

Usage:
  Set env vars:
    SUPABASE_DB_URL=<direct port 5432 URL>
    SCHEDULE_CSV_URL=<published CSV URL for schedule tab>
    CALL_LOGS_CSV_URL=<published CSV URL for call_logs tab>
  Optional:
    --dry-run   parse + summarize but write nothing
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
import requests


# ---------- Config ----------
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL")
SCHEDULE_CSV_URL = os.environ.get("SCHEDULE_CSV_URL")
CALL_LOGS_CSV_URL = os.environ.get("CALL_LOGS_CSV_URL")

LOG_DIR = Path(__file__).parent.parent / "migrations"
LOG_DIR.mkdir(exist_ok=True)
LOG_PATH = LOG_DIR / f"{datetime.now().strftime('%Y-%m-%d')}-sheet-import.log"


# ---------- Phone normalization (ports the JS normalizePhone_ from webhook_v2.gs) ----------
def normalize_phone(value: str | None) -> str:
    if not value:
        return ""
    s = re.sub(r"[^\d+]", "", str(value))
    if s.startswith("+"):
        s = s[1:]
    # Add +91 prefix if it looks like an Indian mobile (10 digits starting 6-9)
    if len(s) == 10 and s[0] in "6789":
        s = "91" + s
    return "+" + s if s else ""


# ---------- Outcome map (verbatim from webhook_v2.gs.mapOutcome_) ----------
def map_vapi_outcome(ended_reason: str, summary: str) -> str:
    reason = (ended_reason or "").lower()
    summ = (summary or "").lower()
    if any(k in reason for k in ("silence", "assistant-error", "no-answer", "busy", "failed", "voicemail")):
        return "NO_ANSWER"
    if "customer-ended-call" in reason or "assistant-ended-call" in reason:
        if any(k in summ for k in ("denied", "did not take", "refused", "nahi")):
            return "DENIED"
        return "CONFIRMED"
    if any(k in summ for k in ("confirmed", "took", "haan", "le liya")):
        return "CONFIRMED"
    if any(k in summ for k in ("denied", "nahi")):
        return "DENIED"
    return "NO_ANSWER"


# ---------- Pass 1: structured transcript reconstruction ----------
def reconstruct_transcript(raw_payload: dict[str, Any]) -> list[dict[str, str]] | None:
    """Try to extract full structured turns from the Vapi raw payload.
    Returns a list of {role, text} dicts, or None if nothing usable was found."""
    if not isinstance(raw_payload, dict):
        return None
    # Prefer artifact.messages (Vapi canonical turn array)
    message_obj = raw_payload.get("message") or raw_payload
    artifact = message_obj.get("artifact") or {}
    messages = (
        artifact.get("messages")
        or message_obj.get("messages")
        or []
    )
    if not isinstance(messages, list) or not messages:
        return None

    out: list[dict[str, str]] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role_raw = (m.get("role") or m.get("type") or "").lower()
        # Vapi roles: 'user', 'assistant', 'system', 'tool', 'bot'
        if role_raw in ("system", "tool"):
            continue
        # Normalize to our schema (user / agent)
        if role_raw in ("assistant", "bot"):
            role = "agent"
        elif role_raw == "user":
            role = "user"
        else:
            continue
        text = m.get("message") or m.get("content") or m.get("text") or ""
        if not isinstance(text, str):
            continue
        text = text.strip()
        if not text:
            continue
        out.append({"role": role, "text": text})

    return out if out else None


# ---------- Migration ----------
def fetch_csv(url: str) -> list[dict[str, str]]:
    resp = requests.get(url, timeout=30, allow_redirects=True)
    resp.raise_for_status()
    return list(csv.DictReader(io.StringIO(resp.text)))


def migrate_parents(rows: list[dict[str, str]], conn, dry_run: bool, log: logging.Logger) -> int:
    """Migrate schedule rows into public.parents.

    Accepts both legacy column names (`phone`, `scheduled_time`, `caregiver_email`)
    and the live medicall-pilot-log schema (`phone_e164`, `dose_time_ist`,
    `caregiver_whatsapp`, `caregiver_name`, `language`). Live-only columns that
    have no destination in our `parents` schema are logged as warnings.
    """
    inserted = 0
    for row in rows:
        name = (row.get("parent_name") or "").strip()
        # Accept either column name for phone
        phone_raw = row.get("phone_e164") or row.get("phone")
        phone = normalize_phone(phone_raw)
        drug = (row.get("drug_name") or "").strip() or "unknown"
        # Accept either column name for time
        scheduled = (
            (row.get("dose_time_ist") or row.get("scheduled_time") or "").strip()
            or None
        )
        # caregiver_email is the destination column; whatsapp doesn't have one yet
        caregiver_email = (row.get("caregiver_email") or "").strip() or None
        cg_whatsapp = (row.get("caregiver_whatsapp") or "").strip()
        if cg_whatsapp and not caregiver_email:
            log.warning(
                f"Parent {name}: caregiver_whatsapp={cg_whatsapp} not stored "
                f"(parents schema has no caregiver_whatsapp column yet). Add via future migration if needed."
            )
        cg_name = (row.get("caregiver_name") or "").strip()
        language = (row.get("language") or "").strip()
        if cg_name or language:
            log.warning(
                f"Parent {name}: caregiver_name='{cg_name}', language='{language}' "
                f"not stored (no destination columns in parents schema yet)."
            )

        if not name or not phone:
            log.warning(f"Parent skipped (missing name/phone): name='{name}' phone='{phone_raw}'")
            continue
        if drug == "unknown":
            log.warning(f"Parent {name} ({phone}) drug_name defaulted to 'unknown'")

        if dry_run:
            inserted += 1
            continue

        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.parents (name, phone, drug_name, scheduled_time, caregiver_email, active)
                values (%s, %s, %s, %s, %s, true)
                on conflict (phone) do update
                  set name = excluded.name,
                      drug_name = excluded.drug_name,
                      scheduled_time = excluded.scheduled_time,
                      caregiver_email = excluded.caregiver_email
                returning id
                """,
                (name, phone, drug, scheduled, caregiver_email),
            )
            inserted += 1
    return inserted


def migrate_call_logs(rows: list[dict[str, str]], conn, dry_run: bool, log: logging.Logger) -> int:
    """Migrate call_logs rows into public.call_logs.

    Filters out Vapi 'status-update' noise — the legacy Apps Script logged ALL
    webhook events (status-update in-progress, status-update ended, end-of-call-report).
    Only end-of-call-report rows carry a real completed call. We keep those by
    checking either `raw_payload.message.type == 'end-of-call-report'` OR the
    practical signal (non-empty transcript_excerpt OR duration_sec > 0).
    """
    inserted = 0
    skipped_noise = 0
    for row in rows:
        timestamp_str = (row.get("timestamp") or "").strip()
        phone = normalize_phone(row.get("phone"))
        outcome = (row.get("outcome") or "NO_ANSWER").upper()
        excerpt = (row.get("transcript_excerpt") or "").strip()
        duration_str = (row.get("duration_sec") or "0").strip()
        stack = (row.get("stack") or "vapi").lower() or "vapi"
        raw_payload_str = (row.get("raw_payload_json") or "").strip()

        if not phone:
            log.warning(f"call_log skipped (missing phone): {row.get('timestamp')}")
            continue

        # Quick peek at raw_payload to detect status-update noise
        is_real_call = bool(excerpt) or False
        try:
            duration_check = int(float(duration_str)) if duration_str else 0
            if duration_check > 0:
                is_real_call = True
        except ValueError:
            pass

        if not is_real_call and raw_payload_str:
            try:
                peek = json.loads(raw_payload_str)
                msg_type = (peek.get("message") or {}).get("type") or ""
                if msg_type.startswith("end-of-call"):
                    is_real_call = True
            except (json.JSONDecodeError, AttributeError):
                pass

        if not is_real_call:
            skipped_noise += 1
            log.info(f"call_log skipped (status-update noise, no transcript/duration): {timestamp_str}")
            continue
        if outcome not in ("CONFIRMED", "DENIED", "ESCALATED", "NO_ANSWER", "ERROR"):
            log.warning(f"call_log {timestamp_str}: outcome '{outcome}' coerced to NO_ANSWER")
            outcome = "NO_ANSWER"

        try:
            duration = int(float(duration_str)) if duration_str else 0
        except ValueError:
            duration = 0

        # Parse raw_payload
        raw_payload: dict[str, Any] | None = None
        if raw_payload_str:
            try:
                raw_payload = json.loads(raw_payload_str)
            except json.JSONDecodeError:
                log.warning(f"call_log {timestamp_str}: raw_payload_json unparseable")
                raw_payload = {"_unparseable": raw_payload_str[:4000]}

        # Pass 1: structured reconstruction
        transcript: list[dict[str, str]] | None = None
        legacy_text: str | None = None
        if isinstance(raw_payload, dict) and "_unparseable" not in raw_payload:
            transcript = reconstruct_transcript(raw_payload)
        if transcript is None:
            # Pass 2: legacy excerpt fallback
            legacy_text = excerpt or None

        # Synthetic call_id (deterministic for idempotency)
        call_id: str | None = None
        if isinstance(raw_payload, dict):
            msg = raw_payload.get("message") or raw_payload
            call_obj = msg.get("call") or {}
            call_id = call_obj.get("id") or raw_payload.get("call", {}).get("id")
        if not call_id:
            ts_compact = re.sub(r"[^0-9]", "", timestamp_str)[:14] or "0"
            call_id = f"legacy-vapi-{ts_compact}-{phone[-4:]}"

        # Reason from ended_reason
        reason = None
        if isinstance(raw_payload, dict):
            msg = raw_payload.get("message") or raw_payload
            reason = msg.get("endedReason")

        # Timestamps
        try:
            started_at = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            ended_at = started_at  # approximate — duration adds happen at DB tier via interval if we need
        except Exception:
            started_at = datetime.now(timezone.utc)
            ended_at = started_at

        if dry_run:
            inserted += 1
            continue

        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.call_logs (
                  call_id, phone, outcome, outcome_source, reason,
                  transcript, legacy_transcript_text, duration_sec,
                  prompt_version, stack, raw_payload, langfuse_trace_id,
                  started_at, ended_at
                ) values (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
                on conflict (call_id) do nothing
                """,
                (
                    call_id, phone, outcome, "keyword_match", reason,
                    json.dumps(transcript) if transcript else None,
                    legacy_text, duration,
                    None, stack,
                    json.dumps(raw_payload) if raw_payload else None,
                    None,
                    started_at, ended_at,
                ),
            )
            inserted += 1
    if skipped_noise > 0:
        log.info(f"  (filtered {skipped_noise} status-update noise rows)")
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(description="Sheet → Supabase migration")
    parser.add_argument("--dry-run", action="store_true", help="Parse + summarize without writing")
    args = parser.parse_args()

    # Logging
    log = logging.getLogger("migrate")
    log.setLevel(logging.INFO)
    fh = logging.FileHandler(LOG_PATH, mode="w", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(fh)
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    log.addHandler(ch)

    if args.dry_run:
        log.info("=" * 60)
        log.info("DRY RUN — no writes will be made")
        log.info("=" * 60)

    # Env checks
    for var in ("SCHEDULE_CSV_URL", "CALL_LOGS_CSV_URL"):
        if not os.environ.get(var):
            log.error(f"{var} env var required")
            return 1
    if not args.dry_run and not SUPABASE_DB_URL:
        log.error("SUPABASE_DB_URL env var required for real run")
        return 1

    log.info(f"Fetching schedule CSV...")
    schedule_rows = fetch_csv(SCHEDULE_CSV_URL)
    log.info(f"  → {len(schedule_rows)} rows")

    log.info(f"Fetching call_logs CSV...")
    call_log_rows = fetch_csv(CALL_LOGS_CSV_URL)
    log.info(f"  → {len(call_log_rows)} rows")

    conn = None
    if not args.dry_run:
        conn = psycopg2.connect(SUPABASE_DB_URL)
        conn.autocommit = False

    try:
        log.info("Migrating parents...")
        parents_n = migrate_parents(schedule_rows, conn, args.dry_run, log)
        log.info(f"  → {parents_n} parents")

        log.info("Migrating call_logs...")
        calls_n = migrate_call_logs(call_log_rows, conn, args.dry_run, log)
        log.info(f"  → {calls_n} call_logs")

        if conn:
            conn.commit()
            log.info("COMMITTED")
        log.info("=" * 60)
        log.info(f"MIGRATION {'DRY-RUN' if args.dry_run else 'COMPLETE'}")
        log.info(f"  parents:   {parents_n}")
        log.info(f"  call_logs: {calls_n}")
        log.info(f"  log file:  {LOG_PATH}")
        log.info("=" * 60)
        return 0
    except Exception as e:
        log.error(f"Migration failed: {e}")
        if conn:
            conn.rollback()
        return 1
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())
