import { git, isValidRemoteUrl, isValidRefName } from '../git-runner.ts'
import { invalidateGitStatusCache } from '../status.ts'
import { json } from '../http-util.ts'
import type { Handler } from './context.ts'

export const branchRemotePost: Record<string, Handler> = {
  '/solution-explorer/git-remote-add': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const remoteUrl = typeof payload.url === 'string' ? payload.url : ''
    if (!root || !name || !remoteUrl) { json(res, { ok: false, error: { message: 'root, name and url required' } }); return }
    if (!isValidRefName(name) || !isValidRemoteUrl(remoteUrl)) {
      json(res, { ok: false, error: { message: 'Invalid remote name or URL' } }); return
    }
    const result = await git(['remote', 'add', name, remoteUrl], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-remote-remove': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'invalid remote name' } }); return }
    const result = await git(['remote', 'remove', name], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-remote-set-url': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const remoteUrl = typeof payload.url === 'string' ? payload.url : ''
    if (!root || !name || !remoteUrl) { json(res, { ok: false, error: { message: 'root, name and url required' } }); return }
    if (!isValidRefName(name) || !isValidRemoteUrl(remoteUrl)) {
      json(res, { ok: false, error: { message: 'Invalid remote name or URL' } }); return
    }
    const result = await git(['remote', 'set-url', name, remoteUrl], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-create': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const from = typeof payload.from === 'string' && payload.from ? payload.from : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'Invalid branch name' } }); return }
    const args = ['branch', name]
    if (from) { if (!isValidRefName(from)) { json(res, { ok: false, error: { message: 'invalid from ref' } }); return } args.push(from) }
    const result = await git(args, root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-checkout': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const track = payload.track === true
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'Invalid ref name' } }); return }
    // Refuse to switch while the working tree is dirty — git would risk
    // overwriting uncommitted changes with a cryptic error.
    const dirty = await git(['status', '--porcelain'], root)
    if (dirty.ok && dirty.stdout.trimEnd() !== '') {
      json(res, { ok: false, error: { message: 'Workspace has uncommitted changes — commit or discard them before switching branches' } }); return
    }
    // Remote branch click (track=true): create a local tracking branch
    // instead of detaching HEAD — VS Code style checkout.
    if (!track) {
      const result = await git(['checkout', name], root)
      if (result.ok) invalidateGitStatusCache(root)
      json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
      return
    }
    // Remote-branch checkout: resolve origin/HEAD to its target, then
    // reuse an existing local branch instead of failing with --track.
    let target = name
    if (target.endsWith('/HEAD')) {
      const sym = await git(['symbolic-ref', '--short', 'refs/remotes/' + target], root)
      if (!sym.ok) { json(res, { ok: false, error: { message: 'Cannot resolve ' + target } }); return }
      target = sym.stdout.trimEnd()
    }
    const short = target.includes('/') ? target.slice(target.indexOf('/') + 1) : target
    if (short === 'HEAD' || !isValidRefName(short)) {
      json(res, { ok: false, error: { message: 'Invalid branch name' } }); return
    }
    const localExists = (await git(['rev-parse', '--verify', '--quiet', 'refs/heads/' + short], root)).ok
    const args = localExists ? ['checkout', short] : ['checkout', '--track', target]
    const result = await git(args, root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-delete': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const force = payload.force === true
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'Invalid branch name' } }); return }
    const result = await git(['branch', force ? '-D' : '-d', name], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-rename': async ({ res, payload, root }) => {
    const oldName = typeof payload.oldName === 'string' ? payload.oldName : ''
    const newName = typeof payload.newName === 'string' ? payload.newName : ''
    if (!root || !oldName || !newName) { json(res, { ok: false, error: { message: 'root, oldName and newName required' } }); return }
    if (!isValidRefName(oldName) || !isValidRefName(newName)) {
      json(res, { ok: false, error: { message: 'Invalid branch name' } }); return
    }
    const result = await git(['branch', '-m', oldName, newName], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-merge': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'Invalid branch name' } }); return }
    const result = await git(['merge', name], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
  '/solution-explorer/git-branch-publish': async ({ res, payload, root }) => {
    const name = typeof payload.name === 'string' ? payload.name : ''
    if (!root || !name) { json(res, { ok: false, error: { message: 'root and name required' } }); return }
    if (!isValidRefName(name)) { json(res, { ok: false, error: { message: 'Invalid branch name' } }); return }
    const result = await git(['push', '-u', 'origin', name], root)
    if (result.ok) invalidateGitStatusCache(root)
    json(res, result.ok ? { ok: true, value: true } : { ok: false, error: { message: result.error } })
  },
}
