import { create } from 'zustand'
import * as api from './reddit/api'
import type { Multi, Sort, Subreddit, TimeRange } from './reddit/types'
import { cacheGet, cacheSet } from './storage'
import { useSession } from './reddit/transport'
import { useStore } from './store'

// Your subreddit list (subscriptions + multireddits) for the current account, cached so the list
// shows straight away, and feed names for display.

interface Subs {
  subs: Subreddit[]
  multis: Multi[]
  loading: boolean
  error: string | null
  account: string | null
}

export const useSubs = create<Subs>(() => ({ subs: [], multis: [], loading: false, error: null, account: null }))

export async function loadSubs(force = false): Promise<void> {
  const account = useSession.getState().current
  if (!account) return useSubs.setState({ subs: [], multis: [], account: null })
  const s = useSubs.getState()
  if (s.loading) return
  if (s.account !== account) {
    const cached = await cacheGet(`subs-${account}`).catch(() => null)
    if (cached) {
      const c = JSON.parse(cached)
      useSubs.setState({ subs: c.subs ?? [], multis: c.multis ?? [], account })
    } else useSubs.setState({ subs: [], multis: [], account })
    if (cached && !force) {
      // Fresh enough; refresh in the background anyway.
    }
  }
  useSubs.setState({ loading: true, error: null })
  try {
    const [subs, multis] = await Promise.all([api.subscriptions(), api.multis()])
    if (useSession.getState().current !== account) return
    subs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    useSubs.setState({ subs, multis, loading: false })
    void cacheSet(`subs-${account}`, JSON.stringify({ subs, multis }))
  } catch (e) {
    // Keep the list you had when a refresh fails.
    useSubs.setState({ loading: false, error: (e as Error).message })
  }
}

export function setSubscribed(sr: Subreddit, on: boolean): void {
  useSubs.setState((s) => ({ subs: on ? [...s.subs.filter((x) => x.name !== sr.name), { ...sr, subscribed: true }].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())) : s.subs.filter((x) => x.name.toLowerCase() !== sr.name.toLowerCase()) }))
}

export function feedTitle(feed: string): string {
  if (!feed) return 'Home'
  if (feed.toLowerCase() === 'popular') return 'Popular'
  if (feed.toLowerCase() === 'all') return 'All'
  const m = feed.match(/^\/user\/([^/]+)\/m\/(.+)$/)
  if (m) return useSubs.getState().multis.find((x) => x.path.replace(/\/$/, '') === feed)?.displayName ?? m[2]
  if (feed.includes('+')) return feed.split('+').map((s) => `r/${s}`).join(', ')
  return `r/${feed}`
}

export const isSubreddit = (feed: string) => Boolean(feed) && !['popular', 'all'].includes(feed.toLowerCase()) && !feed.startsWith('/') && !feed.includes('+') && !feed.startsWith('u_')

/** The sort a feed opens with: the one you last used there (if remembered), else the default. */
export function initialSort(feed: string): { sort: Sort; time: TimeRange } {
  const s = useStore.getState().settings
  const saved = s.rememberSubredditSort ? s.subredditSorts[feed.toLowerCase()] : undefined
  const sort = saved?.sort ?? (feed && s.defaultSort === 'best' ? 'hot' : s.defaultSort)
  return { sort, time: saved?.time ?? s.defaultTime }
}

export function rememberSort(feed: string, sort: Sort, time: TimeRange): void {
  const s = useStore.getState()
  if (!s.settings.rememberSubredditSort) return
  s.set('subredditSorts', { ...s.settings.subredditSorts, [feed.toLowerCase()]: { sort, time } })
}

export const SORTS: Array<{ value: Sort; label: string; icon: string }> = [
  { value: 'best', label: 'Best', icon: 'rocket-outline' },
  { value: 'hot', label: 'Hot', icon: 'flame-outline' },
  { value: 'new', label: 'New', icon: 'sparkles-outline' },
  { value: 'top', label: 'Top', icon: 'podium-outline' },
  { value: 'rising', label: 'Rising', icon: 'trending-up-outline' },
  { value: 'controversial', label: 'Controversial', icon: 'flash-outline' }
]

export const TIMES: Array<{ value: TimeRange; label: string }> = [
  { value: 'hour', label: 'Past Hour' },
  { value: 'day', label: 'Past 24 Hours' },
  { value: 'week', label: 'Past Week' },
  { value: 'month', label: 'Past Month' },
  { value: 'year', label: 'Past Year' },
  { value: 'all', label: 'All Time' }
]
