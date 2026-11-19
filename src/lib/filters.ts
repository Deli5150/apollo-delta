import type { Post } from './reddit/types'
import type { Settings } from './store'

// Which posts a feed leaves out: your keyword, subreddit, user, domain and flair filters, NSFW
// (unless it's on), hidden posts and, if you like, ones you've read. Filters apply on Home, Popular,
// All and multireddits; inside a subreddit only if "Filter in subreddits" is on (except NSFW).

export function isAggregate(feed: string): boolean {
  const f = feed.toLowerCase()
  return f === '' || f === 'popular' || f === 'all' || f.includes('+') || f.startsWith('/user/') || f.startsWith('all-')
}

export function keep(p: Post, s: Settings, feed: string, read: Record<string, number>): boolean {
  if (p.hidden) return false
  const f = s.filters
  const sub = p.subreddit.toLowerCase()
  const aggregate = isAggregate(feed)
  if (p.nsfw && !s.showNsfw) return false
  // r/all leaves NSFW out unless All+ is on.
  if (p.nsfw && feed.toLowerCase() === 'all' && !s.nsfwInAll) return false
  if (s.hideReadPosts && read[p.name] && aggregate) return false
  if (!aggregate && !s.filterInSubreddits) return true
  if (f.subreddits.includes(sub)) return false
  if (f.users.includes(p.author.toLowerCase())) return false
  if (f.domains.length && f.domains.some((d) => p.domain.toLowerCase() === d || p.domain.toLowerCase().endsWith(`.${d}`))) return false
  if (f.flairs.length && p.flair && f.flairs.includes(p.flair.text.toLowerCase())) return false
  if (f.keywords.length) {
    const title = p.title.toLowerCase()
    if (f.keywords.some((k) => title.includes(k))) return false
  }
  return true
}

/** Whether a post's media gets the NSFW / spoiler cover (Tag Filters, with per-subreddit exceptions). */
export function covers(p: Post, s: Settings): { nsfw: boolean; spoiler: boolean } {
  const o = s.tagOverrides[p.subreddit.toLowerCase()]
  return { nsfw: o?.nsfw ?? s.blurNsfw, spoiler: o?.spoiler ?? s.blurSpoilers }
}
