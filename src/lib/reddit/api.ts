import * as parse from './parse'
import { get, myName, post, transport, useSession } from './transport'
import type { Comment, CommentSort, Flair, Listing, Message, More, Multi, Post, Sort, Subreddit, TimeRange, Trophy, User, Vote } from './types'

// Everything the app asks Reddit for, by what it is rather than by URL.

type Raw = Record<string, any>

const children = (j: Raw): Raw[] => j?.data?.children ?? []

function postListing(j: Raw): Listing<Post> {
  const me = myName()
  return { items: children(j).filter((c) => c.kind === 't3').map((c) => parse.post(c.data, me)), after: j?.data?.after ?? null }
}

function mixedListing(j: Raw): Listing<Post | Comment> {
  const me = myName()
  return {
    items: children(j)
      .filter((c) => c.kind === 't3' || c.kind === 't1')
      .map((c) => (c.kind === 't3' ? parse.post(c.data, me) : parse.comment(c.data))),
    after: j?.data?.after ?? null
  }
}

// ── Feeds ────────────────────────────────────────────────────────────────────────────────────

/**
 * A feed: '' (your home), 'popular', 'all', a subreddit, `a+b` (several), or a multireddit path
 * (`/user/<name>/m/<multi>`).
 */
export function feedPath(feed: string, sort: Sort): string {
  if (feed.startsWith('/user/') || feed.startsWith('/u/')) return `${feed.replace(/^\/u\//, '/user/')}/${sort}`
  if (!feed) return `/${sort}`
  return `/r/${feed}/${sort}`
}

export async function feed(feed: string, sort: Sort, time: TimeRange | undefined, after?: string | null, limit = 25): Promise<Listing<Post>> {
  const j = await get(feedPath(feed, sort), { after, limit, t: sort === 'top' || sort === 'controversial' ? time : undefined, sr_detail: 1 })
  const listing = postListing(j)
  // sr_detail gives each post its subreddit's icon.
  children(j).forEach((c, i) => {
    const icon = c.data?.sr_detail?.community_icon || c.data?.sr_detail?.icon_img
    const p = listing.items[i]
    if (icon && p) p.subredditIcon = String(icon).replace(/&amp;/g, '&')
  })
  return listing
}

export async function postsById(names: string[]): Promise<Post[]> {
  if (!names.length) return []
  const out: Post[] = []
  for (let i = 0; i < names.length; i += 100) {
    const j = await get('/api/info', { id: names.slice(i, i + 100).join(',') })
    out.push(...postListing(j).items)
  }
  return out
}

// ── Comments ─────────────────────────────────────────────────────────────────────────────────

export interface Thread {
  post: Post
  comments: Array<Comment | More>
}

/** A post and its comments. `focus` opens one comment's thread (with `context` parents above it). */
export async function thread(postId: string, sort?: CommentSort, focus?: string, context?: number): Promise<Thread> {
  const id = postId.replace(/^t3_/, '')
  const path = focus ? `/comments/${id}/_/${focus.replace(/^t1_/, '')}` : `/comments/${id}`
  const j = await get(path, { sort, context: focus ? (context ?? 3) : undefined, limit: 200, sr_detail: 1 })
  if (!Array.isArray(j)) throw new Error('Reddit answered something unexpected.')
  const p = parse.post(children(j[0])[0].data, myName())
  const icon = children(j[0])[0].data?.sr_detail?.community_icon
  if (icon) p.subredditIcon = String(icon).replace(/&amp;/g, '&')
  const comments = children(j[1]).map((c) => (c.kind === 'more' ? parse.more(c.data) : parse.comment(c.data)))
  return { post: p, comments }
}

