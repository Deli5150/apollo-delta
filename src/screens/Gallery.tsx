import { Ionicons } from '@expo/vector-icons'
import { useDockSpace } from '../lib/layout'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Image } from 'expo-image'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, View } from 'react-native'
import { FlatList, GestureDetector, usePinchGesture } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { feedTitle, initialSort } from '../lib/feeds'
import { covers, keep } from '../lib/filters'
import * as api from '../lib/reddit/api'
import { myName } from '../lib/reddit/transport'
import type { Post } from '../lib/reddit/types'
import { useStore, type Settings } from '../lib/store'
import type { RootParams } from '../nav'
import { postMenu } from '../ui/actions'
import { Empty, ErrorView, Header, IconButton, Loading, Screen } from '../ui/kit'
import { openViewer, pick, viewerItems, type ViewerSequence } from '../ui/media'
import { colors } from '../ui/theme'

// Gallery View: a feed's (or your saved posts') pictures and videos as a grid of 2–6 columns:
// pinch to change it on phones, the column buttons on desktop.

const MIN_COLS = 2
const MAX_COLS = 6
const phone = Platform.OS !== 'web'
/** The column count you last picked (kept for the next Gallery View). */
let lastCols = 3

/** One square tile: the post's picture (or a video's poster), opening the viewer. */
const Tile = memo(function Tile({ post, size, settings, sequence }: { post: Post; size: number; settings: Settings; sequence: ViewerSequence }) {
  const m = post.media
  const thumb = m.kind === 'image' || m.kind === 'gif' ? pick(m.image, size * 1.5) : m.kind === 'gallery' ? pick(m.items[0], size * 1.5) : m.kind === 'video' ? m.poster : undefined
  const cover = covers(post, settings)
  const blur = (post.nsfw && cover.nsfw) || (post.spoiler && cover.spoiler)
  return (
    <Pressable onPress={() => openViewer(viewerItems(m), 0, post, sequence)} onLongPress={() => postMenu(post)} style={{ width: size, height: size, padding: 1 }}>
      <View style={{ flex: 1, backgroundColor: colors.field }}>
        {thumb && <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" blurRadius={blur ? 30 : 0} recyclingKey={post.name} cachePolicy="memory-disk" />}
        {(m.kind === 'video' || m.kind === 'gallery' || m.kind === 'gif') && (
          <View style={{ position: 'absolute', top: 6, right: 6 }}>
            <Ionicons name={m.kind === 'gallery' ? 'images' : m.kind === 'gif' ? 'infinite' : 'play'} size={16} color="#fff" style={{ textShadowColor: '#000', textShadowRadius: 4 } as object} />
          </View>
        )}
      </View>
    </Pressable>
  )
})

export default function Gallery({ route }: NativeStackScreenProps<RootParams, 'Gallery'>) {
  const dock = useDockSpace()
  const feed = route.params.feed
  const saved = feed.startsWith('saved:')
  const category = saved ? feed.slice(6) : ''
  const settings = useStore((s) => s.settings)
  const read = useStore((s) => s.read)
  const itemCategories = useStore((s) => s.itemCategories)
  const [items, setItems] = useState<Post[]>([])
  const [after, setAfter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cols, setCols] = useState(lastCols)
  const [width, setWidth] = useState(900)

  const load = useCallback(
    async (from: string | null) => {
      try {
        const { sort, time } = initialSort(feed)
        const page = saved ? await api.userListing(myName() ?? '', 'saved', 'new', from) : await api.feed(feed, sort, time, from, 50)
        const posts = (page.items.filter((x) => x.kind === 't3') as Post[]).filter((p) => (!saved || !category || itemCategories[p.name] === category) && viewerItems(p.media).length > 0 && (saved || keep(p, settings, feed, read)))
        setItems((cur) => (from ? [...cur, ...posts.filter((p) => !cur.some((c) => c.name === p.name))] : posts))
        setAfter(page.after)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [feed]
  )
  useEffect(() => void load(null), [load])

  // The viewer's arrow keys go on through the grid's posts, loading more near the end.
  const latest = useRef({ items, after, loading })
  latest.current = { items, after, loading }
  const sequence = useMemo<ViewerSequence>(
    () => ({
      posts: () => latest.current.items,
      onNearEnd: () => {
        const { after: next, loading: busy } = latest.current
        if (next && !busy) {
          setLoading(true)
          void load(next)
        }
      }
    }),
    [load]
  )
  const size = Math.floor(width / cols)

  // The first tile on screen, so a new column count opens at the same place.
  const top = useRef(0)
  const onViewable = useRef(({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
    const first = viewableItems.find((v) => v.index != null)
    if (first?.index != null) top.current = first.index
  }).current
  const resize = useCallback((d: number) => setCols((c) => (lastCols = Math.min(MAX_COLS, Math.max(MIN_COLS, c + d)))), [])

  // Phones: pinch the grid apart for bigger tiles, together for more of them. Each step past the
  // threshold changes the count by one; the grid stretches a little under your fingers meanwhile.
  const colsNow = useSharedValue(cols)
  useEffect(() => {
    colsNow.value = cols
  }, [cols, colsNow])
  const base = useSharedValue(1)
  const stretch = useSharedValue(1)
  const pinch = usePinchGesture({
    enabled: phone,
    onActivate: () => {
      'worklet'
      base.value = 1
    },
    onUpdate: (e) => {
      'worklet'
      const r = e.scale / base.value
      if (r > 1.3 && colsNow.value > MIN_COLS) {
        base.value = e.scale
        colsNow.value -= 1
        scheduleOnRN(resize, -1)
      } else if (r < 0.77 && colsNow.value < MAX_COLS) {
        base.value = e.scale
        colsNow.value += 1
        scheduleOnRN(resize, 1)
      }
      stretch.value = Math.min(1.08, Math.max(0.94, e.scale / base.value))
    },
    onDeactivate: () => {
      'worklet'
      stretch.value = withSpring(1, { damping: 18, stiffness: 260 })
    }
  })
  const pinchStyle = useAnimatedStyle(() => ({ transform: [{ scale: stretch.value }] }))
  return (
    <Screen>
      <Header
        title={saved ? (category || 'Saved') : feedTitle(feed)}
        subtitle="Gallery View"
        right={
          phone ? undefined : (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="remove" label="Bigger Tiles" disabled={cols <= MIN_COLS} onPress={() => resize(-1)} />
              <IconButton icon="add" label="Smaller Tiles" disabled={cols >= MAX_COLS} onPress={() => resize(1)} />
            </View>
          )
        }
      />
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <GestureDetector gesture={pinch}>
        <Animated.View collapsable={false} style={[{ flex: 1 }, pinchStyle]}>
        <FlatList
          key={cols}
          data={items}
          numColumns={cols}
          contentContainerStyle={{ paddingBottom: dock }}
          keyExtractor={(p) => p.name}
          // Every row is a square tile, so the list can jump straight to where you were.
          getItemLayout={(_, i) => ({ length: size, offset: size * i, index: i })}
          initialScrollIndex={Math.floor(top.current / cols)}
          onViewableItemsChanged={onViewable}
          simultaneousWith={phone ? pinch : undefined}
          renderItem={({ item }) => <Tile post={item} size={size} settings={settings} sequence={sequence} />}
          initialNumToRender={cols * 6}
          maxToRenderPerBatch={cols * 4}
          windowSize={7}
          removeClippedSubviews={phone}
          ListEmptyComponent={loading ? <Loading /> : error ? <ErrorView error={error} /> : <Empty icon="images-outline" title="No pictures or videos here" />}
          ListFooterComponent={after && items.length ? <ActivityIndicator style={{ padding: 20 }} color={colors.accentHi} /> : undefined}
          onEndReached={() => after && !loading && (setLoading(true), void load(after))}
          onEndReachedThreshold={1.5}
        />
        </Animated.View>
        </GestureDetector>
      </View>
    </Screen>
  )
}

