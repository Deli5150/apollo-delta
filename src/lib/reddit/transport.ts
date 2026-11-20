import { create } from 'zustand'
import { desktop, type AccountInfo, type RedditRequest, type RedditResponse } from '../storage'
import { demoTransport, isDemo } from './demo'
import { mobileTransport } from './mobile'
import { isCoolingDown, noteResult, routesFor, routeUrl } from './routes'

// Sends requests to Reddit as the current account: picks the host for the path (routes.ts), moves
// on to the next host when one answers with Reddit's block page, and keeps track of the rate limit.
// The desktop app sends them from its main process (desktop/reddit.cjs); phones from mobile.ts.

export interface Transport {
  accounts(): Promise<AccountInfo[]>
  signIn(reauthId?: string): Promise<AccountInfo | null>
  browser?(): Promise<string | null>
  signInWithBrowser?(reauthId?: string): Promise<AccountInfo | null>
  cancelBrowser?(): Promise<void>
  signOut(id: string): Promise<void>
  refresh(id: string): Promise<(AccountInfo & { expired?: boolean; me?: any }) | null>
  reorder(ids: string[]): Promise<void>
  request(id: string | null, req: RedditRequest): Promise<RedditResponse>
  upload(id: string, file: { name: string; mimetype: string; base64: string }): Promise<{ url?: string; assetId?: string; error?: string }>
}

const real: Transport = desktop?.reddit ?? mobileTransport

/** The real transport, or the demo's made-up Reddit when the app was opened in demo mode. */
export const transport: Transport = {
  accounts: () => (isDemo() ? demoTransport : real).accounts(),
  signIn: (reauthId) => (isDemo() ? demoTransport : real).signIn(reauthId),
  browser: real.browser && (() => real.browser!()),
  signInWithBrowser: real.signInWithBrowser && ((reauthId) => (isDemo() ? demoTransport.signIn() : real.signInWithBrowser!(reauthId))),
  cancelBrowser: real.cancelBrowser && (() => real.cancelBrowser!()),
  signOut: (id) => (isDemo() ? demoTransport : real).signOut(id),
  refresh: (id) => (isDemo() ? demoTransport : real).refresh(id),
  reorder: (ids) => (isDemo() ? demoTransport : real).reorder(ids),
  request: (id, req) => (isDemo() ? demoTransport : real).request(id, req),
  upload: (id, file) => (isDemo() ? demoTransport : real).upload(id, file)
}

interface Session {
  accounts: AccountInfo[]
  current: string | null
  /** The current account's own details (from /api/me): karma, inbox count, … */
  me: any | null
  expired: boolean
  ratelimit: { remaining?: number; resetAt?: number }
  loaded: boolean
}

export const useSession = create<Session>(() => ({ accounts: [], current: null, me: null, expired: false, ratelimit: {}, loaded: false }))

export const currentAccount = (): AccountInfo | undefined => {
  const s = useSession.getState()
  return s.accounts.find((a) => a.id === s.current)
}

export const myName = (): string | undefined => currentAccount()?.username

export class RedditError extends Error {
  constructor(
    message: string,
    public status = 0,
    public kind: 'blocked' | 'ratelimit' | 'auth' | 'network' | 'reddit' | 'notfound' = 'reddit'
  ) {
    super(message)
  }
}

