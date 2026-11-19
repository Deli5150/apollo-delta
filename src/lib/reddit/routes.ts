// Which Reddit host to ask for a page. Signed in with a web session (no API key), www.reddit.com
// serves most JSON, but Reddit answers some paths there with its block page while another host
// still serves them to the same cookie. Each path pattern has an ordered list of hosts; a block
// page moves the request on to the next one, and a host that keeps blocking a pattern cools down.
//
// The built-in table can be changed without an app update: routes.json in the GitHub repo
// (fetched now and then, see loadRouteUpdates) has the same shape as BUILT_IN.

export type Host = 'www' | 'oauth' | 'old' | 'api'

export interface Route {
  host: Host
  /** `/api/<endpoint>/.json` instead of `/api/<endpoint>.json` (www only answers some that way). */
  dotjson?: boolean
}

export type RouteTable = Record<string, Array<Host | `${Host}-dotjson`>>

/** Patterns: `/`-separated segments; `*` = one name, `+` = names joined with `+` (a multireddit). */
export const BUILT_IN: RouteTable = {
  'GET /hot': ['oauth', 'www'],
  'GET /new': ['oauth', 'www'],
  'GET /rising': ['oauth', 'www'],
  'GET /r/*/hot': ['oauth', 'www'],
  'GET /r/*/new': ['oauth', 'www'],
  'GET /r/*/rising': ['oauth', 'www'],
  'GET /r/+/hot': ['oauth', 'www'],
  'GET /r/+/new': ['oauth', 'www'],
  'GET /r/+/rising': ['oauth', 'www'],
  'GET /r/*': ['oauth', 'www'],
  'GET /r/+': ['oauth', 'www'],
  'GET /': ['oauth', 'www'],
  'GET /r/all': ['oauth', 'api', 'old'],
  'GET /r/all/*': ['oauth', 'api', 'old'],
  'GET /search': ['oauth', 'old'],
  'GET /subreddits/search': ['oauth', 'old'],
  'GET /r/*/search': ['oauth', 'old'],
  'GET /r/+/search': ['oauth', 'old'],
  'GET /api/info': ['oauth', 'www-dotjson', 'old'],
  'GET /api/morechildren': ['oauth', 'www-dotjson', 'old'],
  'POST /api/morechildren': ['oauth', 'www-dotjson', 'old']
}

/** Everything else: www first, then oauth (which serves the same cookie for most reads). */
const DEFAULT_READ: Host[] = ['www', 'oauth']

let overrides: RouteTable = {}

export function setRouteOverrides(table: RouteTable): void {
  overrides = table
}

const segments = (p: string) => p.split('/').filter(Boolean)

/** How specific a pattern is: literals beat wildcards, left to right. */
function matches(pattern: string, path: string): number[] | null {
  const ps = segments(pattern)
  const xs = segments(path)
  if (ps.length !== xs.length) return null
  const score: number[] = []
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    let x = xs[i].toLowerCase()
    // r/all's filter forms (r/all-sub-sub, r/all+sub) count as r/all.
    if (i === 1 && xs[0] === 'r' && /^all[-+]/.test(x)) x = 'all'
    if (p === '*') {
      if (x.includes('+')) return null
      score.push(1)
    } else if (p === '+') {
      if (!x.includes('+')) return null
      score.push(1)
    } else if (p === x) score.push(2)
    else return null
  }
  return score
}

const better = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** The pattern key (for health tracking) and hosts to try, in order, for a request. */
export function routesFor(method: string, path: string): { key: string; routes: Route[] } {
  const clean = path.replace(/\.json$/, '').replace(/\/+$/, '') || '/'
  let best: { key: string; score: number[]; list: string[] } | null = null
  for (const table of [BUILT_IN, overrides]) {
    for (const [key, list] of Object.entries(table)) {
      const [m, pattern] = key.split(' ')
      if (m !== method) continue
      const score = pattern === '/' ? (clean === '/' ? [2] : null) : matches(pattern, clean)
      // A file entry with the same pattern replaces the built-in one (>=, and it's looked at second).
      if (score && (!best || better(score, best.score) || (best.key === key && table === overrides))) best = { key, score, list }
    }
  }
  const list = best?.list ?? (method === 'GET' ? DEFAULT_READ : ['www'])
  return {
    key: best?.key ?? `${method} ${clean.replace(/^\/r\/[^/]+/, '/r/*').replace(/^\/(user|u)\/[^/]+/, '/user/*')}`,
    routes: list.map((r) => (r.endsWith('-dotjson') ? { host: r.slice(0, -8) as Host, dotjson: true } : { host: r as Host }))
  }
}

/** The URL for a path on a host, with `.json` where Reddit wants it. */
export function routeUrl(route: Route, path: string, query: string): string {
  const base = `https://${route.host}.reddit.com`
  let p = path.replace(/\/+$/, '') || '/'
  if (!p.endsWith('.json')) {
    if (p.startsWith('/api/')) p = route.dotjson ? `${p}/.json` : `${p}.json`
    else p = p === '/' ? '/.json' : `${p}.json`
  }
  return `${base}${p}${query ? `?${query}` : ''}`
}

// ── Health ─────────────────────────────────────────────────────────────────────────────────
// Three block pages in a row put a host on cooldown for that pattern: an hour, doubling to eight.

interface Health {
  fails: number
  until: number
  cooldowns: number
}

const health = new Map<string, Health>()
const hkey = (key: string, host: Host) => `${key}|${host}`

export function isCoolingDown(key: string, route: Route, now = Date.now()): boolean {
  return (health.get(hkey(key, route.host))?.until ?? 0) > now
}

export function noteResult(key: string, route: Route, blocked: boolean, now = Date.now()): void {
  const k = hkey(key, route.host)
  const h = health.get(k) ?? { fails: 0, until: 0, cooldowns: 0 }
  if (!blocked) {
    health.set(k, { fails: 0, until: 0, cooldowns: Math.max(0, h.cooldowns - 1) })
    return
  }
  h.fails++
  if (h.fails >= 3) {
    h.until = now + Math.min(8, 2 ** h.cooldowns) * 3600_000
    h.cooldowns++
    h.fails = 0
  }
  health.set(k, h)
}

/** For Settings → Routes: each pattern's hosts and whether they're cooling down. */
export function routeHealth(): Array<{ key: string; host: Host; fails: number; until: number }> {
  return [...health.entries()].map(([k, h]) => {
    const i = k.lastIndexOf('|')
    return { key: k.slice(0, i), host: k.slice(i + 1) as Host, fails: h.fails, until: h.until }
  })
}

export function resetRouteHealth(): void {
  health.clear()
}

const ROUTES_URL = 'https://raw.githubusercontent.com/Deli5150/apollo-delta/main/routes.json'

/** Fetches the repo's route table (ignored if it isn't valid). */
export async function loadRouteUpdates(): Promise<number> {
  try {
    const res = await fetch(ROUTES_URL, { cache: 'no-cache' })
    if (!res.ok) return 0
    const j = (await res.json()) as { version?: number; endpoints?: Record<string, { routes: string[] }> }
    if (j.version !== 1 || !j.endpoints) return 0
    const table: RouteTable = {}
    for (const [key, v] of Object.entries(j.endpoints)) {
      if (!/^(GET|POST) \//.test(key) || !Array.isArray(v.routes)) continue
      const list = v.routes.filter((r) => /^(www|oauth|old|api)(-dotjson)?$/.test(r)) as RouteTable[string]
      if (list.length) table[key] = list.slice(0, 5)
    }
    setRouteOverrides(table)
    return Object.keys(table).length
  } catch {
    return 0
  }
}
