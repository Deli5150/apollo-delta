// Reddit without an API key: you sign in on reddit.com itself (in a window with its own cookie
// store per account), and the app then asks Reddit's web JSON for pages with that session's
// cookies, the way a browser tab would. Writes (votes, comments, …) carry the session's modhash.
// Which host answers which path is decided in the app (src/lib/reddit/routes.ts); this file only
// signs in, keeps the sessions and sends requests.
const { app, BrowserWindow, session } = require('electron')
const browserSignIn = require('./browser-signin.cjs')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// A current desktop browser. Reddit answers a bare or unusual User-Agent with its block page.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const userAgent = () => (process.platform === 'win32' ? WIN_UA : UA)

const ACCOUNTS = () => path.join(app.getPath('userData'), 'accounts.json')
const partition = (id) => `persist:reddit-${id}`

/** @type {Array<{ id: string, username: string, modhash: string, icon?: string, addedAt: number }>} */
let accounts = []

function load() {
  try {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS(), 'utf8'))
  } catch {
    accounts = []
  }
}

function save() {
  fs.writeFileSync(ACCOUNTS(), JSON.stringify(accounts, null, 2))
}

const publicAccount = (a) => ({ id: a.id, username: a.username, icon: a.icon, hasModhash: Boolean(a.modhash) })

async function cookieHeader(id) {
  const cookies = await session.fromPartition(partition(id)).cookies.get({ domain: 'reddit.com' })
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

/** Asks Reddit who the session belongs to, from inside a page on reddit.com (so its cookies count). */
async function probe(webContents) {
  try {
    return await webContents.executeJavaScript(
      `fetch('/api/me.json', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => j && j.data && j.data.name ? { name: j.data.name, modhash: j.data.modhash || '', icon: j.data.icon_img || j.data.snoovatar_img || '' } : null).catch(() => null)`,
      true
    )
  } catch {
    return null
  }
}

/** Cookies Reddit sets for the browser session only: kept for years instead, so you stay signed in. */
async function keepSession(ses) {
  const cookies = await ses.cookies.get({ domain: 'reddit.com' })
  const until = Math.floor(Date.now() / 1000) + 3650 * 86400
  for (const c of cookies) {
    if (c.session || !c.expirationDate) {
      const url = `https://${c.domain.replace(/^\./, '')}${c.path}`
      await ses.cookies
        .set({ url, name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: until })
        .catch(() => {})
    }
  }
}

/** Keeps a signed-in session as an account (replacing an older session of the same account). */
async function addAccount(id, me) {
  await keepSession(session.fromPartition(partition(id)))
  const existing = accounts.find((a) => a.id === id || a.username.toLowerCase() === me.name.toLowerCase())
  if (existing && existing.id !== id) {
    await session.fromPartition(partition(existing.id)).clearStorageData().catch(() => {})
    accounts = accounts.filter((a) => a.id !== existing.id)
  }
  const account = { id, username: me.name, modhash: me.modhash, icon: me.icon, addedAt: Date.now() }
  accounts = [...accounts.filter((a) => a.id !== id), account]
  save()
  return publicAccount(account)
}

/**
 * Opens reddit.com's sign-in page in a window. Resolves with the account once Reddit says you're
 * signed in, or null if you close the window first. `reauth` signs an existing account in again.
 */
function signIn(parent, reauthId) {
  return new Promise((resolve) => {
    const id = reauthId || crypto.randomUUID()
    const ses = session.fromPartition(partition(id))
    ses.setUserAgent(userAgent())
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent,
      modal: process.platform !== 'darwin',
      title: 'Sign in to Reddit',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: { partition: partition(id), contextIsolation: true, sandbox: true }
    })
    let done = false
    const finish = async (me) => {
      if (done) return
      done = true
      clearInterval(timer)
      if (me) {
        resolve(await addAccount(id, me))
      } else {
        if (!reauthId && !accounts.some((a) => a.id === id)) await ses.clearStorageData().catch(() => {})
        resolve(null)
      }
      if (!win.isDestroyed()) win.close()
    }
    // The sign-in form posts with fetch and no page load, so keep asking.
    const check = async () => {
      if (win.isDestroyed()) return
      const url = win.webContents.getURL()
      if (!/^https:\/\/([a-z]+\.)?reddit\.com/.test(url)) return
      const me = await probe(win.webContents)
      if (me) void finish(me)
    }
    const timer = setInterval(check, 1500)
    win.webContents.on('did-finish-load', check)
    win.on('closed', () => void finish(null))
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Google/Apple sign-in pop-ups open in the same session.
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, webPreferences: { partition: partition(id) } } }
    })
    const start = async () => {
      // Signing in again: clear the old session so the form shows instead of the feed.
      if (reauthId) await ses.clearStorageData({ storages: ['cookies'] }).catch(() => {})
      await win.loadURL('https://www.reddit.com/login/', { userAgent: userAgent() })
    }
    void start()
  })
}

