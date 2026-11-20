/** Relative-time formatting and caret helpers for the editor and diff rows. */

export function relTime(ts: number): string {
  const diff = Date.now() - (ts || 0)
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return m + " min ago"
  const h = Math.floor(m / 60)
  if (h < 24) return h + " hr ago"
  const d = Math.floor(h / 24)
  if (d < 30) return d + " days ago"
  return new Date(ts).toLocaleDateString()
}

export function setCaretAt(el: HTMLElement, offset: number): void {
  el.focus()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = null
  while (walker.nextNode()) {
    const len = walker.currentNode.textContent.length
    if (remaining <= len) { node = walker.currentNode; break }
    remaining -= len
  }
  const range = document.createRange()
  if (node) { range.setStart(node, remaining); range.collapse(true) }
  else { range.selectNodeContents(el); range.collapse(false) }
  const sel = window.getSelection()
  if (sel) { sel.removeAllRanges(); sel.addRange(range) }
}
