const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, session, shell, Tray } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const updater = require('./updater.cjs')
const reddit = require('./reddit.cjs')
const { version } = require('./package.json')

// Apollo Delta's desktop shell: the app's web build (web/, from `expo export`) served over app://,
// its settings in a JSON file, the Reddit sessions and requests (reddit.cjs), inbox alerts as
// system notifications, and the updater (updater.cjs).

const WEB = path.join(__dirname, 'web')
const DATA = () => path.join(app.getPath('userData'), 'apollodelta.json')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

if (!app.requestSingleInstanceLock()) app.exit(0)

let win = null
let tray = null

// YouTube's embed refuses to play without a Referer, and pages on app:// don't send one: give its
// requests the app's website instead. Reddit's media hosts get reddit.com, as in a browser.
function fixReferers() {
  const urls = ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*']
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = details.requestHeaders
    if (!headers.Referer || headers.Referer.startsWith('app://')) headers.Referer = 'https://deli5150.github.io/apollo-delta/'
    callback({ requestHeaders: headers })
  })
  const media = ['https://*.redd.it/*', 'https://*.redditmedia.com/*', 'https://*.redditstatic.com/*', 'https://*.imgur.com/*']
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: media }, (details, callback) => {
    const headers = details.requestHeaders
    if (!headers.Referer || headers.Referer.startsWith('app://')) headers.Referer = 'https://www.reddit.com/'
    callback({ requestHeaders: headers })
  })
}

function serveWeb() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)))
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html')
    return net.fetch(pathToFileURL(file).toString())
  })
}

// The title bar is hidden on macOS: leave room for the traffic lights and make the top draggable.
const MAC_CHROME_CSS = `
  #root { margin-top: 28px; height: calc(100% - 28px) !important; }
  #delta-drag { position: fixed; top: 0; left: 0; right: 0; height: 28px; -webkit-app-region: drag; z-index: 0; background: transparent; }
`

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    title: 'Apollo Delta',
    backgroundColor: '#0b0d14',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    icon: process.platform === 'linux' ? path.join(__dirname, 'build/tray.png') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false }
  })
  // `npm run dev` points the app at the Expo dev server (live reload) instead of the built web/.
  win.loadURL(process.env.DELTA_DEV_URL || 'app://delta/')
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show()
  })
  win.webContents.on('did-finish-load', () => {
    // Slim scrollbars that sit on any theme.
    win.webContents.insertCSS(`
      ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
      ::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.28); }
    `)
  })
  if (process.platform === 'darwin') {
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS(MAC_CHROME_CSS)
      win.webContents.executeJavaScript(`if(!document.getElementById('delta-drag')){const d=document.createElement('div');d.id='delta-drag';document.body.prepend(d)}`)
    })
  }
  // Links open in the browser, never inside Apollo Delta.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(process.env.DELTA_DEV_URL && url.startsWith(process.env.DELTA_DEV_URL))) {
      e.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  // Closing the window keeps Apollo Delta running for inbox alerts (quit from the menu, dock or tray).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })
}

function showWindow() {
  if (!win) createWindow()
  else {
    win.show()
    win.focus()
  }
}

function createTray() {
  if (process.platform === 'darwin') return
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 18, height: 18 })
  tray = new Tray(icon)
  tray.setToolTip('Apollo Delta')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Apollo Delta', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => ((app.isQuitting = true), app.quit()) }
    ])
  )
  tray.on('click', showWindow)
}

// ── Data ─────────────────────────────────────────────────────────────────────────────────────

ipcMain.on('version', (e) => (e.returnValue = version))

ipcMain.handle('data:load', () => {
  for (const f of [DATA(), `${DATA()}.bak`]) {
    try {
      const text = fs.readFileSync(f, 'utf8')
      JSON.parse(text)
      return text
    } catch {}
  }
  return null
})