/**
 * Signs in through a real browser (Chrome, Edge, Brave…), where Google and Apple sign-in work,
 * then moves the Reddit session into the account's own cookie store. Resolves with the account,
 * or null if you closed the browser first.
 */
async function signInWithBrowser(reauthId) {
  const id = reauthId || crypto.randomUUID()
  const cookies = await browserSignIn.signIn(path.join(app.getPath('userData'), 'browser-signin'))
  if (!cookies) return null
  const ses = session.fromPartition(partition(id))
  ses.setUserAgent(userAgent())
  await ses.clearStorageData({ storages: ['cookies'] }).catch(() => {})
  for (const c of cookies) {
    const domain = c.domain
    await ses.cookies
      .set({
        url: `https://${domain.replace(/^\./, '')}${c.path || '/'}`,
        name: c.name,
        value: c.value,
        domain: domain.startsWith('.') ? domain : undefined,
        path: c.path || '/',
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : c.sameSite === 'None' ? 'no_restriction' : 'unspecified',
        expirationDate: c.expires > 0 ? c.expires : undefined
      })
      .catch(() => {})
  }
  // Ask Reddit who this session is, as the account.
  const headers = { 'User-Agent': userAgent(), Accept: 'application/json', Cookie: await cookieHeader(id) }
  const res = await fetch('https://www.reddit.com/api/me.json?raw_json=1', { headers }).catch(() => null)
  const d = res?.ok ? (await res.json().catch(() => null))?.data : null
  if (!d?.name) {
    if (!reauthId) await ses.clearStorageData().catch(() => {})
    throw new Error("Reddit didn't confirm the sign-in. Try again, or use the in-app sign-in.")
  }
  return addAccount(id, { name: d.name, modhash: d.modhash || '', icon: d.icon_img || d.snoovatar_img || '' })
}

async function signOut(id) {
  await session.fromPartition(partition(id)).clearStorageData().catch(() => {})
  accounts = accounts.filter((a) => a.id !== id)
  save()
}

/** Reads the modhash (write token) and avatar again; Reddit changes the modhash now and then. */
async function refresh(id) {
  const a = accounts.find((x) => x.id === id)
  if (!a) return null
  const res = await request(id, { url: 'https://www.reddit.com/api/me.json?raw_json=1' })
  if (res.status !== 200 || !res.json) return { ...publicAccount(a), expired: res.status === 403 || res.status === 401 || res.blocked }
  const d = res.json.data || {}
  if (!d.name) return { ...publicAccount(a), expired: true }
  a.modhash = d.modhash || a.modhash
  a.icon = d.icon_img || d.snoovatar_img || a.icon
  save()
  return { ...publicAccount(a), me: d }
}

/**
 * Sends one request as an account (or signed out without one). Returns the status, the JSON when
 * Reddit answered JSON, whether it was Reddit's block page, and its rate-limit headers.
 */
