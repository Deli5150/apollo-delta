import { createNavigationContainerRef, StackActions } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import type { Message, Post } from './lib/reddit/types'
import { desktop } from './lib/storage'
import { transport, useSession } from './lib/reddit/transport'
import { openViewer } from './ui/media'
import { toast } from './ui/toast'

export type ComposeParams =
  | { mode: 'reply'; parent: string; parentAuthor?: string; quote?: string; postId?: string }
  | { mode: 'edit'; name: string; text: string; postId?: string }
  | { mode: 'post'; sr?: string }
  | { mode: 'message'; to?: string; subject?: string }

export type RootParams = {
  Tabs: undefined
  Thread: { id: string; focus?: string; post?: Post }
  Feed: { feed: string }
  User: { name: string }
  About: { sr: string }
  Wiki: { sr: string; page?: string }
  Compose: ComposeParams
  Conversation: { message: Message }
  Gallery: { feed: string }
  RecentlyRead: undefined
  Saved: { category?: string }
  Subreddits: undefined
  SettingsPage: { page: string }
  Feedback: undefined
  WhatsNew: undefined
}

export const nav = createNavigationContainerRef<RootParams>()

export function go<K extends keyof RootParams>(name: K, ...params: RootParams[K] extends undefined ? [] : [RootParams[K]]): void {
  if (!nav.isReady()) return
  nav.dispatch(StackActions.push(name, params[0] as object | undefined))
}

export function back(): void {
  if (nav.isReady() && nav.canGoBack()) nav.goBack()
}

// ── Links ────────────────────────────────────────────────────────────────────────────────────

const REDDIT = /^https?:\/\/(?:[a-z]{2,3}\.|www\.|old\.|new\.|np\.|m\.|i\.|sh\.)?reddit\.com(\/[^?#]*)?/i

/** What a Reddit link points at, if it's a page the app can show. */
export function parseRedditLink(url: string): { kind: 'post'; id: string; focus?: string } | { kind: 'feed'; feed: string } | { kind: 'user'; name: string } | { kind: 'wiki'; sr: string; page?: string } | { kind: 'share' } | null {
  let path: string | undefined
  if (url.startsWith('/')) path = url
  else {
    const short = url.match(/^https?:\/\/redd\.it\/(\w+)/i)
    if (short) return { kind: 'post', id: short[1] }
    const m = url.match(REDDIT)
    if (!m) return null
    path = m[1] ?? '/'
  }
  const p = path.replace(/\/+$/, '')
  let m: RegExpMatchArray | null
  if ((m = p.match(/^\/r\/\w+\/s\/\w+/i))) return { kind: 'share' }
  if ((m = p.match(/^\/(?:r\/\w+\/)?comments\/(\w+)(?:\/[^/]*\/(\w+))?/i))) return { kind: 'post', id: m[1], focus: m[2] }
  if ((m = p.match(/^\/(?:u|user)\/[\w-]+\/comments\/(\w+)(?:\/[^/]*\/(\w+))?/i))) return { kind: 'post', id: m[1], focus: m[2] }
  if ((m = p.match(/^\/gallery\/(\w+)/i))) return { kind: 'post', id: m[1] }
  if ((m = p.match(/^\/r\/(\w+)\/wiki\/?(.*)/i))) return { kind: 'wiki', sr: m[1], page: m[2] || undefined }
  if ((m = p.match(/^\/(?:u|user)\/([\w-]+)\/m\/(\w+)/i))) return { kind: 'feed', feed: `/user/${m[1]}/m/${m[2]}` }
  if ((m = p.match(/^\/(?:u|user)\/([\w-]+)/i))) return { kind: 'user', name: m[1] }
  if ((m = p.match(/^\/r\/([\w+]+)/i))) return { kind: 'feed', feed: m[1] }
  if (p === '' || p === '/') return { kind: 'feed', feed: '' }
  return null
}

const IMAGE = /^https?:\/\/(i\.redd\.it|preview\.redd\.it|i\.imgur\.com|external-preview\.redd\.it|pbs\.twimg\.com)\/.+\.(jpe?g|png|webp|gif)(\?.*)?$/i

/** The page a share link (`/r/x/s/abc`) or v.redd.it link redirects to. */
async function resolveRedirect(url: string): Promise<string | null> {
  const id = useSession.getState().current
  const res = await transport.request(id, { url }).catch(() => null)
  return res?.url && res.url !== url ? res.url : null
}

export function openExternal(url: string): void {
  if (desktop) desktop.openExternal(url)
  else void Linking.openURL(url)
}

/**
 * A link the app was opened with or a text shared to it (Android): its Reddit link opens here once
 * the screens are ready. Other links (apollodelta://demo) and text without a Reddit link are left alone.
 */
export function openIncoming(text: string, tries = 0): void {
  const url = text.match(/https?:\/\/[^\s<>"']+/i)?.[0]
  if (!url || !(parseRedditLink(url) || /^https?:\/\/v\.redd\.it\//i.test(url))) return
  if (!nav.isReady()) {
    if (tries < 50) setTimeout(() => openIncoming(text, tries + 1), 200)
    return
  }
  void openUrl(url, true)
}

/** Opens a link: Reddit pages in the app, pictures in the viewer, the rest in your browser. */
export async function openUrl(url: string, fromOutside = false): Promise<void> {
  const target = parseRedditLink(url)
  if (target?.kind === 'post') return go('Thread', { id: target.id, focus: target.focus })
  if (target?.kind === 'feed') return go('Feed', { feed: target.feed })
  if (target?.kind === 'user') return go('User', { name: target.name })
  if (target?.kind === 'wiki') return go('Wiki', { sr: target.sr, page: target.page })
  if (target?.kind === 'share' || /^https?:\/\/v\.redd\.it\//i.test(url)) {
    const real = await resolveRedirect(url)
    if (real && parseRedditLink(real)?.kind !== 'share') return openUrl(real)
    // From outside, the browser would hand the link straight back to the app.
    if (fromOutside) return toast("Couldn't open that link")
    return openExternal(url)
  }
  if (IMAGE.test(url)) {
    if (/\.gif(\?|$)/i.test(url) && /i\.imgur\.com/.test(url)) return openViewer([{ kind: 'video', mp4: url.replace(/\.gif.*$/, '.mp4') }])
    return openViewer([{ kind: 'image', url }])
  }
  const gifv = url.match(/^https?:\/\/i\.imgur\.com\/(\w+)\.(gifv|mp4)/i)
  if (gifv) return openViewer([{ kind: 'video', mp4: `https://i.imgur.com/${gifv[1]}.mp4` }])
  openExternal(url)
}
