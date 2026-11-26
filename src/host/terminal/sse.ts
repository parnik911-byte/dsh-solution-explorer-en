import type { ServerResponse } from 'node:http'

import { json } from '../http-util.ts'
import type { TermChunk, TerminalState } from './state.ts'

/** Comment-heartbeat cadence: keeps idle proxies/NATs from dropping the stream. */
const HEARTBEAT_MS = 30000

/**
 * After the last stream closes, sessions survive this long so a client
 * reconnect (page reload, transient drop) reattaches to live shells
 * instead of losing them; only a longer absence kills everything.
 */
const DISCONNECT_GRACE_MS = 60000

/**
 * The single multiplexed SSE stream: every terminal session's output flows
 * through one long-lived connection (browsers cap concurrent HTTP/1.1
 * connections per origin, so per-tab streams would starve after ~3 terminals).
 */
export function createTerminalStream(state: TerminalState, deps: { killAllSessions(): void }) {
  let pendingKill: ReturnType<typeof setTimeout> | null = null
  const handler = (res: ServerResponse): void => {
    if (state.terminalStreamOn) { json(res, { ok: false, error: { message: 'terminal stream already open' } }, 409); return }
    // A new stream cancels a pending disconnect kill: the owner is back.
    if (pendingKill !== null) { clearTimeout(pendingKill); pendingKill = null }
    state.terminalStreamOn = true
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.write(':ok\n\n')
    const heartbeat = setInterval(() => {
      if (!res.writable) return
      try { res.write(': ping\n\n') } catch { /* socket gone — close will clean up */ }
    }, HEARTBEAT_MS)
    // Keep the interval from outliving the response or the process.
    if (typeof heartbeat.unref === 'function') heartbeat.unref()
    const onMsg = (m: TermChunk): void => {
      if (!res.writable) return
      if (m.end) res.write(`event: end\ndata: ${m.id}\n\n`)
      else res.write(`event: t\ndata: ${m.id}|${m.data}\n\n`)
    }
    state.termListeners.add(onMsg)
    const cleanup = (): void => {
      clearInterval(heartbeat)
      state.termListeners.delete(onMsg)
      state.terminalStreamOn = false
      // Grace period: a reconnect inside it reattaches to the same shells.
      if (pendingKill !== null) clearTimeout(pendingKill)
      pendingKill = setTimeout(() => {
        pendingKill = null
        deps.killAllSessions()
      }, DISCONNECT_GRACE_MS)
      if (typeof pendingKill.unref === 'function') pendingKill.unref()
    }
    res.on('close', cleanup)
  }
  return handler
}
