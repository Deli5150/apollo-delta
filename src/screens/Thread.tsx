import { Ionicons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, View, type LayoutChangeEvent } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { covers } from '../lib/filters'
import { compact, redditUrl } from '../lib/format'
import * as api from '../lib/reddit/api'
import { myName } from '../lib/reddit/transport'
import type { Comment, CommentSort, More, Post } from '../lib/reddit/types'
import { useNewReplies } from '../lib/replies'
import { markRead, useStore } from '../lib/store'
import { usePatched } from '../lib/things'
import { toggleTranslation, useTranslations } from '../lib/translate'
import { go, openUrl, type RootParams } from '../nav'
import { commentMenu, doSave, doVote, fail, postMenu, share } from '../ui/actions'
import { Html } from '../ui/Html'
import { Avatar, Empty, ErrorView, Header, IconButton, Loading, Pill, Screen } from '../ui/kit'
import { hasMedia, PostMedia } from '../ui/media'
import { showMenu } from '../ui/overlays'
import { FlairPill, ScoreButton, Time } from '../ui/PostCard'
import { colors, fs } from '../ui/theme'

// A post and its comments.

export const COMMENT_SORTS: Array<{ value: CommentSort; label: string }> = [
  { value: 'confidence', label: 'Best' },
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'New' },
  { value: 'controversial', label: 'Controversial' },
  { value: 'old', label: 'Old' },
  { value: 'qa', label: 'Q&A' }
]

type Node = Comment | More

type Row = { key: string; kind: 'comment'; c: Comment; depth: number; collapsed: boolean; hiddenCount: number } | { key: string; kind: 'more'; m: More; depth: number; parentPath: string[] }

/** Number of comments below a node (for the collapsed label). */
function countBelow(c: Comment): number {
  let n = 0
  for (const r of c.replies) n += r.kind === 't1' ? 1 + countBelow(r) : r.count
  return n
}

function flatten(nodes: Node[], collapsed: Set<string>, depth = 0, path: string[] = [], out: Row[] = []): Row[] {
  for (const n of nodes) {
    if (n.kind === 'more') {
      if (n.count > 0 || n.children.length) out.push({ key: `more-${n.id}-${n.parentId}`, kind: 'more', m: n, depth, parentPath: path })
      continue
    }
    const isCollapsed = collapsed.has(n.name)
    out.push({ key: n.name, kind: 'comment', c: n, depth, collapsed: isCollapsed, hiddenCount: isCollapsed ? countBelow(n) : 0 })
    if (!isCollapsed) flatten(n.replies, collapsed, depth + 1, [...path, n.name], out)
  }
  return out
}

/** Replaces a "more" node (found under the comments named in `path`) with what it loaded. */
function replaceMore(nodes: Node[], path: string[], more: More, loaded: Node[]): Node[] {
  if (!path.length) {
    const i = nodes.indexOf(more)
    if (i < 0) return nodes
    return [...nodes.slice(0, i), ...loaded, ...nodes.slice(i + 1)]
  }
  return nodes.map((n) => (n.kind === 't1' && n.name === path[0] ? { ...n, replies: replaceMore(n.replies, path.slice(1), more, loaded) } : n))
}

/** morechildren's flat list → a tree under `parent`. */
function treeOf(flat: Node[], parent: string): Node[] {
  const byParent = new Map<string, Node[]>()
  for (const n of flat) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const build = (p: string): Node[] => (byParent.get(p) ?? []).map((n) => (n.kind === 't1' ? { ...n, replies: [...n.replies, ...build(n.name)] } : n))
  return build(parent)
}

function insertReply(nodes: Node[], parent: string, c: Comment): Node[] {
  if (parent.startsWith('t3_')) return [c, ...nodes]
  return nodes.map((n) => (n.kind !== 't1' ? n : n.name === parent ? { ...n, replies: [c, ...n.replies] } : { ...n, replies: insertReply(n.replies, parent, c) }))
}