const query = (params?: Record<string, string | number | boolean | undefined | null>): string =>
  Object.entries({ raw_json: 1, ...params } as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')

/** Waits out a hit rate limit instead of failing the request (up to a minute). */
async function waitForRateLimit(): Promise<void> {
  const { remaining, resetAt } = useSession.getState().ratelimit
  if (remaining === undefined || remaining > 1 || !resetAt) return
  const wait = resetAt - Date.now()
  if (wait > 0 && wait < 60_000) await new Promise((r) => setTimeout(r, wait + 250))
}

function noteRateLimit(res: RedditResponse) {
  const rl = res.ratelimit
  if (rl?.remaining !== undefined) useSession.setState({ ratelimit: { remaining: rl.remaining, resetAt: rl.reset ? Date.now() + rl.reset * 1000 : undefined } })
}

/**
 * GET (or a read-only POST) of a Reddit path, by whichever host serves it. Returns the JSON.
 */
export async function get(path: string, params?: Record<string, string | number | boolean | undefined | null>, method: 'GET' | 'POST' = 'GET', form?: RedditRequest['form']): Promise<any> {
  const id = useSession.getState().current
  if (!id) throw new RedditError('Sign in to Reddit to load this.', 401, 'auth')
  const { key, routes } = routesFor(method, path)
  const live = routes.filter((r) => !isCoolingDown(key, r))
  const order = live.length ? live : routes
  let last: RedditResponse | null = null
  await waitForRateLimit()
  for (const route of order) {
    const url = routeUrl(route, path, method === 'GET' ? query(params) : query())
    const res = await transport.request(id, { url, method, form: method === 'POST' ? { ...params, ...form } as RedditRequest['form'] : undefined })
    noteRateLimit(res)
    last = res
    if (res.status === 0) throw new RedditError(res.error ? `Couldn't reach Reddit (${res.error})` : "Couldn't reach Reddit", 0, 'network')
    if (res.blocked || (res.status === 403 && !res.json)) {
      noteResult(key, route, true)
      continue
    }
    noteResult(key, route, false)
    if (res.status === 429) throw new RedditError("Reddit's rate limit was reached. Posts will load again when it resets.", 429, 'ratelimit')
    if (res.status === 404) throw new RedditError(res.json?.reason === 'banned' ? 'This community is banned.' : 'Not found.', 404, 'notfound')
    if (res.status === 403 && res.json) {
      const reason = res.json.reason
      throw new RedditError(reason === 'private' ? 'This community is private.' : reason === 'quarantined' ? 'This community is quarantined.' : reason === 'gold_only' ? 'This community is premium-only.' : 'Reddit refused this.', 403, 'reddit')
    }
    if (res.status === 401) {
      useSession.setState({ expired: true })
      throw new RedditError('Your Reddit session has expired. Sign in again.', 401, 'auth')
    }
    if (res.status >= 500) throw new RedditError(`Reddit is having trouble (${res.status}). Try again in a moment.`, res.status, 'reddit')
    if (!res.json) throw new RedditError(`Reddit answered something unexpected (${res.status}).`, res.status, 'reddit')
    return res.json
  }
  // Every host answered with the block page: usually a signed-out (or expired) session.
  if (last?.url && /\/login/.test(last.url)) useSession.setState({ expired: true })
  throw new RedditError('Reddit blocked this request. If it keeps happening, sign in again (Settings → Accounts).', 403, 'blocked')
}

/** A write (vote, comment, …), always to www.reddit.com with the session's modhash. */
export async function post(path: string, form: RedditRequest['form'] = {}): Promise<any> {
  const id = useSession.getState().current
  if (!id) throw new RedditError('Sign in to Reddit first.', 401, 'auth')
  const url = `https://www.reddit.com${path}${path.includes('.json') ? '' : ''}`
  const res = await transport.request(id, { url, method: 'POST', form: { api_type: 'json', raw_json: 1, ...form } })
  noteRateLimit(res)
  if (res.status === 0) throw new RedditError("Couldn't reach Reddit", 0, 'network')
  if (res.status === 429) throw new RedditError('Slow down: Reddit is rate limiting you. Try again in a minute.', 429, 'ratelimit')
  if (res.blocked || res.status === 403) throw new RedditError("Reddit didn't accept this. Try signing in again (Settings → Accounts).", 403, 'blocked')
  if (res.status >= 400) throw new RedditError(res.json?.message ?? `Reddit answered ${res.status}`, res.status)
  const errors = res.json?.json?.errors as Array<[string, string, string?]> | undefined
  if (errors?.length) {
    const [code, msg] = errors[0]
    throw new RedditError(code === 'RATELIMIT' ? msg : msg || code, res.status)
  }
  return res.json ?? {}
}

/** Loads the signed-in accounts and picks the current one (last used, else the first). */
export async function loadAccounts(preferred?: string | null): Promise<void> {
  const accounts = await transport.accounts()
  const current = accounts.find((a) => a.id === preferred)?.id ?? accounts[0]?.id ?? null
  useSession.setState({ accounts, current, loaded: true })
  if (current) void refreshMe()
}

/** Reads the account's details again (karma, unread count) and its latest write token. */
export async function refreshMe(): Promise<any | null> {
  const id = useSession.getState().current
  if (!id) return null
  const r = await transport.refresh(id).catch(() => null)
  if (!r) return null
  useSession.setState((s) => ({ me: r.me ?? s.me, expired: Boolean(r.expired), accounts: s.accounts.map((a) => (a.id === id ? { ...a, icon: r.icon, hasModhash: r.hasModhash } : a)) }))
  return r.me ?? null
}

/** Signs in: in the app's own window, or (`google`) in a real browser, where Google and Apple sign-in work. */
export async function signIn(reauthId?: string, google = false): Promise<AccountInfo | null> {
  const a = google && transport.signInWithBrowser ? await transport.signInWithBrowser(reauthId) : await transport.signIn(reauthId)
  if (!a) return null
  const accounts = await transport.accounts()
  useSession.setState({ accounts, current: a.id, expired: false, me: null })
  void refreshMe()
  return a
}

export async function signOut(id: string): Promise<void> {
  await transport.signOut(id)
  const accounts = await transport.accounts()
  const s = useSession.getState()
  const current = s.current === id ? (accounts[0]?.id ?? null) : s.current
  useSession.setState({ accounts, current, me: s.current === id ? null : s.me })
  if (current && current !== s.current) void refreshMe()
}

export function switchAccount(id: string): void {
  useSession.setState({ current: id, me: null, expired: false })
  void refreshMe()
}