/** The comments behind a "load more" row, as a flat list in thread order (with parent ids). */
export async function moreChildren(linkName: string, more: More, sort?: CommentSort): Promise<Array<Comment | More>> {
  const j = await get('/api/morechildren', { link_id: linkName, children: more.children.slice(0, 100).join(','), sort, api_type: 'json', limit_children: false })
  const things: Raw[] = j?.json?.data?.things ?? []
  return things.map((t) => (t.kind === 'more' ? parse.more(t.data) : parse.comment(t.data)))
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────

export const vote = (name: string, dir: Vote) => post('/api/vote', { id: name, dir, rank: 2 })
export const save = (name: string, category?: string) => post('/api/save', { id: name, category })
export const unsave = (name: string) => post('/api/unsave', { id: name })
export const hide = (name: string) => post('/api/hide', { id: name })
export const unhide = (name: string) => post('/api/unhide', { id: name })
export const del = (name: string) => post('/api/del', { id: name })
export const markNsfw = (name: string, on: boolean) => post(on ? '/api/marknsfw' : '/api/unmarknsfw', { id: name })
export const markSpoiler = (name: string, on: boolean) => post(on ? '/api/spoiler' : '/api/unspoiler', { id: name })
export const sendReplies = (name: string, on: boolean) => post('/api/sendreplies', { id: name, state: on })
export const report = (name: string, reason: string) => post('/api/report', { thing_id: name, reason: 'other', other_reason: reason })
export const blockUser = (name: string) => post('/api/block_user', { name })
export const subscribe = (sr: string, on: boolean) => post('/api/subscribe', { action: on ? 'sub' : 'unsub', sr_name: sr, skip_initial_defaults: true })
export const friend = (name: string, on: boolean) =>
  on ? post('/api/friend', { name, type: 'friend' }) : post('/api/unfriend', { name, type: 'friend', container: '' })

/** Posts a reply to a post or comment (or message); returns the new comment. */
export async function reply(parent: string, text: string): Promise<Comment | Message> {
  const j = await post('/api/comment', { thing_id: parent, text })
  const thing = j?.json?.data?.things?.[0]
  if (!thing) throw new Error('Reddit didn\'t return the new comment.')
  return thing.kind === 't4' ? parse.message('t4', thing.data) : { ...parse.comment(thing.data), depth: 0 }
}

export async function edit(name: string, text: string): Promise<Comment | Post> {
  const j = await post('/api/editusertext', { thing_id: name, text })
  const thing = j?.json?.data?.things?.[0]
  return thing.kind === 't3' ? parse.post(thing.data, myName()) : parse.comment(thing.data)
}

export interface Submission {
  sr: string
  title: string
  kind: 'self' | 'link' | 'image' | 'video'
  text?: string
  url?: string
  nsfw?: boolean
  spoiler?: boolean
  flairId?: string
  flairText?: string
  sendReplies?: boolean
}

/** Submits a post; returns its URL. */
export async function submit(s: Submission): Promise<string> {
  const j = await post('/api/submit', {
    sr: s.sr,
    title: s.title,
    kind: s.kind,
    text: s.kind === 'self' ? s.text : undefined,
    url: s.kind !== 'self' ? s.url : undefined,
    nsfw: s.nsfw,
    spoiler: s.spoiler,
    flair_id: s.flairId,
    flair_text: s.flairText,
    sendreplies: s.sendReplies ?? true,
    resubmit: true
  })
  return j?.json?.data?.url ?? ''
}

export async function uploadImage(file: { name: string; mimetype: string; base64: string }): Promise<string> {
  const id = useSession.getState().current
  if (!id) throw new Error('Sign in first.')
  const r = await transport.upload(id, file)
  if (!r.url) throw new Error(r.error ?? 'Upload failed.')
  return r.url
}

export interface LinkFlair {
  id: string
  text: string
  /** How it looks: colours and emoji, for previews. */
  flair: Flair
  editable: boolean
  modOnly: boolean
}

/** The post flairs a subreddit offers. */
export async function linkFlairs(sr: string): Promise<LinkFlair[]> {
  try {
    const j = await get(`/r/${sr}/api/link_flair_v2`)
    return (Array.isArray(j) ? j : [])
      .map((f: Raw) => ({
        id: f.id,
        text: f.text ?? '',
        flair: parse.flair(f.text, f.type === 'richtext' ? f.richtext : null, f.background_color, f.text_color) ?? ({ text: f.text ?? '' } as Flair),
        editable: Boolean(f.text_editable),
        modOnly: Boolean(f.mod_only)
      }))
      .filter((f: LinkFlair) => f.text || f.flair.parts?.length)
  } catch {
    return []
  }
}

// ── Subreddits ───────────────────────────────────────────────────────────────────────────────

export async function about(sr: string): Promise<Subreddit> {
  const j = await get(`/r/${sr}/about`)
  return parse.subreddit(j.data)
}

export async function rules(sr: string): Promise<Array<{ title: string; description: string }>> {
  const j = await get(`/r/${sr}/about/rules`)
  return (j.rules ?? []).map((r: Raw) => ({ title: r.short_name, description: r.description ?? '' }))
}

export async function moderators(sr: string): Promise<string[]> {
  try {
    const j = await get(`/r/${sr}/about/moderators`)
    return children(j).map((c) => c.name)
  } catch {
    return []
  }
}

export async function wiki(sr: string, page = 'index'): Promise<{ html: string; revised?: number }> {
  const j = await get(`/r/${sr}/wiki/${page}`)
  return { html: j.data?.content_html ?? '', revised: j.data?.revision_date ? j.data.revision_date * 1000 : undefined }
}

/** Every subreddit you're subscribed to (in pages of 100). */
export async function subscriptions(): Promise<Subreddit[]> {
  const out: Subreddit[] = []
  let after: string | null = null
  for (let i = 0; i < 20; i++) {
    const j = await get('/subreddits/mine/subscriber', { limit: 100, after })
    out.push(...children(j).map((c) => parse.subreddit(c.data)))
    after = j?.data?.after ?? null
    if (!after) break
  }
  return out
}

export async function multis(): Promise<Multi[]> {
  try {
    const j = await get('/api/multi/mine', { expand_srs: false })
    return (Array.isArray(j) ? j : []).map((m: Raw) => parse.multi(m.data))
  } catch {
    return []
  }
}

export async function createMulti(name: string, subreddits: string[]): Promise<void> {
  const user = myName()
  const path = `/user/${user}/m/${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`
  await post(`/api/multi${path}`, { model: JSON.stringify({ display_name: name, subreddits: subreddits.map((n) => ({ name: n })), visibility: 'private' }) })
}

export async function deleteMulti(path: string): Promise<void> {
  const id = useSession.getState().current
  if (!id) return
  await transport.request(id, { url: `https://www.reddit.com/api/multi${path}`, method: 'DELETE' })
}

export async function addToMulti(path: string, sr: string): Promise<void> {
  const id = useSession.getState().current
  if (!id) return
  await transport.request(id, { url: `https://www.reddit.com/api/multi${path}/r/${sr}`, method: 'PUT', form: { model: JSON.stringify({ name: sr }) } })
}

export async function searchSubreddits(q: string, nsfw = false, limit = 25): Promise<Subreddit[]> {
  const j = await get('/subreddits/search', { q, limit, include_over_18: nsfw ? 'on' : undefined })
  return children(j).map((c) => parse.subreddit(c.data))
}

export async function popularSubreddits(after?: string | null): Promise<Listing<Subreddit>> {
  const j = await get('/subreddits/popular', { limit: 50, after })
  return { items: children(j).map((c) => parse.subreddit(c.data)), after: j?.data?.after ?? null }
}

export async function newSubreddits(): Promise<Subreddit[]> {
  const j = await get('/subreddits/new', { limit: 25 })
  return children(j).map((c) => parse.subreddit(c.data))
}

/** A random subreddit's name. */
export async function randomSubreddit(nsfw = false): Promise<string> {
  const j = await get(nsfw ? '/r/randnsfw' : '/r/random', { limit: 1 })
  const first = Array.isArray(j) ? children(j[0])[0] : children(j)[0]
  if (!first?.data?.subreddit) throw new Error('No subreddit came back.')
  return first.data.subreddit
}

// ── Search ───────────────────────────────────────────────────────────────────────────────────

export type SearchSort = 'relevance' | 'hot' | 'top' | 'new' | 'comments'

export async function searchPosts(q: string, opts: { sr?: string; sort?: SearchSort; time?: TimeRange; after?: string | null; nsfw?: boolean } = {}): Promise<Listing<Post>> {
  const path = opts.sr ? `/r/${opts.sr}/search` : '/search'
  const j = await get(path, { q, sort: opts.sort, t: opts.time, after: opts.after, limit: 25, restrict_sr: opts.sr ? 1 : undefined, include_over_18: opts.nsfw ? 'on' : undefined, type: 'link' })
  return postListing(j)
}

export async function searchUsers(q: string): Promise<User[]> {
  const j = await get('/users/search', { q, limit: 10 })
  return children(j).map((c) => parse.user(c.data))
}

// ── Users ────────────────────────────────────────────────────────────────────────────────────

export async function userAbout(name: string): Promise<User> {
  const j = await get(`/user/${name}/about`)
  return parse.user(j.data)
}

export type UserWhere = 'overview' | 'submitted' | 'comments' | 'saved' | 'upvoted' | 'downvoted' | 'hidden' | 'gilded'

export async function userListing(name: string, where: UserWhere, sort: 'new' | 'hot' | 'top' | 'controversial' = 'new', after?: string | null, time?: TimeRange): Promise<Listing<Post | Comment>> {
  const j = await get(`/user/${name}/${where}`, { sort, after, limit: 25, t: sort === 'top' || sort === 'controversial' ? time : undefined })
  return mixedListing(j)
}

export async function trophies(name: string): Promise<Trophy[]> {
  try {
    const j = await get(`/user/${name}/trophies`)
    return (j?.data?.trophies ?? []).map((t: Raw) => parse.trophy(t.data))
  } catch {
    return []
  }
}

/** Avatars for a set of accounts by their ids (`t2_…`, one request for up to 100), by username. */
export async function userAvatars(accountIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(accountIds.filter((n) => n?.startsWith('t2_')))].slice(0, 100)
  if (!ids.length) return {}
  try {
    const j = await get('/api/user_data_by_account_ids', { ids: ids.join(',') })
    const out: Record<string, string> = {}
    for (const v of Object.values(j as Record<string, Raw>)) if (v?.name && v.profile_img) out[v.name] = String(v.profile_img).replace(/&amp;/g, '&')
    return out
  } catch {
    return {}
  }
}

// ── Inbox ────────────────────────────────────────────────────────────────────────────────────

export type InboxWhere = 'inbox' | 'unread' | 'messages' | 'comments' | 'selfreply' | 'mentions' | 'sent'

export async function inbox(where: InboxWhere, after?: string | null): Promise<Listing<Message>> {
  const j = await get(`/message/${where}`, { after, limit: 25, mark: false })
  return { items: children(j).map((c) => parse.message(c.kind, c.data)), after: j?.data?.after ?? null }
}

export const markRead = (names: string[]) => post('/api/read_message', { id: names.join(',') })
export const markUnread = (names: string[]) => post('/api/unread_message', { id: names.join(',') })
export const markAllRead = () => post('/api/read_all_messages', {})

export const compose = (to: string, subject: string, text: string) => post('/api/compose', { to, subject, text })

export type { Comment, Listing, Message, More, Multi, Post, Subreddit, User }