ipcMain.handle('data:save', (_e, json) => {
  const file = DATA()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`)
  fs.writeFileSync(`${file}.tmp`, json)
  fs.renameSync(`${file}.tmp`, file)
})

ipcMain.handle('file:save', async (_e, name, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), name) })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, content)
  return true
})

ipcMain.on('open-external', (_e, url) => {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url)
})

// ── Notifications ────────────────────────────────────────────────────────────────────────

function notify(title, body) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  n.on('click', showWindow)
  n.show()
}
ipcMain.on('notify', (_e, title, body) => notify(title, body))
ipcMain.on('badge', (_e, count) => {
  if (process.platform === 'darwin') app.dock?.setBadge(count ? String(count) : '')
  else app.setBadgeCount?.(count)
})

// ── Cache ────────────────────────────────────────────────────────────────────────────────────
// Feeds and your subscriptions, kept as files so the app opens straight onto them.

const CACHE = () => path.join(app.getPath('userData'), 'cache')
const cacheFile = (key) => path.join(CACHE(), `${String(key).replace(/[^a-z0-9_.-]/gi, '_')}.json`)

ipcMain.handle('cache:get', (_e, key) => {
  try {
    return fs.readFileSync(cacheFile(key), 'utf8')
  } catch {
    return null
  }
})
ipcMain.handle('cache:set', (_e, key, json) => {
  fs.mkdirSync(CACHE(), { recursive: true })
  fs.writeFileSync(cacheFile(key), json)
})
ipcMain.handle('cache:clear', () => fs.rmSync(CACHE(), { recursive: true, force: true }))

// ── Files ────────────────────────────────────────────────────────────────────────────────────

ipcMain.handle('file:open', async (_e, extensions) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Files', extensions }] })
  if (canceled || !filePaths[0]) return null
  const buf = fs.readFileSync(filePaths[0])
  return { name: path.basename(filePaths[0]), base64: buf.toString('base64') }
})

/** Saves a picture or video from Reddit into Downloads (or where you choose). */
ipcMain.handle('media:save', async (_e, url, ask) => {
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'media').replace(/[^\w.-]/g, '_')
  let target = path.join(app.getPath('downloads'), name)
  if (ask) {
    const r = await dialog.showSaveDialog(win, { defaultPath: target })
    if (r.canceled || !r.filePath) return false
    target = r.filePath
  }
  const res = await fetch(url, { headers: { 'User-Agent': reddit.userAgent() } })
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  shell.showItemInFolder(target)
  return true
})

ipcMain.on('copy-image', async (_e, url) => {
  const res = await fetch(url, { headers: { 'User-Agent': reddit.userAgent() } })
  const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()))
  if (!img.isEmpty()) clipboard.writeImage(img)
})

// ── App icon ─────────────────────────────────────────────────────────────────────────────────
// Alternate icons (Settings → App Icon): the app draws the picked icon and hands over a PNG.

const ICON = () => path.join(app.getPath('userData'), 'app-icon.png')
function applyIcon() {
  if (process.platform !== 'darwin' || !fs.existsSync(ICON())) return
  app.dock?.setIcon(nativeImage.createFromPath(ICON()))
}
ipcMain.handle('icon:set', (_e, dataUrl) => {
  if (dataUrl) fs.writeFileSync(ICON(), Buffer.from(dataUrl.split(',')[1], 'base64'))
  else fs.rmSync(ICON(), { force: true })
  if (dataUrl) applyIcon()
  else if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')))
})

// ── Reddit ───────────────────────────────────────────────────────────────────────────────────

reddit.setUp(ipcMain, () => win)

// ── Updates ──────────────────────────────────────────────────────────────────────────────────

ipcMain.handle('update:status', () => updater.updateStatus())
ipcMain.handle('update:check', (_e, quiet) => updater.checkForUpdates(Boolean(quiet)))
ipcMain.handle('update:download', () => updater.downloadUpdate())
ipcMain.handle('update:install', () => updater.installUpdate())
ipcMain.on('update:auto', (_e, enabled) => updater.setAuto(enabled))

// ── App ──────────────────────────────────────────────────────────────────────────────────────

app.on('second-instance', showWindow)
app.on('activate', showWindow)
app.on('before-quit', () => (app.isQuitting = true))
app.on('window-all-closed', () => {})

app.whenReady().then(() => {
  app.setAppUserModelId('app.apollodelta.reddit')
  serveWeb()
  fixReferers()
  createWindow()
  createTray()
  applyIcon()
  updater.startUpdater((status) => win?.webContents.send('update:status', status))
  if (process.env.DELTA_SHOTS) void screenshots(process.env.DELTA_SHOTS)
})

/** Test hook: DELTA_SHOTS=<dir> [DELTA_SHOT_STEPS="name:click text,…"] saves screenshots, then quits. */
async function screenshots(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  fs.mkdirSync(dir, { recursive: true })
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') console.log(`[page ${e.level}] ${e.message}`)
  })
  await wait(4000)
  const steps = (process.env.DELTA_SHOT_STEPS || 'home:,library:Library,settings:Settings').split(',')
  for (const step of steps) {
    const [name, ...clicks] = step.split(':')
    for (const text of clicks.filter(Boolean)) {
      if (text.startsWith('!')) {
        await win.webContents.executeJavaScript(text.slice(1).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%26/g, '&')).catch((e) => console.log(`[step failed] ${e.message}`))
        await wait(900)
        continue
      }
      if (text.startsWith('@')) {
        await win.webContents.executeJavaScript(`(() => { const el = [...document.querySelectorAll('[aria-label=${JSON.stringify(text.slice(1))}]')].filter((e) => e.offsetParent).pop(); el && el.click() })()`)
        await wait(900)
        continue
      }
      // Only visible elements: hidden tabs stay mounted and would otherwise swallow the click.
      await win.webContents.executeJavaScript(`(() => { const els = [...document.querySelectorAll('div,span')].filter(e => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)} && e.offsetParent); const el = els[els.length - 1]; el && el.click(); return !!el })()`)
      await wait(900)
    }
    await wait(1200)
    console.log('shot', name, await win.webContents.executeJavaScript('JSON.stringify([innerWidth, innerHeight, document.documentElement.scrollWidth, document.body.scrollWidth, devicePixelRatio])'))
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG())
  }
  app.isQuitting = true
  app.quit()
}
