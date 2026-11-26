import type { ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as fsp from 'node:fs/promises'
import * as pathModule from 'node:path'

import { json } from '../http-util.ts'
import type { Handler } from './context.ts'

/**
 * PDF.js runtime delivery (lazy path).
 *
 * The engine (pdf.min.mjs), its worker (pdf.worker.min.mjs) and the font /
 * CMap resources are NOT bundled into the always-loaded client.js (~4 MB).
 * The client fetches them from here on the first PDF open and imports the
 * engine from a blob URL; the worker then fetches its fonts/CMaps from
 * `/solution-explorer/pdfjs/asset`.
 *
 * Files live in `pdfjs/` at the package root, produced by
 * scripts/gen-pdfjs-assets.mjs and published via the `files` field.
 */

const KIND_DIRS: Record<string, string> = {
  standardFontDataUrl: 'standard_fonts',
  cMapUrl: 'cmaps',
}

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Resolve the asset directory regardless of the execution layout: the built
 * host half is a single `lib/index.js` (root = one level up), while running
 * from `src/` (tests, tsx) the package root is three levels up.
 */
async function assetDir(): Promise<string | null> {
  const candidates = [
    new URL('../pdfjs/', import.meta.url),
    new URL('../../../pdfjs/', import.meta.url),
  ]
  for (const candidate of candidates) {
    const dir = fileURLToPath(new URL(candidate))
    if (await fsp.stat(dir).catch(() => null) !== null) return dir
  }
  return null
}

async function serveFile(res: ServerResponse, filePath: string, contentType: string): Promise<void> {
  const stat = await fsp.stat(filePath)
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': String(stat.size),
    // Versioned with the plugin on disk; an hour is fresh enough and keeps
    // repeated PDF opens off the host round-trips.
    'Cache-Control': 'public, max-age=3600',
  })
  const stream = createReadStream(filePath)
  stream.on('error', () => { try { res.destroy() } catch { /* socket gone */ } })
  stream.pipe(res)
}

export const pdfjsGet: Record<string, Handler> = {
  '/solution-explorer/pdfjs/lib': async ({ res }) => {
    const dir = await assetDir()
    if (dir === null) { json(res, { ok: false, error: { message: 'pdfjs assets not built' } }, 404); return }
    try {
      await serveFile(res, pathModule.join(dir, 'pdf.min.mjs'), 'text/javascript; charset=utf-8')
    } catch {
      json(res, { ok: false, error: { message: 'pdfjs lib not found' } }, 404)
    }
  },
  '/solution-explorer/pdfjs/worker': async ({ res }) => {
    const dir = await assetDir()
    if (dir === null) { json(res, { ok: false, error: { message: 'pdfjs assets not built' } }, 404); return }
    try {
      await serveFile(res, pathModule.join(dir, 'pdf.worker.min.mjs'), 'text/javascript; charset=utf-8')
    } catch {
      json(res, { ok: false, error: { message: 'pdfjs worker not found' } }, 404)
    }
  },
  '/solution-explorer/pdfjs/asset': async ({ res, query }) => {
    const dirName = KIND_DIRS[query.kind ?? '']
    const fileName = query.file ?? ''
    if (dirName === undefined || !SAFE_FILENAME.test(fileName) || fileName.includes('..')) {
      json(res, { ok: false, error: { message: 'invalid asset request' } }, 400); return
    }
    const dir = await assetDir()
    if (dir === null) { json(res, { ok: false, error: { message: 'pdfjs assets not built' } }, 404); return }
    try {
      await serveFile(res, pathModule.join(dir, dirName, fileName), fileName.endsWith('.pfb') ? 'application/octet-stream' : 'application/octet-stream')
    } catch {
      json(res, { ok: false, error: { message: 'pdfjs asset not found' } }, 404)
    }
  },
}