function CommentRow({ row, isNew, avatar, op, onToggle, postId }: { row: Extract<Row, { kind: 'comment' }>; isNew: boolean; avatar?: string; op: string; onToggle: (c: Comment) => void; postId: string }) {
  const c = usePatched(row.c)
  const s = useStore(useShallow((x) => ({ avatars: x.settings.showUserAvatars, inline: x.settings.inlineMedia, scores: x.settings.showScoreOnComments, target: x.settings.translateTarget })))
  const translated = useTranslations((x) => (x.shown[c.name] ? x.byName[c.name] : undefined))
  const loadingTr = useTranslations((x) => x.byName[c.name] === 'loading')
  const [hover, setHover] = useState(false)
  const me = myName()
  const depthColor = colors.depth[(row.depth - 1 + colors.depth.length) % colors.depth.length]
  const authorColor = c.distinguished === 'moderator' ? colors.mod : c.distinguished === 'admin' ? colors.admin : c.author === op ? colors.accentHi : me && c.author.toLowerCase() === me.toLowerCase() ? colors.success : colors.text
  const translate = () => void toggleTranslation(c.name, c.body, s.target).catch(fail)
  return (
    <Pressable
      onPress={() => onToggle(c)}
      onLongPress={() => commentMenu(c, { postId, onTranslate: translate })}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={{ flexDirection: 'row', backgroundColor: isNew ? colors.fresh : colors.card, paddingLeft: 10 + Math.max(0, row.depth - 1) * 12, borderTopWidth: row.depth === 0 ? 8 : 1, borderColor: row.depth === 0 ? colors.bg : colors.separator }}
    >
      {row.depth > 0 && <View style={{ width: 2, borderRadius: 1, backgroundColor: depthColor, marginVertical: 8, marginRight: 9 }} />}
      <View style={{ flex: 1, paddingVertical: 9, paddingRight: 12, gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {s.avatars && <Avatar uri={avatar} name={c.author} size={18} />}
          <Text onPress={() => go('User', { name: c.author })} style={{ color: authorColor, fontWeight: '700', fontSize: fs(13) }}>
            {c.author}
          </Text>
          {c.author === op && <Pill text="OP" color={colors.onAccent} bg={colors.accent} small />}
          {c.distinguished === 'moderator' && <Pill text="MOD" color="#fff" bg={colors.mod} small />}
          {c.stickied && <Ionicons name="pin" size={12} color={colors.mod} />}
          {c.authorFlair && <FlairPill flair={c.authorFlair} small />}
          {s.scores && (
            <Text style={{ color: c.likes === 1 ? colors.upvote : c.likes === -1 ? colors.downvote : colors.dim, fontSize: fs(12.5), fontWeight: '600' }}>
              <Ionicons name="arrow-up" size={11} /> {c.scoreHidden ? '–' : compact(c.score)}
            </Text>
          )}
          <Time ms={c.created} edited={c.edited} style={{ color: colors.dim, fontSize: fs(12.5) }} />
          {c.saved && <Ionicons name="bookmark" size={12} color={colors.success} />}
          {c.awards > 0 && <Ionicons name="trophy" size={11} color="#e9a514" />}
          {isNew && <Pill text="NEW" color={colors.onAccent} bg={colors.accent} small />}
          {row.collapsed && <Text style={{ color: colors.faint, fontSize: fs(12.5) }}>{row.hiddenCount ? `+${row.hiddenCount}` : ''}</Text>}
          <View style={{ flex: 1 }} />
          {(hover || Platform.OS !== 'web') && !row.collapsed && (
            <View style={{ flexDirection: 'row', gap: 0, marginVertical: -6 }}>
              <IconButton icon={c.likes === 1 ? 'arrow-up' : 'arrow-up-outline'} label="Upvote" size={17} color={c.likes === 1 ? colors.upvote : colors.dim} onPress={() => void doVote(c, 1)} />
              <IconButton icon={c.likes === -1 ? 'arrow-down' : 'arrow-down-outline'} label="Downvote" size={17} color={c.likes === -1 ? colors.downvote : colors.dim} onPress={() => void doVote(c, -1)} />
              <IconButton icon="arrow-undo-outline" label="Reply" size={17} color={colors.dim} onPress={() => go('Compose', { mode: 'reply', parent: c.name, parentAuthor: c.author, postId })} />
              <IconButton icon="ellipsis-horizontal" label="More" size={17} color={colors.dim} onPress={() => commentMenu(c, { postId, onTranslate: translate })} />
            </View>
          )}
        </View>
        {!row.collapsed &&
          (c.deleted || c.bodyHtml === '' ? (
            <Text style={{ color: colors.faint, fontStyle: 'italic', fontSize: fs(14.5) }}>{c.body || '[deleted]'}</Text>
          ) : translated && translated !== 'loading' ? (
            <View style={{ gap: 4 }}>
              <Text selectable style={{ color: colors.text, fontSize: fs(14.5), lineHeight: fs(20.5) }}>
                {translated.text}
              </Text>
              <Text onPress={translate} style={{ color: colors.accentHi, fontSize: fs(12) }}>
                Translated{translated.from ? ` from ${translated.from}` : ''} · Show original
              </Text>
            </View>
          ) : (
            <View style={{ opacity: loadingTr ? 0.5 : 1 }}>
              <Html html={c.bodyHtml} size={fs(14.5)} onLink={(u) => void openUrl(u)} inlineMedia={s.inline} mediaMetadata={c.mediaMetadata} />
            </View>
          ))}
      </View>
    </Pressable>
  )
}

function PostHeader({ post: p0, width, commentSort, onSort, hideMedia }: { post: Post; width: number; commentSort: CommentSort; onSort: () => void; hideMedia?: boolean }) {
  const p = usePatched(p0)
  const settings = useStore((s) => s.settings)
  const translated = useTranslations((x) => (x.shown[p.name] ? x.byName[p.name] : undefined))
  const cover = covers(p, settings)
  const [title, ...body] = translated && translated !== 'loading' ? translated.text.split('\n\n') : [p.title]
  return (
    <View style={{ backgroundColor: colors.card }}>
      <View style={{ padding: 14, gap: 8 }}>
        <Pressable onPress={() => go('Feed', { feed: p.subreddit })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Avatar uri={p.subredditIcon} name={p.subreddit} size={20} />
          <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: fs(13.5) }}>r/{p.subreddit}</Text>
        </Pressable>
        <Text selectable style={{ color: colors.text, fontSize: fs(19.5), fontWeight: '700', lineHeight: fs(25.5) }}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          {p.nsfw && <Pill text="NSFW" color="#fff" bg={colors.nsfw} small />}
          {p.spoiler && <Pill text="SPOILER" color="#fff" bg={colors.spoiler} small />}
          {p.flair && <FlairPill flair={p.flair} />}
          {p.locked && <Pill text="Locked" small />}
          {p.archived && <Pill text="Archived" small />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text onPress={() => go('User', { name: p.author })} style={{ color: p.distinguished === 'moderator' ? colors.mod : colors.dim, fontSize: fs(13), fontWeight: '600' }}>
            u/{p.author}
          </Text>
          {p.authorFlair && <FlairPill flair={p.authorFlair} small />}
          <Text style={{ color: colors.faint }}>·</Text>
          <Time ms={p.created} edited={p.edited} style={{ color: colors.dim, fontSize: fs(13) }} />
          {!p.isSelf && <Text style={{ color: colors.faint, fontSize: fs(13) }}>· {p.domain}</Text>}
        </View>
      </View>
      {hasMedia(p) && !hideMedia && (
        <View style={{ marginBottom: 12 }}>
          <PostMedia post={p} width={width} maxHeight={900} autoplay={settings.autoplay} muted={settings.mutedVideos} blurNsfw={cover.nsfw} blurSpoiler={cover.spoiler} richLinks={settings.richLinks} onLink={(u) => void openUrl(u)} full />
        </View>
      )}
      {p.selftextHtml ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {body.length ? (
            <Text selectable style={{ color: colors.text, fontSize: fs(15.5), lineHeight: fs(22) }}>
              {body.join('\n\n')}
            </Text>
          ) : (
            <Html html={p.selftextHtml} size={fs(15.5)} onLink={(u) => void openUrl(u)} inlineMedia={settings.inlineMedia} mediaMetadata={p.mediaMetadata} />
          )}
        </View>
      ) : null}
      {p.pollOptions && (
        <View style={{ marginHorizontal: 14, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: colors.field, gap: 8 }}>
          <Text style={{ color: colors.dim, fontSize: fs(12.5), fontWeight: '700' }}>POLL · {compact(p.pollTotal ?? 0)} votes</Text>
          {p.pollOptions.map((o, i) => {
            const pct = o.votes !== undefined && p.pollTotal ? o.votes / p.pollTotal : undefined
            return (
              <View key={i} style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: colors.card }}>
                {pct !== undefined && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct * 100}%`, backgroundColor: colors.accentSoft }} />}
                <View style={{ flexDirection: 'row', padding: 9 }}>
                  <Text style={{ flex: 1, color: colors.text, fontSize: fs(14) }}>{o.text}</Text>
                  {pct !== undefined && <Text style={{ color: colors.dim, fontSize: fs(13) }}>{Math.round(pct * 100)}%</Text>}
                </View>
              </View>
            )
          })}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderTopWidth: 1, borderColor: colors.separator }}>
        <ScoreButton likes={p.likes} score={p.score} onUp={() => void doVote(p, 1)} onDown={() => void doVote(p, -1)} />
        {p.upvoteRatio !== undefined && <Text style={{ color: colors.faint, fontSize: fs(12.5), marginLeft: 4 }}>{Math.round(p.upvoteRatio * 100)}%</Text>}
        <View style={{ flex: 1 }} />
        <IconButton icon="arrow-undo-outline" label="Reply" color={colors.dim} onPress={() => go('Compose', { mode: 'reply', parent: p.name, parentAuthor: p.author, postId: p.id })} />
        <IconButton icon={p.saved ? 'bookmark' : 'bookmark-outline'} label={p.saved ? 'Unsave' : 'Save'} color={p.saved ? colors.success : colors.dim} onPress={() => void doSave(p)} />
        <IconButton icon="share-outline" label="Share" color={colors.dim} onPress={() => void share(redditUrl(p.permalink), p.title)} />
        <IconButton icon="ellipsis-horizontal" label="More" color={colors.dim} onPress={() => postMenu(p, { inThread: true })} />
      </View>
      <Pressable onPress={onSort} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.separator }}>
        <Ionicons name="chatbubbles-outline" size={15} color={colors.dim} />
        <Text style={{ color: colors.dim, fontSize: fs(13.5), fontWeight: '600', flex: 1 }}>{compact(p.numComments)} comments</Text>
        <Text style={{ color: colors.accentHi, fontSize: fs(13.5), fontWeight: '600' }}>
          Sorted by {COMMENT_SORTS.find((s) => s.value === commentSort)?.label} <Ionicons name="chevron-down" size={12} />
        </Text>
      </Pressable>
    </View>
  )
}

export interface ThreadViewProps {
  id: string
  focus?: string
  initial?: Post
  /** In the three-pane layout: no back button, a close button instead. */
  embedded?: boolean
  onClose?: () => void
  /** Leave out the post's picture or video (shown beside it already). */
  hideMedia?: boolean
}

export function ThreadView({ id, focus: focus0, initial, embedded, onClose, hideMedia }: ThreadViewProps) {
  const settings = useStore(useShallow((s) => ({ sort: s.settings.defaultCommentSort, autoCollapse: s.settings.autoCollapsePinned, collapseChildren: s.settings.collapseChildren, highlight: s.settings.highlightNewComments, jump: s.settings.jumpButton, showJump: s.settings.showJumpButton, avatars: s.settings.showUserAvatars })))
  const [post, setPost] = useState<Post | undefined>(initial)
  const [comments, setComments] = useState<Node[] | null>(null)
  const [sort, setSort] = useState<CommentSort>(settings.sort)
  const [focus, setFocus] = useState(focus0)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loadingMore, setLoadingMore] = useState<Set<string>>(new Set())
  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [width, setWidth] = useState(700)
  const [jumpMode, setJumpMode] = useState(settings.jump)
  const lastVisit = useRef<number | undefined>(useStore.getState().visits[id.replace(/^t3_/, '')])
  const firstVisible = useRef(0)
  const list = useRef<FlatList<Row>>(null)
  const pid = id.replace(/^t3_/, '')
  const newReplies = useNewReplies((s) => s.byPost[pid])
  const applied = useRef(0)

  const load = useCallback(async () => {
    setError(null)
    try {
      const t = await api.thread(pid, sort, focus)
      setPost(t.post)
      setComments(t.comments)
      applied.current = useNewReplies.getState().byPost[pid]?.length ?? 0
      // Pinned (stickied) comments start collapsed; so do Reddit's own collapsed ones.
      const c = new Set<string>()
      const walk = (nodes: Node[], depth: number) => {
        for (const n of nodes) {
          if (n.kind !== 't1') continue
          if ((settings.autoCollapse && n.stickied) || n.collapsedByReddit) c.add(n.name)
          if (settings.collapseChildren && depth === 0 && n.replies.length) c.add(n.name)
          walk(n.replies, depth + 1)
        }
      }
      walk(t.comments, 0)
      setCollapsed(c)
      if (!initial && useStore.getState().settings.markReadOnOpen) markRead(t.post)
      if (settings.avatars) {
        const ids: string[] = []
        const collect = (nodes: Node[]) => nodes.forEach((n) => n.kind === 't1' && (n.authorId && ids.push(n.authorId), collect(n.replies)))
        collect(t.comments)
        void api.userAvatars(ids).then(setAvatars)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [pid, sort, focus])

  useEffect(() => {
    setComments(null)
    void load()
  }, [load])

  // Remember this visit (for highlighting what's new next time).
  useEffect(() => {
    lastVisit.current = useStore.getState().visits[pid]
    useStore.getState().update((d) => ({ visits: { ...d.visits, [pid]: Date.now() } }))
  }, [pid])

  // Your own new comments, from the composer.
  useEffect(() => {
    if (!newReplies || !comments || newReplies.length <= applied.current) return
    let next = comments
    for (const r of newReplies.slice(applied.current)) next = insertReply(next, r.parent, { ...r.comment, depth: 0 })
    applied.current = newReplies.length
    setComments(next)
  }, [newReplies, comments])

  const rows = useMemo(() => (comments ? flatten(comments, collapsed) : []), [comments, collapsed])
  const isNew = useCallback((c: Comment) => Boolean(settings.highlight && lastVisit.current && c.created > lastVisit.current && c.author !== myName()), [settings.highlight])
  const newCount = useMemo(() => (lastVisit.current ? rows.filter((r) => r.kind === 'comment' && isNew(r.c)).length : 0), [rows, isNew])

  const toggle = useCallback((c: Comment) => {
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(c.name)) n.delete(c.name)
      else n.add(c.name)
      return n
    })
  }, [])

  const loadMore = async (row: Extract<Row, { kind: 'more' }>) => {
    if (!post || loadingMore.has(row.key)) return
    // "Continue this thread": open that comment's own thread.
    if (row.m.count === 0 && !row.m.children.length) return setFocus(row.m.parentId.replace(/^t1_/, ''))
    if (!row.m.children.length) return setFocus(row.m.parentId.replace(/^t1_/, ''))
    setLoadingMore((s) => new Set(s).add(row.key))
    try {
      const flat = await api.moreChildren(post.name, row.m, sort)
      const loaded = treeOf(flat, row.m.parentId)
      setComments((cur) => (cur ? replaceMore(cur, row.parentPath, row.m, loaded) : cur))
    } catch (e) {
      fail(e)
    } finally {
      setLoadingMore((s) => {
        const n = new Set(s)
        n.delete(row.key)
        return n
      })
    }
  }

  const sortMenu = () => showMenu('Sort Comments', COMMENT_SORTS.map((o) => ({ label: o.label, selected: o.value === sort, onPress: () => setSort(o.value) })))

  /** The jump button: next top-level comment, or next new comment. Long press goes back one. */
  const jump = (dir: 1 | -1) => {
    const from = firstVisible.current
    const match = (r: Row) => (jumpMode === 'new' ? r.kind === 'comment' && isNew(r.c) : r.depth === 0 && r.kind === 'comment')
    let i = from + dir
    while (i >= 0 && i < rows.length && !match(rows[i])) i += dir
    if (i >= 0 && i < rows.length) list.current?.scrollToIndex({ index: i, animated: true, viewOffset: 0 })
  }

  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    const first = viewableItems.find((v) => v.index !== null)
    if (first?.index != null) firstVisible.current = first.index
  }).current

  const op = post?.author ?? ''
  const header = (
    <Header
      showBack={!embedded}
      left={embedded && onClose ? <IconButton icon="close" label="Close" onPress={onClose} /> : undefined}
      title={post ? `${compact(post.numComments)} Comments` : 'Comments'}
      subtitle={post ? `r/${post.subreddit}` : undefined}
      right={
        <View style={{ flexDirection: 'row' }}>
          {newCount > 0 && (
            <Pressable onPress={() => (setJumpMode('new'), jump(1))} style={{ alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accentSoft, marginRight: 4 }}>
              <Text style={{ color: colors.accentHi, fontSize: fs(12), fontWeight: '700' }}>{newCount} new</Text>
            </Pressable>
          )}
          <IconButton icon="swap-vertical" label="Sort Comments" onPress={sortMenu} />
          {Platform.OS === 'web' && <IconButton icon="refresh" label="Refresh" onPress={() => void load()} />}
          {post && <IconButton icon="ellipsis-horizontal" label="More" onPress={() => postMenu(post, { inThread: true })} />}
        </View>
      }
    />
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {header}
      {!post && error ? (
        <ErrorView error={error} onRetry={() => void load()} />
      ) : !post ? (
        <Loading />
      ) : (
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(r) => r.key}
          ListHeaderComponent={
            <View>
              <PostHeader post={post} width={width} commentSort={sort} onSort={sortMenu} hideMedia={hideMedia} />
              {focus && (
                <Pressable onPress={() => setFocus(undefined)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, backgroundColor: colors.accentSoft, marginTop: 8 }}>
                  <Ionicons name="chatbubbles" size={15} color={colors.accentHi} />
                  <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: fs(13.5) }}>Viewing a single thread · Show all comments</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'comment' ? (
              <CommentRow row={item} isNew={isNew(item.c)} avatar={avatars[item.c.author]} op={op} onToggle={toggle} postId={pid} />
            ) : (
              <Pressable onPress={() => void loadMore(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingLeft: 12 + Math.max(0, item.depth - 1) * 12 + (item.depth > 0 ? 11 : 0), backgroundColor: colors.card, borderTopWidth: item.depth === 0 ? 8 : 1, borderColor: item.depth === 0 ? colors.bg : colors.separator }}>
                {loadingMore.has(item.key) ? <ActivityIndicator size="small" color={colors.accentHi} /> : <Ionicons name={item.m.children.length ? 'chevron-down-circle-outline' : 'arrow-forward-circle-outline'} size={17} color={colors.accentHi} />}
                <Text style={{ color: colors.accentHi, fontSize: fs(13.5), fontWeight: '600' }}>{item.m.children.length ? `${item.m.count || item.m.children.length} more ${(item.m.count || item.m.children.length) === 1 ? 'reply' : 'replies'}` : 'Continue this thread'}</Text>
              </Pressable>
            )
          }
          ListEmptyComponent={comments === null ? (error ? <ErrorView error={error} onRetry={() => void load()} /> : <Loading />) : <Empty icon="chatbubble-outline" title="No comments yet" text="Be the first to reply." />}
          ListFooterComponent={<View style={{ height: 90 }} />}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
          onScrollToIndexFailed={(info) => list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })}
          refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load())} tintColor={colors.accentHi} />}
          initialNumToRender={14}
          windowSize={11}
        />
      )}
      {settings.showJump && rows.length > 3 && (
        <Pressable
          onPress={() => jump(1)}
          onLongPress={() => jump(-1)}
          accessibilityLabel={jumpMode === 'new' ? 'Next new comment' : 'Next thread'}
          style={({ hovered }: any) => ({ position: 'absolute', right: 18, bottom: 22, width: 46, height: 46, borderRadius: 23, backgroundColor: hovered ? colors.accentHi : colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } })}
        >
          <Ionicons name="chevron-down" size={24} color={colors.onAccent} />
          {jumpMode === 'new' && <Text style={{ position: 'absolute', bottom: 3, color: colors.onAccent, fontSize: 8, fontWeight: '900' }}>NEW</Text>}
        </Pressable>
      )}
    </View>
  )
}

export default function ThreadScreen({ route }: NativeStackScreenProps<RootParams, 'Thread'>) {
  return (
    <Screen>
      <ThreadView id={route.params.id} focus={route.params.focus} initial={route.params.post} />
    </Screen>
  )
}

