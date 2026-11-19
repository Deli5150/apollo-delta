// Sign in to Reddit in a real browser, so Google and Apple sign-in work (Google refuses embedded
// windows like Electron's). Apollo Delta opens Chrome, Edge or Brave on reddit.com's sign-in page
// with a profile of its own (never yours), and with nothing attached to it: Google turns sign-in
// away from a browser that's being remote-controlled. Once Reddit's session cookie lands in that
// profile's cookie file (Chrome writes cookies about every 30 seconds), the window is closed, the
// browser is reopened hidden with its DevTools port on, and it hands over the decrypted cookies.
// The profile is deleted afterwards.
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Chromium browsers that take --user-data-dir, by platform, in order of preference. */
function candidates() {
  if (process.platform === 'darwin') {
    return [
      ['Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      ['Microsoft Edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      ['Brave', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
      ['Vivaldi', '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
      ['Chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    ].flatMap(([name, p]) => [[name, p], [name, path.join(process.env.HOME || '', p)]])
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    const apps = [
      ['Google Chrome', 'Google\\Chrome\\Application\\chrome.exe'],
      ['Microsoft Edge', 'Microsoft\\Edge\\Application\\msedge.exe'],
      ['Brave', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
      ['Vivaldi', 'Vivaldi\\Application\\vivaldi.exe']
    ]
    return apps.flatMap(([name, rel]) => roots.map((r) => [name, path.join(r, rel)]))
  }
  return [
    ['Google Chrome', '/usr/bin/google-chrome'],
    ['Microsoft Edge', '/usr/bin/microsoft-edge'],
    ['Brave', '/usr/bin/brave-browser'],
    ['Chromium', '/usr/bin/chromium'],
    ['Chromium', '/usr/bin/chromium-browser']
  ]
}

/** The browser sign-in will use, or null if none is installed. */
function findBrowser() {
  for (const [name, exe] of candidates()) if (fs.existsSync(exe)) return { name, exe }
  return null
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Whether the profile's cookie file has a Reddit session in it (cookie names are stored as plain text). */
function hasSession(dir) {
  for (const f of ['Cookies', 'Cookies-journal', 'Cookies-wal']) {
    for (const sub of ['Default', path.join('Default', 'Network')]) {
      try {
        if (fs.readFileSync(path.join(dir, sub, f)).includes('reddit_session')) return true
      } catch {}
    }
  }
  return false
}

function stop(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      resolve()
    }, 5000)
    child.once('exit', () => {
      clearTimeout(t)
      resolve()
    })
    try {
      child.kill('SIGTERM')
    } catch {
      resolve()
    }
  })
}

/** Starts the browser hidden on the profile and asks it (over DevTools) for its Reddit cookies. */
async function readCookies(exe, dir) {
  fs.rmSync(path.join(dir, 'DevToolsActivePort'), { force: true })
  const child = spawn(exe, [`--user-data-dir=${dir}`, '--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=*', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  try {
    let port = null
    for (let i = 0; i < 75 && !port; i++) {
      await wait(200)
      try {
        port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim() || null
      } catch {}
    }
    if (!port) throw new Error("the browser didn't start")
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    const ws = new WebSocket(webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error("couldn't talk to the browser"))
    })
    const result = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the browser took too long')), 10_000)
      ws.onmessage = (m) => {
        const j = JSON.parse(String(m.data))
        if (j.id !== 1) return
        clearTimeout(t)
        resolve(j.result)
      }
      ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }))
    })
    try {
      ws.send(JSON.stringify({ id: 2, method: 'Browser.close' }))
    } catch {}
    return (result.cookies || []).filter((c) => /(^|\.)reddit\.com$/.test(c.domain))
  } finally {
    await stop(child)
  }
}

let current = null

/** Cancels a sign-in in progress (closes its browser window). */
function cancel() {
  if (current) current.cancelled = true
  void stop(current?.child)
}

/**
 * Opens reddit.com's sign-in page in the browser. Resolves with the Reddit cookies once you've
 * signed in, or null if you closed the window (or cancelled) first.
 */
async function signIn(dir) {
  const browser = findBrowser()
  if (!browser) throw new Error('Signing in with Google needs Chrome, Edge or Brave installed.')
  if (current) cancel()
  // A fresh profile every time, so Reddit asks who you are.
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const child = spawn(browser.exe, [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--window-size=520,760', '--app=https://www.reddit.com/login/'], { stdio: 'ignore' })
  const run = { child, cancelled: false }
  current = run
  let exited = false
  child.once('exit', () => (exited = true))
  try {
    const deadline = Date.now() + 20 * 60_000
    while (!run.cancelled && Date.now() < deadline) {
      await wait(1000)
      if (hasSession(dir)) break
      // Closed before signing in (one last look: closing also writes the cookies out).
      if (exited) {
        await wait(500)
        if (!hasSession(dir)) return null
        break
      }
    }
    if (run.cancelled || !hasSession(dir)) return null
    await stop(child)
    const cookies = await readCookies(browser.exe, dir)
    if (!cookies.some((c) => c.name === 'reddit_session')) throw new Error("the browser didn't hand over Reddit's session")
    return cookies
  } finally {
    await stop(child)
    if (current === run) current = null
    // Leave nothing behind: the profile holds your Google and Reddit sign-ins.
    await wait(300)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

module.exports = { findBrowser, signIn, cancel }
