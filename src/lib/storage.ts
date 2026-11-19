import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UpdateStatus } from './release'

// Where Apollo Delta keeps its data: on desktop, a JSON file in the app's data folder (through the
// Electron preload's bridge); on phones (and a plain browser), AsyncStorage. Feeds are cached the
// same way (desktop: one file each).

const KEY = 'delta:data'

export interface AccountInfo {
  id: string
  username: string
  icon?: string
  hasModhash: boolean
}

export interface RedditRequest {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  form?: Record<string, string | number | boolean | undefined>
  json?: unknown
  headers?: Record<string, string>
}

export interface RedditResponse {
  status: number
  url?: string
  json?: any
  text?: string
  /** Reddit's 403 block page (or a redirect to its sign-in page) instead of JSON. */
  blocked?: boolean
  error?: string
  ratelimit?: { remaining?: number; reset?: number; used?: number }
}

export interface LinkPreview {
  url: string
  title: string
  description?: string
  image?: string
  site?: string
}

export interface DesktopBridge {
  platform: 'darwin' | 'win32' | 'linux'
  version: string
  load(): Promise<string | null>
  save(json: string): Promise<void>
  notifyNow(title: string, body: string): void
  setBadge(count: number): void
  saveFile(name: string, content: string): Promise<boolean>
  openFile(extensions: string[]): Promise<{ name: string; base64: string } | null>
  saveMedia(url: string, ask?: boolean): Promise<boolean>
  copyImage(url: string): void
  setIcon(dataUrl: string | null): Promise<void>
  cache: {
    get(key: string): Promise<string | null>
    set(key: string, json: string): Promise<void>
    clear(): Promise<void>
  }
  openExternal(url: string): void
  reddit: {
    accounts(): Promise<AccountInfo[]>
    signIn(reauthId?: string): Promise<AccountInfo | null>
    /** The browser "Sign in with Google" opens (Chrome, Edge, Brave…), or null if none is installed. */
    browser(): Promise<string | null>
    signInWithBrowser(reauthId?: string): Promise<AccountInfo | null>
    cancelBrowser(): Promise<void>
    signOut(id: string): Promise<void>
    refresh(id: string): Promise<(AccountInfo & { expired?: boolean; me?: any }) | null>
    reorder(ids: string[]): Promise<void>
    request(id: string | null, req: RedditRequest): Promise<RedditResponse>
    upload(id: string, file: { name: string; mimetype: string; base64: string }): Promise<{ url?: string; assetId?: string; error?: string }>
  }
  web: {
    preview(url: string): Promise<LinkPreview | null>
    translate(text: string, target: string): Promise<{ text: string; from?: string }>
  }
  updater: {
    status(): Promise<UpdateStatus>
    check(quiet?: boolean): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    setAuto(enabled: boolean): void
    onChange(cb: (status: UpdateStatus) => void): () => void
  }
}

export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' ? ((window as unknown as { apollodelta?: DesktopBridge }).apollodelta ?? null) : null

export async function loadData(): Promise<string | null> {
  if (desktop) return desktop.load()
  return AsyncStorage.getItem(KEY)
}

export async function saveData(json: string): Promise<void> {
  if (desktop) return desktop.save(json)
  await AsyncStorage.setItem(KEY, json)
}

const CACHE_PREFIX = 'delta:cache:'

export async function cacheGet(key: string): Promise<string | null> {
  if (desktop) return desktop.cache.get(key)
  return AsyncStorage.getItem(CACHE_PREFIX + key)
}

export async function cacheSet(key: string, json: string): Promise<void> {
  if (desktop) return desktop.cache.set(key, json)
  await AsyncStorage.setItem(CACHE_PREFIX + key, json).catch(() => null)
}

export async function cacheClear(): Promise<void> {
  if (desktop) return desktop.cache.clear()
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX))
  await AsyncStorage.multiRemove(keys)
}
