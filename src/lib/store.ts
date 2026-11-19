import { create } from 'zustand'
import type { CommentSort, Post, Sort, TimeRange } from './reddit/types'
import { loadData, saveData } from './storage'

// Everything Apollo Delta remembers (not your Reddit account itself: that's the signed-in session).
// One JSON document, saved a moment after each change.

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge'
export type PostSize = 'large' | 'compact'

export interface Settings {
  theme: string
  appearance: 'system' | 'light' | 'dark'
  /** Darkest background (OLED black) for dark themes. */
  pureBlack: boolean
  textSize: TextSize
  postSize: PostSize
  thumbnailSide: 'left' | 'right'
  showThumbnails: boolean
  showFlair: boolean
  showAwards: boolean
  showSubredditIcons: boolean
  showUserAvatars: boolean
  dimReadPosts: boolean
  hideReadPosts: boolean
  markReadOnOpen: boolean
  showNsfw: boolean
  blurNsfw: boolean
  blurSpoilers: boolean
  /** All+: NSFW posts mixed back into r/all. */
  nsfwInAll: boolean
  defaultFeed: string
  defaultSort: Sort
  defaultTime: TimeRange
  rememberSubredditSort: boolean
  defaultCommentSort: CommentSort
  autoplay: boolean
  mutedVideos: boolean
  loopVideos: boolean
  inlineMedia: boolean
  richLinks: boolean
  autoCollapsePinned: boolean
  collapseChildren: boolean
  highlightNewComments: boolean
  jumpButton: 'threads' | 'new'
  showJumpButton: boolean
  tapScoreToDownvote: boolean
  translateTarget: string
  /** Keyword, subreddit, user and domain filters (lowercased). */
  filters: { keywords: string[]; subreddits: string[]; users: string[]; domains: string[]; flairs: string[] }
  filterInSubreddits: boolean
  /** Per-subreddit tag filter exceptions. */
  tagOverrides: Record<string, { nsfw?: boolean; spoiler?: boolean }>
  inboxNotifications: boolean
  inboxCheckMinutes: number
  unreadBadge: boolean
  checkUpdates: boolean
  appIcon: string
  pixelPal: string
  openLinksInApp: boolean
  confirmVote: boolean
  showScoreOnComments: boolean
  showTimestampsAbsolute: boolean
  routeUpdates: boolean
  subredditSorts: Record<string, { sort: Sort; time?: TimeRange }>
  recentlyVisitedLimit: number
  restoreSession: boolean
  skippedVersion?: string
  laterVersion?: string
  laterUntil: number
}

export interface ReadPost {
  name: string
  at: number
  post: Pick<Post, 'id' | 'name' | 'title' | 'subreddit' | 'author' | 'score' | 'numComments' | 'created' | 'permalink' | 'thumbnail' | 'nsfw' | 'spoiler' | 'domain' | 'url' | 'isSelf'>
}

export interface Data {
  version: 1
  settings: Settings
  /** Your favorite subreddits (pinned at the top of the list). */
  favorites: string[]
  /** Saved categories: names, and which saved item is in which. */
  savedCategories: string[]
  itemCategories: Record<string, string>
  recentlyRead: ReadPost[]
  recentlyVisited: string[]
  /** Posts you've opened (name → when), for dimming and hiding read posts. */
  read: Record<string, number>
  /** When you last opened each post's comments (id → time), for the New Comments Highlightifier. */
  visits: Record<string, number>
  /** Searches you've made. */
  searches: string[]
  currentAccount: string | null
  /** Accounts' cached subscription lists (account id → names), shown before the refresh. */
  subscriptionCache: Record<string, Array<{ name: string; icon?: string; nsfw?: boolean }>>
  lastSession?: { feed: string; post?: string }
  seenWhatsNew?: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'apollo',
  appearance: 'dark',
  pureBlack: false,
  textSize: 'medium',
  postSize: 'large',
  thumbnailSide: 'right',
  showThumbnails: true,
  showFlair: true,
  showAwards: true,
  showSubredditIcons: true,
  showUserAvatars: true,
  dimReadPosts: true,
  hideReadPosts: false,
  markReadOnOpen: true,
  showNsfw: true,
  blurNsfw: true,
  blurSpoilers: true,
  nsfwInAll: false,
  defaultFeed: '',
  defaultSort: 'best',
  defaultTime: 'day',
  rememberSubredditSort: true,
  defaultCommentSort: 'confidence',
  autoplay: true,
  mutedVideos: true,
  loopVideos: true,
  inlineMedia: true,
  richLinks: true,
  autoCollapsePinned: true,
  collapseChildren: false,
  highlightNewComments: true,
  jumpButton: 'threads',
  showJumpButton: true,
  tapScoreToDownvote: false,
  translateTarget: 'en',
  filters: { keywords: [], subreddits: [], users: [], domains: [], flairs: [] },
  filterInSubreddits: false,
  tagOverrides: {},
  inboxNotifications: true,
  inboxCheckMinutes: 5,
  unreadBadge: true,
  checkUpdates: true,
  appIcon: 'default',
  pixelPal: 'none',
  openLinksInApp: false,
  confirmVote: false,
  showScoreOnComments: true,
  showTimestampsAbsolute: false,
  routeUpdates: true,
  subredditSorts: {},
  recentlyVisitedLimit: 12,
  restoreSession: false,
  laterUntil: 0
}

