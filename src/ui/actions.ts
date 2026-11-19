import * as Clipboard from 'expo-clipboard'
import { Platform, Share } from 'react-native'
import * as api from '../lib/reddit/api'
import { myName } from '../lib/reddit/transport'
import type { Comment, Post } from '../lib/reddit/types'
import { redditUrl } from '../lib/format'
import { desktop } from '../lib/storage'
import { forgetRead, toggleFavorite, useStore } from '../lib/store'
import { patched, remove, toggleHide, toggleSave, vote } from '../lib/things'
import { toggleTranslation } from '../lib/translate'
import { go, openExternal } from '../nav'
import { confirm, showMenu, type MenuOption } from './overlays'
import { toast } from './toast'

// What the ••• menus (and swipes / keyboard shortcuts) on posts and comments do.

export const fail = (e: unknown) => toast((e as Error).message || 'Something went wrong')

export async function copy(text: string, what = 'Link'): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text)
  else await Clipboard.setStringAsync(text)
  toast(`${what} copied`)
}

export async function share(url: string, title?: string): Promise<void> {
  if (Platform.OS === 'web') return copy(url)
  await Share.share({ message: url, title })
}

export const doVote = (t: Post | Comment, dir: 1 | -1) => vote(t, dir).catch(fail)

export async function doSave(t: Post | Comment): Promise<void> {
  try {
    const on = await toggleSave(t)
    toast(on ? 'Saved' : 'Unsaved')
  } catch (e) {
    fail(e)
  }
}

/** Save into one of your saved categories. */
export function saveToCategory(t: Post | Comment): void {
  const { savedCategories, itemCategories } = useStore.getState()
  showMenu(
    'Save to Category',
    savedCategories.map((c) => ({
      label: c,
      selected: itemCategories[t.name] === c,
      onPress: () =>
        void toggleSave(t, c)
          .then(() => toast(`Saved to ${c}`))
          .catch(fail)
    }))
  )
}

export async function doHide(p: Post): Promise<void> {
  try {
    const on = await toggleHide(p)
    toast(on ? 'Post hidden' : 'Post unhidden', on ? () => void toggleHide(patched(p)).catch(fail) : undefined)
  } catch (e) {
    fail(e)
  }
}

export function filterSubreddit(sr: string): void {
  useStore.getState().update((d) => ({ settings: { ...d.settings, filters: { ...d.settings.filters, subreddits: [...new Set([...d.settings.filters.subreddits, sr.toLowerCase()])] } } }))
  toast(`r/${sr} filtered out of Home, Popular and All`)
}

export function filterUser(name: string): void {
  useStore.getState().update((d) => ({ settings: { ...d.settings, filters: { ...d.settings.filters, users: [...new Set([...d.settings.filters.users, name.toLowerCase()])] } } }))
  toast(`u/${name}'s posts filtered`)
}

function reportMenu(t: Post | Comment): void {
  const reasons = ['Spam', 'Harassment', 'Hate', 'Violence', 'Sharing personal information', 'Breaks the subreddit rules', 'Impersonation', 'Self-harm or suicide', 'Misinformation']
  showMenu(
    'Report',
    reasons.map((r) => ({ label: r, onPress: () => void api.report(t.name, r).then(() => toast('Reported. Thanks!')).catch(fail) }))
  )
}

