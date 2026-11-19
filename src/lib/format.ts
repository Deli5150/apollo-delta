// Numbers and times the way Apollo shows them: 12.3k, 4h, 2y.

export function compact(n: number): string {
  const a = Math.abs(n)
  if (a < 1000) return String(n)
  if (a < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (a < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
}

/** "now", "5m", "3h", "2d", "4mo", "1y". */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return 'now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h`
  const d = h / 24
  if (d < 30) return `${Math.floor(d)}d`
  const mo = d / 30.44
  if (mo < 12) return `${Math.floor(mo)}mo`
  return `${Math.floor(d / 365.25)}y`
}

/** The full date and time, for tapping a timestamp. */
export function fullDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const plural = (n: number, one: string, many = `${one}s`) => `${compact(n)} ${n === 1 ? one : many}`

/** Reddit's own link for a permalink. */
export const redditUrl = (permalink: string) => `https://www.reddit.com${permalink}`