const EMPTY: Data = {
  version: 1,
  settings: DEFAULT_SETTINGS,
  favorites: [],
  savedCategories: ['Funny', 'Interesting', 'Read Later'],
  itemCategories: {},
  recentlyRead: [],
  recentlyVisited: [],
  read: {},
  visits: {},
  searches: [],
  currentAccount: null,
  subscriptionCache: {}
}

interface Store extends Data {
  loaded: boolean
  hydrate(): Promise<void>
  update(fn: (d: Data) => Partial<Data>): void
  set<K extends keyof Settings>(key: K, value: Settings[K]): void
  setSettings(patch: Partial<Settings>): void
}

let timer: ReturnType<typeof setTimeout> | null = null

const persist = (get: () => Store) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    const { loaded, hydrate, update, set, setSettings, ...data } = get()
    void saveData(JSON.stringify(data))
  }, 400)
}

/** Keeps the bigger maps from growing forever: the newest `max` entries. */
function trim(map: Record<string, number>, max: number): Record<string, number> {
  const entries = Object.entries(map)
  if (entries.length <= max) return map
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, max))
}

export function migrate(raw: Partial<Data> | null): Data {
  if (!raw) return EMPTY
  return {
    ...EMPTY,
    ...raw,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings, filters: { ...DEFAULT_SETTINGS.filters, ...raw.settings?.filters } },
    read: trim(raw.read ?? {}, 4000),
    visits: trim(raw.visits ?? {}, 2000)
  } as Data
}

export const useStore = create<Store>((setState, get) => ({
  ...EMPTY,
  loaded: false,
  async hydrate() {
    let raw: Partial<Data> | null = null
    try {
      const text = await loadData()
      raw = text ? JSON.parse(text) : null
    } catch {}
    setState({ ...migrate(raw), loaded: true })
  },
  update(fn) {
    setState(fn(get()))
    persist(get)
  },
  set(key, value) {
    setState((s) => ({ settings: { ...s.settings, [key]: value } }))
    persist(get)
  },
  setSettings(patch) {
    setState((s) => ({ settings: { ...s.settings, ...patch } }))
    persist(get)
  }
}))

export const settings = (): Settings => useStore.getState().settings

// ── Small actions ────────────────────────────────────────────────────────────────────────────

export function markRead(p: Post): void {
  useStore.getState().update((d) => ({
    read: { ...d.read, [p.name]: Date.now() },
    recentlyRead: [
      { name: p.name, at: Date.now(), post: { id: p.id, name: p.name, title: p.title, subreddit: p.subreddit, author: p.author, score: p.score, numComments: p.numComments, created: p.created, permalink: p.permalink, thumbnail: p.thumbnail, nsfw: p.nsfw, spoiler: p.spoiler, domain: p.domain, url: p.url, isSelf: p.isSelf } },
      ...d.recentlyRead.filter((r) => r.name !== p.name)
    ].slice(0, 300)
  }))
}

export function forgetRead(name: string): void {
  useStore.getState().update((d) => {
    const read = { ...d.read }
    delete read[name]
    return { read, recentlyRead: d.recentlyRead.filter((r) => r.name !== name) }
  })
}

export function visitSubreddit(name: string): void {
  if (!name || ['popular', 'all'].includes(name.toLowerCase()) || name.startsWith('/')) return
  useStore.getState().update((d) => ({ recentlyVisited: [name, ...d.recentlyVisited.filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 30) }))
}

export function toggleFavorite(name: string): void {
  useStore.getState().update((d) => {
    const has = d.favorites.some((f) => f.toLowerCase() === name.toLowerCase())
    return { favorites: has ? d.favorites.filter((f) => f.toLowerCase() !== name.toLowerCase()) : [...d.favorites, name] }
  })
}

export const isFavorite = (favorites: string[], name: string) => favorites.some((f) => f.toLowerCase() === name.toLowerCase())

export function rememberSearch(q: string): void {
  const t = q.trim()
  if (!t) return
  useStore.getState().update((d) => ({ searches: [t, ...d.searches.filter((s) => s !== t)].slice(0, 15) }))
}
