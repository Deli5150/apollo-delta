import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, View, type LayoutChangeEvent } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { feedTitle, initialSort, isSubreddit, rememberSort, setSubscribed, SORTS, TIMES } from '../lib/feeds'
import { keep } from '../lib/filters'
import { compact } from '../lib/format'
import { useWide, useDockSpace } from '../lib/layout'
import * as api from '../lib/reddit/api'
import { RedditError, useSession } from '../lib/reddit/transport'
import type { Post, Sort, Subreddit, TimeRange } from '../lib/reddit/types'
import { cacheGet, cacheSet } from '../lib/storage'
import { isFavorite, markRead, toggleFavorite, useStore, visitSubreddit } from '../lib/store'
import { go } from '../nav'
import { fail } from '../ui/actions'
import { Avatar, Button, Empty, ErrorView, Header, IconButton, Loading } from '../ui/kit'
import { showMenu } from '../ui/overlays'
import { PostCard } from '../ui/PostCard'
import { SignInButtons } from '../ui/SignIn'
import { colors, fs, MAX_WIDTH } from '../ui/theme'
import { toast } from '../ui/toast'

// A feed of posts: Home, Popular, All, a subreddit, several, or a multireddit.

export function SubredditHeader({ sr, onAbout }: { sr: Subreddit; onAbout: () => void }) {
  const [subscribed, setSub] = useState(sr.subscribed)
  const favorites = useStore((s) => s.favorites)
  const fav = isFavorite(favorites, sr.name)
  useEffect(() => setSub(sr.subscribed), [sr.subscribed])
  const toggle = async () => {
    const on = !subscribed
    setSub(on)
    try {
      await api.subscribe(sr.name, on)
      setSubscribed(sr, on)
      toast(on ? `Subscribed to r/${sr.name}` : `Left r/${sr.name}`)
    } catch (e) {
      setSub(!on)
      fail(e)
    }
  }
  return (
    <View style={{ backgroundColor: colors.card, marginBottom: 8 }}>
      {sr.banner ? <Image source={{ uri: sr.banner }} style={{ height: 96, backgroundColor: sr.color ?? colors.accentSoft }} contentFit="cover" /> : <View style={{ height: 56, backgroundColor: sr.color ?? colors.accentSoft }} />}
      <View style={{ paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: -24 }}>
        <View style={{ borderRadius: 32, borderWidth: 3, borderColor: colors.card }}>
          <Avatar uri={sr.icon} name={sr.name} size={58} />
        </View>
        <View style={{ flex: 1, paddingBottom: 2 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: fs(19), fontWeight: '800' }}>
            r/{sr.name}
          </Text>
          <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>
            {compact(sr.subscribers)} members{sr.active ? ` · ${compact(sr.active)} online` : ''}
          </Text>
        </View>
        <IconButton icon={fav ? 'star' : 'star-outline'} label={fav ? 'Remove from Favorites' : 'Add to Favorites'} color={fav ? '#f5b83d' : colors.dim} onPress={() => toggleFavorite(sr.name)} />
        <IconButton icon="information-circle-outline" label="About" onPress={onAbout} />
        <Button title={subscribed ? 'Joined' : 'Join'} kind={subscribed ? 'secondary' : 'primary'} onPress={() => void toggle()} style={{ height: 34, paddingHorizontal: 14 }} />
      </View>
      {sr.publicDescription ? (
        <Text numberOfLines={2} style={{ color: colors.dim, fontSize: fs(13.5), paddingHorizontal: 14, paddingBottom: 12, marginTop: -4 }}>
          {sr.publicDescription}
        </Text>
      ) : null}
    </View>
  )
}

interface FeedProps {
  feed: string
  onOpen: (p: Post) => void
  selected?: string | null
  /** Shown at the top-left (the sidebar toggle in the three-pane layout). */
  left?: React.ReactNode
  showBack?: boolean
}

const cacheKey = (account: string | null, feed: string, sort: Sort, time: TimeRange) => `feed-${account}-${feed || 'home'}-${sort}-${time}`.toLowerCase()

