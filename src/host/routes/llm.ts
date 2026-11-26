/**
 * AI-assisted SCM routes — SCM domain, host half.
 *
 * `/solution-explorer/llm-models`             GET  — flatten the host's configured
 *                                                    providers and their models into a
 *                                                    flat `provider|model` list for the
 *                                                    settings picker (refreshed on
 *                                                    `llm/adapters-updated`).
 * `/solution-explorer/llm-generate-commit`    POST — stream a commit-message draft from
 *                                                    the models built on the staged diff,
 *                                                    optionally guided by the repo's
 *                                                    AGENTS.md.
 *
 * The LLM capability is optional: every handler fails cleanly (never throws a raw
 * error) when `ctx.llm` is absent, so non-llm hosts keep working.
 * @module dsh-solution-explorer/host/routes/llm
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { json } from '../http-util.ts'
import { git } from '../git-runner.ts'
import type { LlmLlmLike, Handler, RouteContext, LlmMessage } from './context.ts'

const MODELS_CACHE_MS = 15 * 60 * 1000

/** Module-level flat model cache + last-fetch timestamp (invalidated by adapters-updated). */
let cachedModels: Array<{ provider: string; providerName: string; model: string; name: string }> | null = null
let cachedAt = 0

/** Simple module-level message-id counter (uniqueness is all the structural shape needs). */
let msgSeq = 0

/** Build a structural user message (see LlmMessage) without importing dsh-llm. */
function textMessage(text: string): LlmMessage {
  msgSeq += 1
  return {
    id: `sol-exp-${Date.now()}-${msgSeq}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-solution-explorer' },
  }
}

/**
 * Vision-backend wrapper/chain routes injected by dsh-vision-router (mirror
 * providers such as "DeepSeek + auto image recognition"). They are real `llm` routes but are
 * transport shims, not user-facing chat models, and DSH's own model picker
 * hides them — so we do too, to keep the commit-model list identical.
 *
 * Besides the known stock ids, we also catch user-renamed wrapper/chain routes
 * (vision-router lets you change `wrapperRoute`/`chainRoute`): an id that
 * contains a `vision` token or a display name that says "auto image recognition" is treated
 * as a vision shim. The English `vision` check is scoped to the route id only,
 * never the display name, so a real multimodal provider id like `openai` whose
 * model names mention "vision" is not removed.
 */
function isVisionBackendProvider(id: string, name?: string): boolean {
  if (id === 'vision-http' || id === 'vision-chain' || id === 'deepseek-vision') return true
  if (id.endsWith('-vision')) return true
  if (/\bvision\b|-vision|vision-/i.test(id)) return true
  if (name && /auto image recognition|auto vision/i.test(name)) return true
  return false
}

/** Flatten providers × models into a deduplicated `provider|model` list. */
async function listLlmModels(llm: LlmLlmLike): Promise<Array<{ provider: string; providerName: string; model: string; name: string }>> {
  const out: Array<{ provider: string; providerName: string; model: string; name: string }> = []
  const seen = new Set<string>()
  let providers: Array<{ id: string; name: string }> = []
  try {
    providers = (llm.listProviders() || []).filter((p) => !isVisionBackendProvider(p.id, p.name))
  } catch { providers = [] }
  for (const p of providers) {
    let models: Array<{ provider: string; id: string; name?: string }> = []
    try {
      models = await llm.listModels(p.id) || []
    } catch { models = [] }
    for (const m of models) {
      const key = `${p.id}|${m.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ provider: p.id, providerName: p.name || p.id, model: m.id, name: m.name || m.id })
    }
  }
  return out
}

/** Invalidate the module-level models cache (call on `llm/adapters-updated`). */
export function clearLlmModelsCache(): void {
  cachedModels = null
  cachedAt = 0
}

