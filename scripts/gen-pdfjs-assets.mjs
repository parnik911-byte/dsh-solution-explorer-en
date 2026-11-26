/**
 * Copies the installed pdfjs-dist runtime (library, worker, standard fonts,
 * CMaps) into `pdfjs/` at the package root.
 *
 * The browser half fetches these files from the host on the first PDF open
 * (dynamic `import()` of a blob URL) instead of carrying ~4 MB of inlined
 * base64 in the always-loaded client bundle. The host serves them from
 * `pdfjs/` (see src/host/routes/pdfjs.ts); the directory is published with
 * the package (see `files` in package.json) and generated, not committed.
 *
 * Run by `pnpm build` and `pnpm install` (`prepare`); the output is
 * generated, not committed.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'node_modules', 'pdfjs-dist')
const outDir = join(root, 'pdfjs')

if (!existsSync(join(pkg, 'build', 'pdf.min.mjs'))) {
  console.error('[pdfjs-assets] pdfjs-dist not installed — run `pnpm install` first')
  process.exit(1)
}

// Recreate so stale files from an older pdfjs version cannot linger.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

cpSync(join(pkg, 'build', 'pdf.min.mjs'), join(outDir, 'pdf.min.mjs'))
cpSync(join(pkg, 'build', 'pdf.worker.min.mjs'), join(outDir, 'pdf.worker.min.mjs'))
cpSync(join(pkg, 'standard_fonts'), join(outDir, 'standard_fonts'), { recursive: true })
cpSync(join(pkg, 'cmaps'), join(outDir, 'cmaps'), { recursive: true })

console.log(`[pdfjs-assets] copied pdf.min.mjs, pdf.worker.min.mjs, standard_fonts/, cmaps/ → pdfjs/`)
