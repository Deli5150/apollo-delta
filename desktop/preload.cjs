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
    browser: () => ipcRenderer.invoke('reddit:browser'),
    signInWithBrowser: (reauthId) => ipcRenderer.invoke('reddit:sign-in-browser', reauthId),
    cancelBrowser: () => ipcRenderer.invoke('reddit:cancel-browser'),
    browserRemembered: () => ipcRenderer.invoke('reddit:browser-remembered'),
    forgetBrowser: () => ipcRenderer.invoke('reddit:forget-browser'),
    signOut: (id) => ipcRenderer.invoke('reddit:sign-out', id),
    refresh: (id) => ipcRenderer.invoke('reddit:refresh', id),
    reorder: (ids) => ipcRenderer.invoke('reddit:reorder', ids),
    request: (id, req) => ipcRenderer.invoke('reddit:request', id, req),
    upload: (id, file) => ipcRenderer.invoke('reddit:upload', id, file)
  },
  ai: {
    model: (file, bytes) => ipcRenderer.invoke('ai:model', file, bytes),
    download: (opts) => ipcRenderer.invoke('ai:download', opts),
    cancelDownload: () => ipcRenderer.invoke('ai:cancel'),
    deleteModel: (file) => ipcRenderer.invoke('ai:delete', file),
    summarize: (id, file, messages, sampling) => ipcRenderer.invoke('ai:summarize', id, file, messages, sampling),
    stop: (id) => ipcRenderer.send('ai:stop', id),
    onProgress: (cb) => {
      const listener = (_e, p) => cb(p)
      ipcRenderer.on('ai:progress', listener)
      return () => ipcRenderer.off('ai:progress', listener)
    },
    onToken: (cb) => {
      const listener = (_e, id, piece) => cb(id, piece)
      ipcRenderer.on('ai:token', listener)
      return () => ipcRenderer.off('ai:token', listener)
    }
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
