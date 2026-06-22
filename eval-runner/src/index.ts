import Fastify from 'fastify'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'

const execAsync = promisify(exec)

// ---------- Config ----------
const SUPABASE_URL = required('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_DB_URL = required('SUPABASE_DB_URL') // direct connection for LISTEN (port 5432)
const GROQ_API_KEY = required('GROQ_API_KEY')
const GOLDENSET_PATH =
  process.env.GOLDENSET_PATH ?? path.resolve(__dirname, '../../evals/goldenset.yaml')
const PORT = parseInt(process.env.PORT ?? '3000', 10)

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} env var required`)
  return v
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------- Types ----------
type EvalScenarioResult = {
  description: string
  passed: boolean
  assertions: { type: string; passed: boolean; reason?: string }[]
}

// ---------- HTTP server (health + manual trigger) ----------
const app = Fastify({ logger: { level: 'info' } })

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }))

app.post<{ Params: { id: string } }>('/run/:id', async (req, reply) => {
  const { id } = req.params
  if (!id) return reply.code(400).send({ error: 'id required' })
  runEval(id).catch((e) => app.log.error({ id, err: e.message }, 'run failed'))
  return { queued: id }
})

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})

// ---------- LISTEN/NOTIFY worker ----------
async function startWorker() {
  const pg = new Client({ connectionString: SUPABASE_DB_URL })
  await pg.connect()
  await pg.query('LISTEN eval_runs_queue')
  app.log.info('listening on eval_runs_queue')

  pg.on('notification', (msg) => {
    if (!msg.payload) return
    try {
      const { id } = JSON.parse(msg.payload)
      if (typeof id === 'string') {
        app.log.info({ id }, 'received notify')
        runEval(id).catch((e) => app.log.error({ id, err: e.message }, 'run failed'))
      }
    } catch (e) {
      app.log.warn(
        { payload: msg.payload, err: (e as Error).message },
        'invalid notify payload',
      )
    }
  })

  pg.on('error', (e) => {
    app.log.error(
      { err: e.message },
      'pg client error — exiting so railway restarts us',
    )
    process.exit(1)
  })
}

// ---------- Main run logic ----------
async function runEval(evalRunId: string): Promise<void> {
  app.log.info({ evalRunId }, 'starting run')

  await supabase
    .from('eval_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', evalRunId)

  try {
    // 1. Fetch active prompt
    const { data: activePrompt, error: promptErr } = await supabase
      .from('prompts')
      .select('version, system_prompt, first_message, variables')
      .eq('is_active', true)
      .maybeSingle()

    if (promptErr) throw new Error(`prompt fetch: ${promptErr.message}`)
    if (!activePrompt) {
      throw new Error('no active prompt — bootstrap one via /admin')
    }

    // 2. Load goldenset.yaml
    const baseYaml = await fs.readFile(GOLDENSET_PATH, 'utf-8')
    const goldenset = yaml.load(baseYaml) as Record<string, unknown>

    // 3. Inject the live system_prompt + first_message into the goldenset
    //    The B8-emitted goldenset has `prompts:` as a list. Replace it with the live content.
    goldenset.prompts = [
      {
        id: `medicall-prompt-v${activePrompt.version}`,
        raw: `${activePrompt.system_prompt}\n\nFirst message: ${activePrompt.first_message}`,
      },
    ]

    // 4. Write a temp config file
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `eval-${evalRunId}-`))
    const cfgPath = path.join(tmpDir, 'goldenset.yaml')
    await fs.writeFile(cfgPath, yaml.dump(goldenset), 'utf-8')
    const outPath = path.join(tmpDir, 'result.json')

    // 5. Run Promptfoo
    const env = {
      ...process.env,
      GROQ_API_KEY,
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_NO_COLOR: '1',
    }
    const cmd = `npx --yes promptfoo@latest eval --config "${cfgPath}" --output "${outPath}" --no-progress-bar`
    app.log.info({ cmd }, 'invoking promptfoo')
    try {
      await execAsync(cmd, { env, maxBuffer: 100 * 1024 * 1024 })
    } catch (e) {
      // Promptfoo exits non-zero on scenario failures, but still writes result.json.
      // Only treat as fatal if result.json wasn't produced.
      const exists = await fs
        .access(outPath)
        .then(() => true)
        .catch(() => false)
      if (!exists) throw new Error(`promptfoo crashed: ${(e as Error).message}`)
    }

    // 6. Parse and normalize
    const raw = JSON.parse(await fs.readFile(outPath, 'utf-8'))
    const { scenarios, total, passed } = normalizePromptfooOutput(raw)

    // 7. Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true })

    // 8. Write back
    await supabase
      .from('eval_runs')
      .update({
        status: passed === total ? 'passed' : 'failed',
        scenarios_total: total,
        scenarios_passed: passed,
        results: { scenarios },
        finished_at: new Date().toISOString(),
      })
      .eq('id', evalRunId)

    app.log.info({ evalRunId, passed, total }, 'run complete')
  } catch (err) {
    app.log.error({ evalRunId, err: (err as Error).message }, 'run errored')
    await supabase
      .from('eval_runs')
      .update({
        status: 'errored',
        error_log: (err as Error).message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', evalRunId)
  }
}

// ---------- Normalization ----------
function normalizePromptfooOutput(raw: any): {
  scenarios: EvalScenarioResult[]
  total: number
  passed: number
} {
  // Defensive lookup — Promptfoo's JSON shape varies between versions.
  const resultsArr: any[] = raw?.results?.results ?? raw?.results ?? []

  const scenarios: EvalScenarioResult[] = resultsArr.map((r: any) => {
    const description: string =
      r?.testCase?.description ??
      r?.description ??
      r?.testIdx?.toString() ??
      'unnamed'

    const passed: boolean =
      r?.success ?? r?.gradingResult?.pass ?? r?.pass ?? false

    const componentResults: any[] =
      r?.gradingResult?.componentResults ?? r?.componentResults ?? []

    const assertions = componentResults.map((c: any) => ({
      type: c?.assertion?.type ?? c?.type ?? 'unknown',
      passed: c?.pass ?? false,
      reason: c?.reason && c.reason.length < 240 ? c.reason : undefined,
    }))

    return { description, passed, assertions }
  })

  const total = scenarios.length
  const passed = scenarios.filter((s) => s.passed).length
  return { scenarios, total, passed }
}

// ---------- Boot ----------
startWorker().catch((e) => {
  app.log.error({ err: e.message }, 'worker boot failed')
  process.exit(1)
})
