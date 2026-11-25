const { app, BrowserWindow, ipcMain, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

// Summarize Comments on the desktop (src/lib/summarizer.web.ts). The same open-source model as the
// phones (Qwen2.5 1.5B, a one-time download kept in userData/models) runs in a hidden window with
// wllama (llama.cpp built for WebAssembly, using the GPU through WebGPU when it can). That window is
// cross-origin isolated so llama.cpp gets several threads; the app's own window can't be (YouTube
// embeds stop working), which is why it's a window of its own. Nothing is sent anywhere.

const AI_DIR = path.join(__dirname, 'ai')
const WLLAMA_DIR = path.dirname(require.resolve('@wllama/wllama/esm/index.js'))
const modelsDir = () => path.join(app.getPath('userData'), 'models')
const IDLE_MS = 3 * 60_000

/** Only a plain file name in the models folder. */
const modelPath = (file) => {
  if (!/^[\w.-]+\.gguf$/.test(file)) throw new Error('not a model file')
  return path.join(modelsDir(), file)
}

const ISOLATED = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.gguf': 'application/octet-stream' }

/** app://delta/__ai/…, /__wllama/… and /__model/<file> for the hidden window, or null for anything else. */
async function serve(pathname) {
  let file = null
  if (pathname.startsWith('/__ai/')) file = path.normalize(path.join(AI_DIR, pathname.slice(6)))
  else if (pathname.startsWith('/__wllama/')) file = path.normalize(path.join(WLLAMA_DIR, pathname.slice(10)))
  else if (pathname.startsWith('/__model/')) file = modelPath(decodeURIComponent(pathname.slice(9)))
  else return null
  if (!(file.startsWith(AI_DIR) || file.startsWith(WLLAMA_DIR) || file.startsWith(modelsDir())) || !fs.existsSync(file)) return new Response('Not found', { status: 404 })
  const res = await net.fetch(pathToFileURL(file).toString())
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(ISOLATED)) headers.set(k, v)
  headers.set('Content-Type', TYPES[path.extname(file)] ?? headers.get('Content-Type') ?? 'application/octet-stream')
  return new Response(res.body, { status: res.status, headers })
}

// ── The model file ───────────────────────────────────────────────────────────────────────────

let download = null

function modelState(file, bytes) {
  try {
    return fs.statSync(modelPath(file)).size === bytes ? 'ready' : 'missing'
  } catch {
    return 'missing'
  }
}

async function downloadModel(sender, { url, file, bytes }) {
  if (!/^https:\/\/huggingface\.co\//.test(url)) throw new Error('not a model download')
  if (download) throw new Error('already downloading')
  const target = modelPath(file)
  const part = `${target}.part`
  fs.mkdirSync(modelsDir(), { recursive: true })
  const ctrl = new AbortController()
  download = ctrl
  let out = null
  try {
    const res = await net.fetch(url, { signal: ctrl.signal })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    out = fs.createWriteStream(part)
    let loaded = 0
    let sent = 0
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r))
      loaded += chunk.length
      if (Date.now() - sent > 250) {
        sent = Date.now()
        if (!sender.isDestroyed()) sender.send('ai:progress', loaded / bytes)
      }
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())))
    out = null
    if (fs.statSync(part).size !== bytes) throw new Error('the file came down incomplete')
    fs.renameSync(part, target)
    return true
  } catch (e) {
    out?.destroy()
    fs.rmSync(part, { force: true })
    if (ctrl.signal.aborted) return false
    throw e
  } finally {
    download = null
  }
}

// ── The hidden window that runs it ───────────────────────────────────────────────────────────

let worker = null
let ready = null
let idle = null
const runs = new Map() // id → { sender, resolve, reject }

function startWorker() {
  if (ready) return ready
  worker = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'ai-preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false }
  })
  worker.on('closed', () => {
    worker = null
    ready = null
    for (const [id, r] of runs) r.reject(new Error('the summarizer stopped'))
    runs.clear()
  })
  ready = new Promise((resolve, reject) => {
    ipcMain.once('ai:worker-ready', () => resolve())
    worker.webContents.once('did-fail-load', (_e, _code, desc) => reject(new Error(desc)))
  })
  void worker.loadURL('app://delta/__ai/index.html')
  return ready
}

function stopWorker() {
  if (idle) clearTimeout(idle)
  idle = null
  worker?.destroy()
}

function keepAlive() {
  if (idle) clearTimeout(idle)
  // The model takes about 1.5 GB of memory: let it go when summaries aren't being asked for.
  idle = setTimeout(() => runs.size === 0 && stopWorker(), IDLE_MS)
}

function register() {
  ipcMain.handle('ai:model', (_e, file, bytes) => modelState(file, bytes))
  ipcMain.handle('ai:download', (e, opts) => downloadModel(e.sender, opts))
  ipcMain.handle('ai:cancel', () => void download?.abort())
  ipcMain.handle('ai:delete', (_e, file) => {
    stopWorker()
    fs.rmSync(modelPath(file), { force: true })
  })
  ipcMain.handle('ai:summarize', async (e, id, file, messages, sampling) => {
    await startWorker()
    if (idle) clearTimeout(idle)
    return new Promise((resolve, reject) => {
      runs.set(id, { sender: e.sender, resolve, reject })
      worker.webContents.send('ai:run', { id, file, messages, sampling })
    })
  })
  ipcMain.on('ai:stop', (_e, id) => worker?.webContents.send('ai:stop', id))
  // From the hidden window.
  ipcMain.on('ai:token', (_e, id, piece) => {
    const r = runs.get(id)
    if (r && !r.sender.isDestroyed()) r.sender.send('ai:token', id, piece)
  })
  ipcMain.on('ai:done', (_e, id, error) => {
    const r = runs.get(id)
    runs.delete(id)
    if (r) error ? r.reject(new Error(error)) : r.resolve()
    keepAlive()
  })
}

module.exports = { register, serve, stopWorker }
