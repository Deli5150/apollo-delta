import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, View, type LayoutChangeEvent } from 'react-native'
import type { Listing } from '../lib/reddit/api'
import type { Comment, Post } from '../lib/reddit/types'
import { compact } from '../lib/format'
import { usePatched } from '../lib/things'
import { go, openUrl, parseRedditLink } from '../nav'
import { commentMenu, doVote } from './actions'
import { Html } from './Html'
import { Empty, ErrorView, Loading } from './kit'
import { PostCard, Time } from './PostCard'
import { colors, fs } from './theme'

// A paged list of posts and comments (profiles, saved, search results).

export function CommentCard({ comment }: { comment: Comment }) {
  const c = usePatched(comment)
  if (c.deleted) return null
  const open = () => {
    const link = parseRedditLink(c.permalink)
    if (link?.kind === 'post') go('Thread', { id: link.id, focus: link.focus ?? c.id })
  }
  return (
    <Pressable onPress={open} onLongPress={() => commentMenu(c)} style={({ hovered }: any) => ({ backgroundColor: hovered ? colors.cardHi : colors.card, padding: 14, gap: 6, borderBottomWidth: 8, borderColor: colors.bg })}>
      {c.linkTitle && (
        <Text numberOfLines={2} style={{ color: colors.text, fontWeight: '700', fontSize: fs(14.5) }}>
          {c.linkTitle}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Text onPress={() => go('Feed', { feed: c.subreddit })} style={{ color: colors.accentHi, fontSize: fs(12.5), fontWeight: '600' }}>
          r/{c.subreddit}
        </Text>
        <Text onPress={() => go('User', { name: c.author })} style={{ color: colors.dim, fontSize: fs(12.5) }}>
          · u/{c.author}
        </Text>
        <Text style={{ color: c.likes === 1 ? colors.upvote : c.likes === -1 ? colors.downvote : colors.dim, fontSize: fs(12.5) }} onPress={() => void doVote(c, 1)}>
          · ↑ {compact(c.score)}
        </Text>
        <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>·</Text>
        <Time ms={c.created} edited={c.edited} style={{ color: colors.dim, fontSize: fs(12.5) }} />
      </View>
      <Html html={c.bodyHtml} size={fs(14.5)} onLink={(u) => void openUrl(u)} />
    </Pressable>
  )
}

export function ThingList({ load, deps, header, empty, onOpenPost }: { load: (after: string | null) => Promise<Listing<Post | Comment>>; deps: unknown[]; header?: ReactElement | null; empty?: { title: string; text?: string }; onOpenPost?: (p: Post) => void }) {
  const [items, setItems] = useState<Array<Post | Comment>>([])
  const [after, setAfter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [width, setWidth] = useState(600)
  const req = useRef(0)
  const fetchPage = useCallback(async (more: boolean, from: string | null) => {
    const id = ++req.current
    try {
      const page = await load(more ? from : null)
      if (id !== req.current) return
      setItems((cur) => (more ? [...cur, ...page.items.filter((x: Post | Comment) => !cur.some((c) => c.name === x.name))] : page.items))
      setAfter(page.after)
      setError(null)
    } catch (e) {
      if (id === req.current) setError((e as Error).message)
    } finally {
      if (id === req.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    setLoading(true)
    setItems([])
    void fetchPage(false, null)
  }, [fetchPage])
  const open = useCallback((p: Post) => (onOpenPost ? onOpenPost(p) : go('Thread', { id: p.id, post: p })), [onOpenPost])
  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(Math.min(e.nativeEvent.layout.width, 860))}>
      <FlatList
        data={items}
        keyExtractor={(x) => x.name}
        contentContainerStyle={{ alignItems: 'stretch' }}
        renderItem={({ item }) => (
          <View style={{ width: '100%', maxWidth: 860, alignSelf: 'center' }}>{item.kind === 't3' ? <PostCard post={item} showSubreddit width={width} onOpen={open} /> : <CommentCard comment={item} />}</View>
        )}
        ListHeaderComponent={header ?? undefined}
        ListEmptyComponent={loading ? <Loading /> : error ? <ErrorView error={error} onRetry={() => void fetchPage(false, null)} /> : <Empty icon="file-tray-outline" title={empty?.title ?? 'Nothing here'} text={empty?.text} />}
        ListFooterComponent={after && items.length ? <ActivityIndicator style={{ padding: 20 }} color={colors.accentHi} /> : undefined}
        onEndReached={() => after && !error && void fetchPage(true, after)}
        onEndReachedThreshold={1.2}
        refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void fetchPage(false, null))} tintColor={colors.accentHi} />}
      />
    </View>
  )
}
