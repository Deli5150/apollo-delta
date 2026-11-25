const { contextBridge, ipcRenderer } = require('electron')

// The hidden summarizer window (ai.cjs, ai/worker.js): runs requests from the main process.
contextBridge.exposeInMainWorld('aiHost', {
  ready: () => ipcRenderer.send('ai:worker-ready'),
  onRun: (cb) => ipcRenderer.on('ai:run', (_e, req) => cb(req)),
  onStop: (cb) => ipcRenderer.on('ai:stop', (_e, id) => cb(id)),
  token: (id, piece) => ipcRenderer.send('ai:token', id, piece),
  done: (id, error) => ipcRenderer.send('ai:done', id, error)
})