export const llmGet: Record<string, Handler> = {
  '/solution-explorer/llm-models': async ({ res, llm }: RouteContext) => {
    if (!llm) {
      json(res, { ok: false, error: { message: 'AI model service unavailable (host has no llm mounted)' } })
      return
    }
    const now = Date.now()
    try {
      if (!cachedModels || now - cachedAt > MODELS_CACHE_MS) {
        cachedModels = await listLlmModels(llm)
        cachedAt = now
      }
      json(res, { ok: true, value: cachedModels })
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
    }
  },
}

export const llmPost: Record<string, Handler> = {
  '/solution-explorer/llm-generate-commit': async ({ res, payload, root, llm, getConfig }: RouteContext) => {
    if (!llm) {
      json(res, { ok: false, error: { message: 'AI model service unavailable (host has no llm mounted)' } })
      return
    }
    // Model route: explicit provider/model wins; otherwise fall back to the
    // saved `commitModel` setting (`provider|model`), so the client needs no
    // settings round-trip to know which model is configured.
    let provider = typeof payload.provider === 'string' ? payload.provider : ''
    let model = typeof payload.model === 'string' ? payload.model : ''
    if ((!provider || !model) && getConfig) {
      const saved = getConfig().commitModel || ''
      const sep = saved.indexOf('|')
      if (sep > 0) { provider = provider || saved.slice(0, sep); model = model || saved.slice(sep + 1) }
    }
    if (!provider || !model) {
      json(res, { ok: false, error: { message: 'No AI model configured' } })
      return
    }
    if (!root) {
      json(res, { ok: false, error: { message: 'root required' } })
      return
    }

    // Staged diff = what will be committed.
    const diffResult = await git(['diff', '--cached'], root)
    const diff = diffResult.ok ? diffResult.stdout : ''
    if (!diff.trim()) {
      json(res, { ok: false, error: { message: 'No staged changes to summarize' } })
      return
    }

    // Optional repo-level AGENTS.md guidance (best effort, first match wins).
    let repoGuide = ''
    for (const name of ['AGENTS.md', 'agents.md']) {
      try {
        const p = path.resolve(root, name)
        repoGuide = await readFile(p, 'utf8')
        if (repoGuide.trim()) break
      } catch { /* missing or unreadable — keep trying / fall through */ }
    }

    const system = [
      'You are an expert Git commit-message writer. Generate one concise, accurate, conventional commit message from the given diff.',
      'Requirements:',
      '- The first line is type + short summary; the type comes from Conventional Commits (feat/fix/docs/style/refactor/perf/test/chore)',
      '- Write the summary in English, starting with a verb phrase (e.g. "Add", "Fix", "Refactor"), at most 60 characters',
      '- If needed, add a few body lines after the summary with scope or reason; keep it concise',
      '- Output only the commit message itself, with no explanation, prefix, or code fences',
    ].join('\n')

    const repoSection = repoGuide.trim()
      ? `\n\nCommit conventions from this repo's AGENTS.md (prefer them; use only as style guidance, do not copy verbatim):\n${repoGuide.slice(0, 4000)}`
      : ''

    const user = `Here is the staged diff for this commit:\n\n${diff.slice(-6000)}\n${repoSection}`

    let text = ''
    let failed = false
    try {
      const stream = llm.stream({
        provider,
        model,
        system,
        messages: [textMessage(user)],
        maxTokens: 1000,
      })
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta' && chunk.text) text += chunk.text
        if (chunk.type === 'finish') {
          const reason = (chunk as { reason?: { kind?: string } }).reason
          if (reason?.kind === 'error' || reason?.kind === 'aborted') failed = true
        }
      }
    } catch (err) {
      json(res, { ok: false, error: { message: err instanceof Error ? err.message : String(err) } })
      return
    }

    const cleaned = text.trim()
    if (failed || !cleaned) {
      json(res, { ok: false, error: { message: failed ? 'Model call failed' : 'Model returned no content' } })
      return
    }
    json(res, { ok: true, value: cleaned })
  },
}