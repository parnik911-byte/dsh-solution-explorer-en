import { execFile } from 'node:child_process'

export type GitResult = { ok: true; stdout: string } | { ok: false; error: string }

/**
 * Ceiling for git output buffering. The old sync default (1 MiB) silently
 * failed on repos with large change lists, and the empty result was then
 * rendered as "no commits / no changes" with no indication of why.
 */
export const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024

const GIT_TIMEOUT_MS = 15000

/**
 * Run a git command in the given repo root (async).
 *
 * Uses execFile with an argv array (no shell quoting), so the command line
 * survives Windows cmd.exe tokenization. Async so a slow git cannot stall
 * the host event loop (and with it the terminal SSE stream).
 */
export function git(args: string[], root: string): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd: root,
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
      },
      (err: Error | null, stdout: string, stderr: string) => {
        if (err) {
          const e = err as Error & { stderr?: unknown }
          const stderrText = typeof stderr === 'string' ? stderr : e.stderr
          const message = stderrText && String(stderrText).trim() ? String(stderrText).trim() : err.message
          resolve({ ok: false, error: message })
          return
        }
        // trimEnd (not trim): porcelain status lines start with a status-column
        // space (" M file") that a full trim would eat off the first line, making
        // the first modified file look staged with a mangled path.
        resolve({ ok: true, stdout: String(stdout).trimEnd() })
      },
    )
  })
}

export async function isGitRepo(root: string): Promise<boolean> {
  return (await git(['rev-parse', '--git-dir'], root)).ok
}

/** Remote URL shape: http(s)://, ssh://, or scp-like git@host:path. */
export function isValidRemoteUrl(url: string): boolean {
  return /^(https?:\/\/|ssh:\/\/|git@[\w.-]+:)/.test(url)
}

/** Branch/tag name: no whitespace, control chars or `-` prefix (git ref rules). */
export function isValidRefName(name: string): boolean {
  return name.length > 0 && !/[\s~^:?*[\\]/.test(name) && !name.startsWith('-')
}