async function request(id, { url, method = 'GET', form, json, headers: extra }) {
  if (!/^https:\/\/([a-z0-9-]+\.)?(reddit\.com|redd\.it|redditmedia\.com)\//.test(url)) return { status: 0, error: 'not a Reddit URL' }
  const account = id ? accounts.find((a) => a.id === id) : null
  const headers = { 'User-Agent': userAgent(), Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', ...extra }
  if (account) {
    headers.Cookie = await cookieHeader(account.id)
    if (method !== 'GET' && account.modhash) headers['X-Modhash'] = account.modhash
  }
  let body
  if (form) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null) params.append(k, String(v))
    if (account?.modhash && method !== 'GET') params.append('uh', account.modhash)
    body = params.toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (json !== undefined) {
    body = JSON.stringify(json)
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET') {
    const origin = new URL(url).origin
    headers.Origin = origin
    headers.Referer = `${origin}/`
  }
  try {
    const res = await fetch(url, { method, headers, body, redirect: 'follow' })
    const type = res.headers.get('content-type') || ''
    const text = await res.text()
    let parsed = null
    if (type.includes('json') || /^\s*[[{]/.test(text.slice(0, 2))) {
      try {
        parsed = JSON.parse(text)
      } catch {}
    }
    const blocked = !parsed && type.includes('text/html') && (res.status === 403 || /\/login/.test(res.url))
    return {
      status: res.status,
      url: res.url,
      json: parsed,
      text: parsed ? undefined : text.slice(0, 2000),
      blocked,
      ratelimit: {
        remaining: Number(res.headers.get('x-ratelimit-remaining')) || undefined,
        reset: Number(res.headers.get('x-ratelimit-reset')) || undefined,
        used: Number(res.headers.get('x-ratelimit-used')) || undefined
      }
    }
  } catch (e) {
    return { status: 0, error: e.message }
  }
}

/** Uploads a file to Reddit's media storage (an S3 form Reddit hands out), for image posts and comments. */
async function uploadMedia(id, { name, mimetype, base64 }) {
  const lease = await request(id, { url: 'https://www.reddit.com/api/media/asset.json', method: 'POST', form: { filepath: name, mimetype } })
  const args = lease.json?.args
  if (!args) return { error: lease.json?.message || `Reddit answered ${lease.status}` }
  const formData = new FormData()
  for (const f of args.fields) formData.append(f.name, f.value)
  formData.append('file', new Blob([Buffer.from(base64, 'base64')], { type: mimetype }), name)
  const action = args.action.startsWith('//') ? `https:${args.action}` : args.action
  const res = await fetch(action, { method: 'POST', body: formData })
  if (!res.ok && res.status !== 201) return { error: `upload failed (${res.status})` }
  const key = args.fields.find((f) => f.name === 'key')?.value
  return { url: `${action}/${key}`, assetId: lease.json.asset?.asset_id }
}

// ── Pages that aren't Reddit's: link previews ───────────────────────────────────────────────

const meta = new Map()

/** Title, description, image and site name of a web page, from its Open Graph tags. */
async function linkPreview(url) {
  if (!/^https?:\/\//.test(url)) return null
  if (meta.has(url)) return meta.get(url)
  let result = null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: 'text/html' }, signal: ctrl.signal, redirect: 'follow' })
    clearTimeout(t)
    if (res.ok && (res.headers.get('content-type') || '').includes('html')) {
      const html = (await res.text()).slice(0, 400_000)
      const tag = (prop) => {
        const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i')
        const m = html.match(re)
        return m ? m[0].match(/content=["']([^"']*)["']/i)?.[1] : undefined
      }
      const decode = (s) => s && s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      const title = decode(tag('og:title') || tag('twitter:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim())
      let image = decode(tag('og:image') || tag('twitter:image'))
      if (image && image.startsWith('/')) image = new URL(image, res.url).toString()
      if (title) result = { url: res.url, title, description: decode(tag('og:description') || tag('description')), image, site: decode(tag('og:site_name')) || new URL(res.url).hostname.replace(/^www\./, '') }
    }
  } catch {}
  if (meta.size > 500) meta.clear()
  meta.set(url, result)
  return result
}

/** Machine translation (Google's free web endpoint, the one browsers' translate buttons used). */
async function translate(text, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text.slice(0, 4800))}`
  const res = await fetch(url, { headers: { 'User-Agent': userAgent() } })
  if (!res.ok) throw new Error(`translation failed (${res.status})`)
  const j = await res.json()
  return { text: (j[0] || []).map((p) => p[0]).join(''), from: j[2] }
}

function setUp(ipcMain, getWindow) {
  load()
  app.userAgentFallback = userAgent()
  // Quitting closes a sign-in browser window this app opened.
  app.on('before-quit', () => browserSignIn.cancel())
  ipcMain.handle('reddit:accounts', () => accounts.map(publicAccount))
  ipcMain.handle('reddit:sign-in', (_e, reauthId) => signIn(getWindow(), reauthId))
  ipcMain.handle('reddit:browser', () => browserSignIn.findBrowser()?.name ?? null)
  ipcMain.handle('reddit:sign-in-browser', (_e, reauthId) => signInWithBrowser(reauthId))
  ipcMain.handle('reddit:cancel-browser', () => browserSignIn.cancel())
  ipcMain.handle('reddit:browser-remembered', () => browserSignIn.hasProfile(path.join(app.getPath('userData'), 'browser-signin')))
  ipcMain.handle('reddit:forget-browser', () => browserSignIn.forget(path.join(app.getPath('userData'), 'browser-signin')))
  ipcMain.handle('reddit:sign-out', (_e, id) => signOut(id))
  ipcMain.handle('reddit:refresh', (_e, id) => refresh(id))
  ipcMain.handle('reddit:reorder', (_e, ids) => {
    accounts.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    save()
  })
  ipcMain.handle('reddit:request', (_e, id, req) => request(id, req))
  ipcMain.handle('reddit:upload', (_e, id, file) => uploadMedia(id, file))
  ipcMain.handle('web:preview', (_e, url) => linkPreview(url))
  ipcMain.handle('web:translate', (_e, text, target) => translate(text, target))
}

module.exports = { setUp, userAgent }
