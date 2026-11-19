import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'
import DeltaReddit from '../../../modules/delta-reddit/src/DeltaRedditModule'
import type { AccountInfo, RedditRequest, RedditResponse } from '../storage'
import type { Transport } from './transport'

// Reddit without an API key on Android: you sign in on reddit.com in a WebView (SignInHost in
// src/ui/WebSignIn.tsx), and the session's cookies are read natively (modules/delta-reddit) and kept
// per account in the phone's secure storage. Requests go through the native module with that
// account's cookies, a browser User-Agent and (for writes) its modhash, like the desktop app's main
// process. Elsewhere (iPhone, a plain browser) signing in isn't available yet.

export const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'

interface Stored {
  id: string
  username: string
  modhash: string
  icon?: string
  addedAt: number
}

const LIST = 'delta.accounts'
// Secure storage values are kept small: a session's cookies go in pieces.
const PIECE = 1800
const cookieKey = (id: string, i: number) => `delta.cookie.${id.replace(/[^\w.-]/g, '')}.${i}`

async function readList(): Promise<Stored[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(LIST)) ?? '[]')
  } catch {
    return []
  }
}

const writeList = (list: Stored[]) => SecureStore.setItemAsync(LIST, JSON.stringify(list))

async function writeCookies(id: string, header: string): Promise<void> {
  await clearStoredCookies(id)
  const parts = header.match(new RegExp(`[\\s\\S]{1,${PIECE}}`, 'g')) ?? []
  for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(cookieKey(id, i), parts[i])
}

const cookieCache = new Map<string, string>()

async function readCookies(id: string): Promise<string> {
  const cached = cookieCache.get(id)
  if (cached !== undefined) return cached
  let header = ''
  for (let i = 0; i < 20; i++) {
    const part = await SecureStore.getItemAsync(cookieKey(id, i))
    if (part === null) break
    header += part
  }
  cookieCache.set(id, header)
  return header
}

async function clearStoredCookies(id: string): Promise<void> {
  cookieCache.delete(id)
  for (let i = 0; i < 20; i++) {
    const key = cookieKey(id, i)
    if ((await SecureStore.getItemAsync(key)) === null) break
    await SecureStore.deleteItemAsync(key)
  }
}

const publicAccount = (a: Stored): AccountInfo => ({ id: a.id, username: a.username, icon: a.icon, hasModhash: Boolean(a.modhash) })

const uuid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// ── Sign-in, shown by WebSignInHost ─────────────────────────────────────────────────────────

interface Pending {
  id: string
  resolve: (a: AccountInfo | null) => void
}

export const useWebSignIn = create<{ pending: Pending | null }>(() => ({ pending: null }))

/** Called by the WebView once Reddit says you're signed in. */
export async function finishWebSignIn(me: { name: string; modhash: string; icon?: string } | null): Promise<void> {
  const pending = useWebSignIn.getState().pending
  if (!pending) return
  useWebSignIn.setState({ pending: null })
  if (!me || !DeltaReddit) {
    await DeltaReddit?.clearCookies()
    return pending.resolve(null)
  }
  // The WebView's cookies for reddit.com (httpOnly ones too), then a clean WebView for next time.
  const header = DeltaReddit.getCookies('https://www.reddit.com')
  await DeltaReddit.clearCookies()
  let list = await readList()
  // Signed in again to an account you already have: replace its session.
  const existing = list.find((a) => a.id === pending.id || a.username.toLowerCase() === me.name.toLowerCase())
  const id = existing?.id ?? pending.id
  await writeCookies(id, header)
  const account: Stored = { id, username: me.name, modhash: me.modhash, icon: me.icon, addedAt: existing?.addedAt ?? Date.now() }
  list = existing ? list.map((a) => (a.id === id ? account : a)) : [...list, account]
  await writeList(list)
  pending.resolve(publicAccount(account))
}

// ── Requests ─────────────────────────────────────────────────────────────────────────────────