export function postMenu(p0: Post, opts: { inThread?: boolean } = {}): void {
  const p = patched(p0)
  const me = myName()
  const own = me && p.author.toLowerCase() === me.toLowerCase()
  const { favorites, settings } = useStore.getState()
  const fav = favorites.some((f) => f.toLowerCase() === p.subreddit.toLowerCase())
  const options: MenuOption[] = [
    { label: p.likes === 1 ? 'Remove Upvote' : 'Upvote', onPress: () => void doVote(p, 1) },
    { label: p.likes === -1 ? 'Remove Downvote' : 'Downvote', onPress: () => void doVote(p, -1) },
    { label: p.saved ? 'Unsave' : 'Save', onPress: () => void doSave(p) },
    { label: 'Save to Category…', onPress: () => saveToCategory(p) },
    { label: p.hidden ? 'Unhide' : 'Hide', onPress: () => void doHide(p) },
    { label: 'Reply', onPress: () => go('Compose', { mode: 'reply', parent: p.name, parentAuthor: p.author, postId: p.id }) },
    { label: 'Share Link', onPress: () => void share(redditUrl(p.permalink), p.title) },
    { label: 'Copy Link', onPress: () => void copy(redditUrl(p.permalink)) },
    ...(!p.isSelf ? [{ label: 'Copy Content Link', onPress: () => void copy(p.url) }] : []),
    { label: 'Copy Title', onPress: () => void copy(p.title, 'Title') },
    ...(p.selftext ? [{ label: 'Copy Text', onPress: () => void copy(p.selftext, 'Text') }] : []),
    { label: 'Translate', onPress: () => void toggleTranslation(p.name, `${p.title}\n\n${p.selftext}`, settings.translateTarget).catch(fail) },
    { label: `r/${p.subreddit}`, sub: 'Go to subreddit', onPress: () => go('Feed', { feed: p.subreddit }) },
    { label: `u/${p.author}`, sub: 'View profile', onPress: () => go('User', { name: p.author }) },
    { label: fav ? `Remove r/${p.subreddit} from Favorites` : `Add r/${p.subreddit} to Favorites`, onPress: () => toggleFavorite(p.subreddit) },
    { label: 'Open in Browser', onPress: () => openExternal(redditUrl(p.permalink)) },
    ...(desktop && p.media.kind !== 'none' && (p.media.kind === 'image' || p.media.kind === 'gif') ? [{ label: 'Save Image', onPress: () => void desktop!.saveMedia((p.media as { image: { url: string } }).image.url).catch(fail) }] : []),
    ...(opts.inThread ? [] : [{ label: 'Mark as Unread', onPress: () => forgetRead(p.name) }]),
    { label: `Filter r/${p.subreddit}`, onPress: () => filterSubreddit(p.subreddit) },
    ...(own
      ? [
          ...(p.isSelf ? [{ label: 'Edit', onPress: () => go('Compose', { mode: 'edit', name: p.name, text: p.selftext, postId: p.id }) }] : []),
          { label: p.nsfw ? 'Unmark NSFW' : 'Mark NSFW', onPress: () => void api.markNsfw(p.name, !p.nsfw).then(() => toast('Updated')).catch(fail) },
          { label: p.spoiler ? 'Unmark Spoiler' : 'Mark Spoiler', onPress: () => void api.markSpoiler(p.name, !p.spoiler).then(() => toast('Updated')).catch(fail) },
          { label: 'Delete', destructive: true, onPress: () => confirm('Delete this post?', "This can't be undone.", 'Delete', () => void remove(p).then(() => toast('Deleted')).catch(fail)) }
        ]
      : [
          { label: 'Report', destructive: true, onPress: () => reportMenu(p) },
          { label: `Block u/${p.author}`, destructive: true, onPress: () => confirm(`Block u/${p.author}?`, "You won't see their posts and comments.", 'Block', () => void api.blockUser(p.author).then(() => (filterUser(p.author), toast('Blocked'))).catch(fail)) }
        ])
  ]
  showMenu(p.title.length > 80 ? `${p.title.slice(0, 80)}…` : p.title, options)
}

export function commentMenu(c0: Comment, opts: { postId?: string; onCollapse?: () => void; onTranslate?: () => void } = {}): void {
  const c = patched(c0)
  const me = myName()
  const own = me && c.author.toLowerCase() === me.toLowerCase()
  const url = redditUrl(c.permalink)
  const options: MenuOption[] = [
    { label: c.likes === 1 ? 'Remove Upvote' : 'Upvote', onPress: () => void doVote(c, 1) },
    { label: c.likes === -1 ? 'Remove Downvote' : 'Downvote', onPress: () => void doVote(c, -1) },
    { label: 'Reply', onPress: () => go('Compose', { mode: 'reply', parent: c.name, parentAuthor: c.author, postId: opts.postId }) },
    { label: c.saved ? 'Unsave' : 'Save', onPress: () => void doSave(c) },
    { label: 'Save to Category…', onPress: () => saveToCategory(c) },
    ...(opts.onCollapse ? [{ label: 'Collapse Thread', onPress: opts.onCollapse }] : []),
    { label: 'Translate', onPress: () => opts.onTranslate?.() },
    { label: 'Copy Text', onPress: () => void copy(c.body, 'Text') },
    { label: 'Share Link', onPress: () => void share(url) },
    { label: 'Copy Link', onPress: () => void copy(url) },
    { label: `u/${c.author}`, sub: 'View profile', onPress: () => go('User', { name: c.author }) },
    ...(own
      ? [
          { label: 'Edit', onPress: () => go('Compose', { mode: 'edit', name: c.name, text: c.body, postId: opts.postId }) },
          { label: 'Delete', destructive: true, onPress: () => confirm('Delete this comment?', "This can't be undone.", 'Delete', () => void remove(c).then(() => toast('Deleted')).catch(fail)) }
        ]
      : [
          { label: 'Report', destructive: true, onPress: () => reportMenu(c) },
          { label: `Block u/${c.author}`, destructive: true, onPress: () => confirm(`Block u/${c.author}?`, "You won't see their posts and comments.", 'Block', () => void api.blockUser(c.author).then(() => toast('Blocked')).catch(fail)) }
        ])
  ]
  showMenu(`u/${c.author}`, options)
}
