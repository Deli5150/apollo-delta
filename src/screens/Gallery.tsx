import { Ionicons } from '@expo/vector-icons'
import { useDockSpace } from '../lib/layout'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Image } from 'expo-image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { feedTitle, initialSort } from '../lib/feeds'
import { covers, keep } from '../lib/filters'
import * as api from '../lib/reddit/api'
import { myName } from '../lib/reddit/transport'
import type { Post } from '../lib/reddit/types'
import { useStore } from '../lib/store'
import type { RootParams } from '../nav'
import { postMenu } from '../ui/actions'
import { Empty, ErrorView, Header, IconButton, Loading, Screen } from '../ui/kit'
import { openViewer, pick, viewerItems, type ViewerSequence } from '../ui/media'
import { colors } from '../ui/theme'

// Gallery View: a feed's (or your saved posts') pictures and videos as a grid. Pinch-free on
// desktop: the column buttons pick 2–5 columns.

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
  const [cols, setCols] = useState(3)
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
  return (
    <Screen>
      <Header
        title={saved ? (category || 'Saved') : feedTitle(feed)}
        subtitle="Gallery View"
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="remove" label="Bigger Tiles" disabled={cols <= 2} onPress={() => setCols((c) => Math.max(2, c - 1))} />
            <IconButton icon="add" label="Smaller Tiles" disabled={cols >= 6} onPress={() => setCols((c) => Math.min(6, c + 1))} />
          </View>
        }
      />
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <FlatList
          key={cols}
          data={items}
          numColumns={cols}
          contentContainerStyle={{ paddingBottom: dock }}
          keyExtractor={(p) => p.name}
          renderItem={({ item }) => {
            const m = item.media
            const thumb = m.kind === 'image' || m.kind === 'gif' ? pick(m.image, size * 1.5) : m.kind === 'gallery' ? pick(m.items[0], size * 1.5) : m.kind === 'video' ? m.poster : undefined
            const cover = covers(item, settings)
            const blur = (item.nsfw && cover.nsfw) || (item.spoiler && cover.spoiler)
            return (
              <Pressable onPress={() => openViewer(viewerItems(m), 0, item, sequence)} onLongPress={() => postMenu(item)} style={{ width: size, height: size, padding: 1 }}>
                <View style={{ flex: 1, backgroundColor: colors.field }}>
                  {thumb && <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" blurRadius={blur ? 30 : 0} recyclingKey={item.name} />}
                  {(m.kind === 'video' || m.kind === 'gallery' || m.kind === 'gif') && (
                    <View style={{ position: 'absolute', top: 6, right: 6 }}>
                      <Ionicons name={m.kind === 'gallery' ? 'images' : m.kind === 'gif' ? 'infinite' : 'play'} size={16} color="#fff" style={{ textShadowColor: '#000', textShadowRadius: 4 } as object} />
                    </View>
                  )}
                </View>
              </Pressable>
            )
          }}
          ListEmptyComponent={loading ? <Loading /> : error ? <ErrorView error={error} /> : <Empty icon="images-outline" title="No pictures or videos here" />}
          ListFooterComponent={after && items.length ? <ActivityIndicator style={{ padding: 20 }} color={colors.accentHi} /> : undefined}
          onEndReached={() => after && !loading && (setLoading(true), void load(after))}
          onEndReachedThreshold={1.5}
        />
      </View>
    </Screen>
  )
}