function encodeForm(form: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(form)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

async function request(id: string | null, req: RedditRequest): Promise<RedditResponse> {
  if (!DeltaReddit) return { status: 0, error: 'not available on this device' }
  if (!/^https:\/\/([a-z0-9-]+\.)?(reddit\.com|redd\.it|redditmedia\.com)\//.test(req.url)) return { status: 0, error: 'not a Reddit URL' }
  const method = req.method ?? 'GET'
  const account = id ? (await readList()).find((a) => a.id === id) : undefined
  const headers: Record<string, string> = { 'User-Agent': MOBILE_UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', ...req.headers }
  if (account) {
    headers.Cookie = await readCookies(account.id)
    if (method !== 'GET' && account.modhash) headers['X-Modhash'] = account.modhash
  }
  let body: string | null = null
  if (req.form) {
    body = encodeForm({ ...req.form, ...(account?.modhash && method !== 'GET' ? { uh: account.modhash } : {}) })
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (req.json !== undefined) {
    body = JSON.stringify(req.json)
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET') {
    const origin = new URL(req.url).origin
    headers.Origin = origin
    headers.Referer = `${origin}/`
  }
  const res = await DeltaReddit.request(req.url, method, headers, body)
  if (res.status === 0) return { status: 0, error: res.error }
  const text = res.body ?? ''
  let json: unknown = undefined
  if ((res.contentType ?? '').includes('json') || /^\s*[[{]/.test(text.slice(0, 2))) {
    try {
      json = JSON.parse(text)
    } catch {}
  }
  const blocked = json === undefined && (res.contentType ?? '').includes('text/html') && (res.status === 403 || /\/login/.test(res.url ?? ''))
  const num = (v?: string | null) => (v ? Number(v) || undefined : undefined)
  return { status: res.status, url: res.url, json, text: json === undefined ? text.slice(0, 2000) : undefined, blocked, ratelimit: { remaining: num(res.remaining), reset: num(res.reset), used: num(res.used) } }
}

export const mobileTransport: Transport = {
  accounts: async () => (await readList()).map(publicAccount),
  signIn: (reauthId) =>
    new Promise<AccountInfo | null>((resolve) => {
      if (!DeltaReddit) throw new Error('Signing in to Reddit works in the desktop and Android apps.')
      useWebSignIn.getState().pending?.resolve(null)
      useWebSignIn.setState({ pending: { id: reauthId ?? uuid(), resolve } })
    }),
  async signOut(id) {
    await clearStoredCookies(id)
    await writeList((await readList()).filter((a) => a.id !== id))
  },
  async refresh(id) {
    const list = await readList()
    const a = list.find((x) => x.id === id)
    if (!a) return null
    const res = await request(id, { url: 'https://www.reddit.com/api/me.json?raw_json=1' })
    const d = (res.json as { data?: Record<string, any> } | undefined)?.data
    if (res.status !== 200 || !d?.name) return { ...publicAccount(a), expired: res.status === 401 || res.status === 403 || Boolean(res.blocked) || (res.status === 200 && !d?.name) }
    a.modhash = d.modhash || a.modhash
    a.icon = d.icon_img || d.snoovatar_img || a.icon
    await writeList(list)
    return { ...publicAccount(a), me: d }
  },
  async reorder(ids) {
    const list = await readList()
    list.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    await writeList(list)
  },
  request,
  async upload(id, file) {
    const lease = await request(id, { url: 'https://www.reddit.com/api/media/asset.json', method: 'POST', form: { filepath: file.name, mimetype: file.mimetype } })
    const args = (lease.json as { args?: { action: string; fields: Array<{ name: string; value: string }> }; asset?: { asset_id: string }; message?: string } | undefined)?.args
    if (!args) return { error: `Reddit answered ${lease.status}` }
    const form = new FormData()
    for (const f of args.fields) form.append(f.name, f.value)
    form.append('file', { uri: `data:${file.mimetype};base64,${file.base64}`, name: file.name, type: file.mimetype } as unknown as Blob)
    const action = args.action.startsWith('//') ? `https:${args.action}` : args.action
    const res = await fetch(action, { method: 'POST', body: form })
    if (!res.ok && res.status !== 201) return { error: `upload failed (${res.status})` }
    const key = args.fields.find((f) => f.name === 'key')?.value
    return { url: `${action}/${key}` }
  }
}
