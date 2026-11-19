// A small, forgiving HTML parser for Reddit's rendered Markdown (body_html / selftext_html).
// Html.tsx draws the tree it returns.

export interface Node {
  tag: string
  attrs: Record<string, string>
  children: Array<Node | string>
}

const VOID = new Set(['br', 'hr', 'img'])

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™', deg: '°', times: '×' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** A small, forgiving HTML parser: enough for Reddit's Markdown output. */
export function parseHtml(html: string): Node {
  // Reddit escapes the HTML when raw_json isn't set; unescape once if so.
  if (/^\s*&lt;/.test(html)) html = decodeEntities(html)
  const root: Node = { tag: 'root', attrs: {}, children: [] }
  const stack: Node[] = [root]
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1]
    if (m[3] !== undefined) {
      top.children.push(decodeEntities(m[3]))
      continue
    }
    if (!m[1]) continue
    const tag = m[1].toLowerCase()
    if (m[0][1] === '/') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }
    const attrs: Record<string, string> = {}
    const ar = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g
    let a: RegExpExecArray | null
    while ((a = ar.exec(m[2]))) attrs[a[1].toLowerCase()] = decodeEntities(a[3] ?? a[4] ?? a[5] ?? '')
    const node: Node = { tag, attrs, children: [] }
    top.children.push(node)
    if (!VOID.has(tag) && !m[2].trim().endsWith('/')) stack.push(node)
  }
  return root
}

/** Plain text of a node. */
export function textOf(n: Node | string): string {
  return typeof n === 'string' ? n : n.children.map(textOf).join('')
}

