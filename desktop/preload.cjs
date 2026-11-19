const { contextBridge, ipcRenderer } = require('electron')

// window.apollodelta: what the app (src/lib/storage.ts DesktopBridge) can ask the desktop side for.
contextBridge.exposeInMainWorld('apollodelta', {
  platform: process.platform,
  version: ipcRenderer.sendSync('version'),
  load: () => ipcRenderer.invoke('data:load'),
  save: (json) => ipcRenderer.invoke('data:save', json),
  notifyNow: (title, body) => ipcRenderer.send('notify', title, body),
  setBadge: (count) => ipcRenderer.send('badge', count),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', name, content),
  openFile: (extensions) => ipcRenderer.invoke('file:open', extensions),
  saveMedia: (url, ask) => ipcRenderer.invoke('media:save', url, ask),
  copyImage: (url) => ipcRenderer.send('copy-image', url),
  setIcon: (dataUrl) => ipcRenderer.invoke('icon:set', dataUrl),
  cache: {
    get: (key) => ipcRenderer.invoke('cache:get', key),
    set: (key, json) => ipcRenderer.invoke('cache:set', key, json),
    clear: () => ipcRenderer.invoke('cache:clear')
  },
  openExternal: (url) => ipcRenderer.send('open-external', url),
  reddit: {
    accounts: () => ipcRenderer.invoke('reddit:accounts'),
    signIn: (reauthId) => ipcRenderer.invoke('reddit:sign-in', reauthId),
    signOut: (id) => ipcRenderer.invoke('reddit:sign-out', id),
    refresh: (id) => ipcRenderer.invoke('reddit:refresh', id),
    reorder: (ids) => ipcRenderer.invoke('reddit:reorder', ids),
    request: (id, req) => ipcRenderer.invoke('reddit:request', id, req),
    upload: (id, file) => ipcRenderer.invoke('reddit:upload', id, file)
  },
  web: {
    preview: (url) => ipcRenderer.invoke('web:preview', url),
    translate: (text, target) => ipcRenderer.invoke('web:translate', text, target)
  },
  updater: {
    status: () => ipcRenderer.invoke('update:status'),
    check: (quiet) => ipcRenderer.invoke('update:check', quiet),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    setAuto: (enabled) => ipcRenderer.send('update:auto', enabled),
    onChange: (cb) => {
      const listener = (_e, status) => cb(status)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.off('update:status', listener)
    }
  }
})
