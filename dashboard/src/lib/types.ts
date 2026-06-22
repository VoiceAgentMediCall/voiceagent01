export type Prompt = {
  id: string
  version: number
  system_prompt: string
  first_message: string
  variables: Record<string, string>
  is_active: boolean
  notes: string | null
  created_at: string
  created_by: string | null
}

export type PromptDraft = Pick<
  Prompt,
  'system_prompt' | 'first_message' | 'variables' | 'notes'
>

export type Outcome = 'CONFIRMED' | 'DENIED' | 'ESCALATED' | 'NO_ANSWER' | 'ERROR'
export type OutcomeSource =
  | 'tool_call'
  | 'json_trailer'
  | 'keyword_match'
  | 'watchdog'
  | 'voicemail_detector'

export type TranscriptMessage = {
  role: 'agent' | 'user'
  text: string
}

export type CallLog = {
  id: string
  call_id: string
  parent_id: string | null
  phone: string
  outcome: Outcome
  outcome_source: OutcomeSource | null
  reason: string | null
  transcript: TranscriptMessage[] | null
  duration_sec: number | null
  prompt_version: number | null
  stack: 'livekit' | 'vapi'
  langfuse_trace_id: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export type Parent = {
  id: string
  name: string
  phone: string
  drug_name: string
  scheduled_time: string | null
  active: boolean
  caregiver_email: string | null
  created_at: string
}

export type ParentDraft = {
  name: string
  phone: string
  drug_name: string
  scheduled_time: string | null
  caregiver_email: string | null
  active: boolean
}

export type EvalRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'errored'

export type EvalScenarioResult = {
  description: string
  passed: boolean
  assertions: { type: string; passed: boolean; reason?: string }[]
}

export type EvalRun = {
  id: string
  triggered_by: string | null
  prompt_version: number | null
  goldenset_sha: string | null
  status: EvalRunStatus
  scenarios_total: number | null
  scenarios_passed: number | null
  results: { scenarios?: EvalScenarioResult[] } | null
  error_log: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}