export function Feed({ feed, onOpen, selected, left, showBack }: FeedProps) {
  const account = useSession((s) => s.current)
  const s = useStore(useShallow((x) => ({ settings: x.settings, read: x.read, postSize: x.settings.postSize })))
  const [{ sort, time }, setSortState] = useState(() => initialSort(feed))
  const [items, setItems] = useState<Post[]>([])
  const [after, setAfter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<RedditError | null>(null)
  const [sr, setSr] = useState<Subreddit | null>(null)
  const [width, setWidth] = useState(600)
  const req = useRef(0)
  const list = useRef<FlatList<Post>>(null)
  const dock = useDockSpace()
  const wide = useWide()
  const sub = isSubreddit(feed)

  const load = useCallback(
    async (more: boolean, nextAfter: string | null = null) => {
      const id = ++req.current
      if (!more) setError(null)
      try {
        const page = await api.feed(feed, sort, time, more ? nextAfter : null)
        if (id !== req.current) return
        setItems((prev) => {
          if (!more) return page.items
          const seen = new Set(prev.map((p) => p.name))
          return [...prev, ...page.items.filter((p) => !seen.has(p.name))]
        })
        setAfter(page.after)
        if (!more) void cacheSet(cacheKey(account, feed, sort, time), JSON.stringify(page))
      } catch (e) {
        if (id === req.current) setError(e as RedditError)
      } finally {
        if (id === req.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [feed, sort, time, account]
  )

  // A feed opens with its cached first page (if any) while the fresh one loads.
  useEffect(() => {
    let live = true
    setLoading(true)
    setItems([])
    setAfter(null)
    void cacheGet(cacheKey(account, feed, sort, time)).then((c) => {
      if (!live || !c) return
      try {
        const page = JSON.parse(c)
        setItems((cur) => (cur.length ? cur : page.items))
      } catch {}
    })
    if (account) void load(false)
    else setLoading(false)
    return () => {
      live = false
    }
  }, [load, account])

  useEffect(() => {
    setSr(null)
    if (!sub || !account) return
    visitSubreddit(feed)
    let live = true
    api
      .about(feed)
      .then((x) => live && setSr(x))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [feed, account, sub])

  const shown = useMemo(() => items.filter((p) => keep(p, s.settings, feed, s.read)), [items, s.settings, feed, s.read])

  const setSort = (next: Sort, nextTime: TimeRange = time) => {
    setSortState({ sort: next, time: nextTime })
    rememberSort(feed, next, nextTime)
    list.current?.scrollToOffset({ offset: 0, animated: false })
  }

  const sortMenu = () =>
    showMenu(
      'Sort Posts',
      SORTS.filter((o) => o.value !== 'best' || !feed || feed === 'popular').map((o) => ({
        label: o.label,
        selected: o.value === sort,
        onPress: () =>
          o.value === 'top' || o.value === 'controversial'
            ? setTimeout(() => showMenu(`${o.label} Posts From`, TIMES.map((t) => ({ label: t.label, selected: o.value === sort && t.value === time, onPress: () => setSort(o.value, t.value) }))), 10)
            : setSort(o.value)
      }))
    )

  const moreMenu = () =>
    showMenu(feedTitle(feed), [
      { label: s.postSize === 'large' ? 'Compact Posts' : 'Large Posts', onPress: () => useStore.getState().set('postSize', s.postSize === 'large' ? 'compact' : 'large') },
      { label: 'Gallery View', onPress: () => go('Gallery', { feed }) },
      { label: 'Search This Feed', onPress: () => go('SettingsPage', { page: `search:${feed}` }) },
      ...(sub ? [{ label: 'New Post', onPress: () => go('Compose', { mode: 'post', sr: feed }) }, { label: 'About & Rules', onPress: () => go('About', { sr: feed }) }, { label: 'Wiki', onPress: () => go('Wiki', { sr: feed }) }] : []),
      { label: s.settings.hideReadPosts ? 'Show Read Posts' : 'Hide Read Posts', onPress: () => useStore.getState().set('hideReadPosts', !s.settings.hideReadPosts) },
      { label: 'Refresh', onPress: () => void refresh() }
    ])

  const refresh = async () => {
    setRefreshing(true)
    await load(false)
  }

  const open = useCallback(
    (p: Post) => {
      if (useStore.getState().settings.markReadOnOpen) markRead(p)
      onOpen(p)
    },
    [onOpen]
  )

  const sortLabel = SORTS.find((o) => o.value === sort)?.label ?? sort
  const timeLabel = sort === 'top' || sort === 'controversial' ? ` · ${TIMES.find((t) => t.value === time)?.label}` : ''

  const header = (
    <Header
      showBack={showBack}
      left={left}
      center={
        <Pressable onPress={sortMenu} style={{ alignSelf: 'flex-start' }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: fs(17), fontWeight: '700' }}>
            {feedTitle(feed)}
          </Text>
          <Text style={{ color: colors.dim, fontSize: fs(12) }}>
            {sortLabel}
            {timeLabel} <Ionicons name="chevron-down" size={11} color={colors.dim} />
          </Text>
        </Pressable>
      }
      right={
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="swap-vertical" label="Sort" onPress={sortMenu} />
          {sub && <IconButton icon="create-outline" label="New Post" onPress={() => go('Compose', { mode: 'post', sr: feed })} />}
          {Platform.OS === 'web' && <IconButton icon="refresh" label="Refresh" onPress={() => void refresh()} />}
          <IconButton icon="ellipsis-horizontal" label="More" onPress={moreMenu} />
        </View>
      }
    />
  )

  if (!account)
    return (
      <View style={{ flex: 1 }}>
        {header}
        <Empty icon="person-circle-outline" title="Sign in to Reddit" text="Apollo Delta reads Reddit through your own signed-in session, so no API key is needed." action={<SignInButtons />} />
      </View>
    )

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {header}
      <FlatList
        ref={list}
        data={shown}
        contentContainerStyle={{ paddingBottom: dock }}
        keyExtractor={(p) => p.name}
        renderItem={({ item }) => (
          <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}>
            <PostCard post={item} showSubreddit={!sub} width={Math.min(width, MAX_WIDTH)} selected={selected === item.name} onOpen={open} />
          </View>
        )}
        ListHeaderComponent={sr ? <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' }}><SubredditHeader sr={sr} onAbout={() => go('About', { sr: sr.name })} /></View> : undefined}
        ListEmptyComponent={
          loading ? <Loading /> : error ? <ErrorView error={error.message} onRetry={() => (setLoading(true), void load(false))} /> : <Empty icon="file-tray-outline" title="No posts" text={items.length ? 'Your filters hid every post here.' : undefined} />
        }
        ListFooterComponent={
          shown.length && after ? (
            <View style={{ padding: 20 }}>
              <ActivityIndicator color={colors.accentHi} />
            </View>
          ) : error && shown.length ? (
            <ErrorView error={error.message} onRetry={() => void load(true, after)} />
          ) : undefined
        }
        onEndReached={() => after && !error && void load(true, after)}
        onEndReachedThreshold={1.5}
        refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accentHi} />}
        initialNumToRender={6}
        windowSize={wide ? 7 : 9}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </View>
  )
}
