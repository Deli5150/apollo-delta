import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { NavigationContext } from '@react-navigation/native'
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { create } from 'zustand'
import { linkPreview } from '../lib/preview'
import type { LinkPreview } from '../lib/storage'
import type { Media, MediaImage, Post } from '../lib/reddit/types'
import { colors, fs, hexA } from './theme'
import { Video } from './Video'

// Pictures, galleries, videos and link cards in feeds and posts, and the full-screen viewer.

/** The best size of an image for a given width (Reddit's previews, else the original). */
export function pick(img: MediaImage, width: number): string {
  const ok = (img.previews ?? []).filter((p) => p.width >= width)
  return ok[0]?.url ?? img.url
}

const ratio = (w?: number, h?: number) => (w && h ? Math.min(Math.max(w / h, 0.5), 3) : 16 / 9)

// ── Full-screen viewer ───────────────────────────────────────────────────────────────────────

export type ViewerItem = { kind: 'image'; url: string; caption?: string; width?: number; height?: number } | { kind: 'video'; hls?: string; mp4?: string; poster?: string }

/** Posts the viewer can step through (Gallery View): the arrow keys go on to the next post. */
export interface ViewerSequence {
  /** The posts, read each time (the grid loads more as you go). */
  posts: () => Post[]
  /** Called when you reach the last few, to load more. */
  onNearEnd?: () => void
}

interface Viewer {
  items: ViewerItem[]
  index: number
  post?: Post
  sequence?: ViewerSequence
}

export const useViewer = create<{ open: Viewer | null }>(() => ({ open: null }))

// ── When videos may play ─────────────────────────────────────────────────────────────────────
// Phones have no IntersectionObserver, so a feed tells its cards which posts are on screen; a
// video plays only while its post is on screen, its page is in front, its tab is showing and no
// picture is open over it. (Desktop's Video.web.tsx also checks it's on screen by itself.)

/** The posts a feed has on screen right now (a feed provides one; elsewhere every post counts). */
export type OnScreen = ReturnType<typeof createOnScreen>
export function createOnScreen() {
  return create<{ names: Set<string> }>(() => ({ names: new Set() }))
}
export const OnScreenContext = createContext<OnScreen | null>(null)
/** False while the tab this page belongs to is hidden. */
export const PaneActive = createContext(true)
const noScreen = createOnScreen()

/** For a list of posts: the store its cards read, and the FlatList props that keep it current. */
export function useOnScreenTracking() {
  const [store] = useState(createOnScreen)
  const [props] = useState(() => ({
    viewabilityConfig: { itemVisiblePercentThreshold: 40, minimumViewTime: 120 },
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: Array<{ item: unknown }> }) =>
      store.setState({ names: new Set(viewableItems.map((v) => (v.item as { name?: string }).name ?? '')) })
  }))
  return { store, props }
}

/** Whether this page is the one in front (true outside any navigator, as in the media viewer). */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext)
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true)
  useEffect(() => {
    if (!navigation) return
    setFocused(navigation.isFocused())
    const a = navigation.addListener('focus', () => setFocused(true))
    const b = navigation.addListener('blur', () => setFocused(false))
    return () => (a(), b())
  }, [navigation])
  return focused
}

/** Whether a post's video may play now. */
export function useMayPlay(name: string): boolean {
  const onScreen = useContext(OnScreenContext)
  const visible = (onScreen ?? noScreen)((s) => !onScreen || s.names.has(name))
  const pane = useContext(PaneActive)
  const focused = useScreenFocused()
  const viewing = useViewer((s) => Boolean(s.open))
  return visible && pane && focused && !viewing
}

export function openViewer(items: ViewerItem[], index = 0, post?: Post, sequence?: ViewerSequence): void {
  if (items.length) useViewer.setState({ open: { items, index, post, sequence } })
}

/** The viewer items for a post's media. */
export function viewerItems(m: Media): ViewerItem[] {
  switch (m.kind) {
    case 'image':
      return [{ kind: 'image', url: m.image.url, width: m.image.width, height: m.image.height }]
    case 'gif':
      return m.mp4 ? [{ kind: 'video', mp4: m.mp4, poster: m.image.url }] : [{ kind: 'image', url: m.image.url }]
    case 'gallery':
      return m.items.map((i) => ({ kind: 'image', url: i.url, caption: i.caption, width: i.width, height: i.height }))
    case 'video':
      return [{ kind: 'video', hls: m.hls, mp4: m.mp4, poster: m.poster }]
    default:
      return []
  }
}

// ── Inline pieces ────────────────────────────────────────────────────────────────────────────

/** An image posted in a comment or self post. */
export function InlineImage({ url, image, onPress }: { url: string; image?: MediaImage; onPress?: () => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(image?.width ? { w: image.width, h: image.height } : null)
  const src = image ? pick(image, 640) : url
  const animated = image?.mp4
  // A GIF whose size isn't known (Giphy's): the still frame is small, so read the size from it.
  const still = animated && !image?.width ? (image?.previews?.[0]?.url ?? src) : undefined
  useEffect(() => {
    if (!still) return
    let live = true
    Image.loadAsync(still)
      .then((ref) => live && ref.width && setSize({ w: ref.width, h: ref.height }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [still])
  return (
    <Pressable onPress={() => openViewer([animated ? { kind: 'video', mp4: image!.mp4 } : { kind: 'image', url: image?.url ?? url }])} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      {animated ? (
        <View style={{ width: 320, maxWidth: '100%', aspectRatio: ratio(size?.w, size?.h), borderRadius: 10, overflow: 'hidden' }}>
          <Video mp4={image!.mp4} poster={still ?? src} />
        </View>
      ) : (
        <Image
          source={{ uri: src }}
          onLoad={(e) => !size && setSize({ w: e.source.width, h: e.source.height })}
          style={{ width: 320, maxWidth: '100%', aspectRatio: ratio(size?.w, size?.h), borderRadius: 10, backgroundColor: colors.field }}
          contentFit="cover"
          accessibilityLabel="Image"
        />
      )}
    </Pressable>
  )
}

const previews = new Map<string, LinkPreview | null>()

/** A link with its page's title, picture and site (Settings → Rich Link Previews). */
export const LinkCard = memo(function LinkCard({ url, thumb, onPress, compact }: { url: string; thumb?: string; onPress: () => void; compact?: boolean }) {
  const [meta, setMeta] = useState<LinkPreview | null | undefined>(previews.get(url))
  useEffect(() => {
    if (meta !== undefined) return
    let live = true
    void linkPreview(url).then((m) => {
      previews.set(url, m)
      if (live) setMeta(m)
    })
    return () => {
      live = false
    }
  }, [url])
  let domain = url
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {}
  const image = meta?.image ?? thumb
  return (
    <Pressable onPress={onPress} style={({ pressed, hovered }: any) => ({ flexDirection: 'row', borderRadius: 12, overflow: 'hidden', backgroundColor: pressed || hovered ? colors.cardHi : colors.field, borderWidth: 1, borderColor: colors.border })}>
      {image ? <Image cachePolicy="memory-disk" source={{ uri: image }} style={{ width: compact ? 64 : 96, minHeight: compact ? 64 : 80, backgroundColor: colors.card }} contentFit="cover" /> : null}
      <View style={{ flex: 1, padding: 10, justifyContent: 'center', gap: 2 }}>
        {meta?.title && (
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: fs(14), fontWeight: '600' }}>
            {meta.title}
          </Text>
        )}
        {!compact && meta?.description && (
          <Text numberOfLines={2} style={{ color: colors.dim, fontSize: fs(12.5) }}>
            {meta.description}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="link" size={12} color={colors.accentHi} />
          <Text numberOfLines={1} style={{ color: colors.accentHi, fontSize: fs(12.5), flexShrink: 1 }}>
            {meta?.site && meta.site !== domain ? `${meta.site} · ${domain}` : domain}
          </Text>
        </View>
      </View>
      <View style={{ justifyContent: 'center', paddingRight: 10 }}>
        <Ionicons name="open-outline" size={16} color={colors.faint} />
      </View>
    </Pressable>
  )
})

/** NSFW / spoiler cover with a label; tap to show. */
function Cover({ label, onReveal }: { label: string; onReveal: () => void }) {
  return (
    <Pressable onPress={onReveal} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,10,14,0.55)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Ionicons name="eye-off" size={14} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{label}</Text>
      </View>
    </Pressable>
  )
}

function Badge({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text?: string }) {
  return (
    <View style={{ position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <Ionicons name={icon} size={12} color="#fff" />
      {text ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{text}</Text> : null}
    </View>
  )
}

const duration = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : undefined)

/** A gallery as a swipeable strip with a page counter (and arrows on desktop). */
function Gallery({ items, width, maxHeight, onOpen, blur }: { items: MediaImage[]; width: number; maxHeight: number; onOpen: (i: number) => void; blur: boolean }) {
  const [page, setPage] = useState(0)
  const strip = useRef<any>(null)
  const first = items[0]
  const h = Math.min(maxHeight, width / ratio(first.width, first.height))
  const go = (i: number) => strip.current?.scrollTo({ x: i * width, animated: true })
  return (
    <View style={{ width, height: h }}>
      <ScrollView
        ref={strip}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={32}
        style={{ width, height: h }}
      >
        {items.map((img, i) => (
          <Pressable key={i} onPress={() => onOpen(i)} style={{ width, height: h }}>
            <Image cachePolicy="memory-disk" source={{ uri: pick(img, width) }} style={{ width, height: h, backgroundColor: '#000' }} contentFit="contain" blurRadius={blur ? 40 : 0} />
          </Pressable>
        ))}
      </ScrollView>
      <Badge icon="images" text={`${page + 1}/${items.length}`} />
      {Platform.OS === 'web' && page > 0 && <GalleryArrow dir={-1} onPress={() => go(page - 1)} />}
      {Platform.OS === 'web' && page < items.length - 1 && <GalleryArrow dir={1} onPress={() => go(page + 1)} />}
    </View>
  )
}

function GalleryArrow({ dir, onPress }: { dir: 1 | -1; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={dir < 0 ? 'Previous picture' : 'Next picture'}
      style={{ position: 'absolute', top: '50%', marginTop: -15, [dir < 0 ? 'left' : 'right']: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={18} color="#fff" />
    </Pressable>
  )
}

export interface PostMediaProps {
  post: Post
  width: number
  maxHeight?: number
  autoplay: boolean
  muted: boolean
  blurNsfw: boolean
  blurSpoiler: boolean
  richLinks: boolean
  onLink: (url: string) => void
  /** Full posts: show the media however tall it is (up to maxHeight). */
  full?: boolean
}

/** A post's media as it appears in a large card or at the top of its comments. */
export const PostMedia = memo(function PostMedia({ post, width, maxHeight = 640, autoplay, muted, blurNsfw, blurSpoiler, richLinks, onLink, full }: PostMediaProps) {
  const m = post.crosspost && post.media.kind === 'none' ? post.crosspost.media : post.media
  const [revealed, setRevealed] = useState(false)
  const covered = !revealed && ((post.nsfw && blurNsfw) || (post.spoiler && blurSpoiler))
  const label = post.nsfw ? 'NSFW' : 'Spoiler'
  const open = (i = 0) => openViewer(viewerItems(m), i, post)
  const play = useMayPlay(post.name)
  autoplay = (autoplay ?? true) && play
  const box = (w?: number, h?: number) => ({ width, height: Math.min(maxHeight, width / ratio(w, h)), backgroundColor: '#000', overflow: 'hidden' as const })

  switch (m.kind) {
    case 'image': {
      const style = box(m.image.width, m.image.height)
      return (
        <Pressable onPress={() => (covered ? setRevealed(true) : open())} style={style}>
          <Image cachePolicy="memory-disk" source={{ uri: pick(m.image, width * 1.5) }} style={{ width: '100%', height: '100%' }} contentFit={full ? 'contain' : 'cover'} blurRadius={covered ? 50 : 0} transition={120} recyclingKey={post.id} />
          {covered && <Cover label={label} onReveal={() => setRevealed(true)} />}
        </Pressable>
      )
    }
    case 'gif': {
      const style = box(m.image.width, m.image.height)
      return (
        <View style={style}>
          {covered ? (
            <>
              <Image cachePolicy="memory-disk" source={{ uri: pick(m.image, width) }} style={{ width: '100%', height: '100%' }} blurRadius={50} />
              <Cover label={label} onReveal={() => setRevealed(true)} />
            </>
          ) : m.mp4 ? (
            <Video mp4={m.mp4} poster={pick(m.image, width)} autoPlay={autoplay} muted loop onPress={() => open()} />
          ) : (
            <Pressable onPress={() => open()} style={{ flex: 1 }}>
              <Image cachePolicy="memory-disk" source={{ uri: m.image.url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
            </Pressable>
          )}
          <Badge icon="infinite" text="GIF" />
        </View>
      )
    }
    case 'gallery':
      return (
        <View>
          <Gallery items={m.items} width={width} maxHeight={maxHeight} onOpen={(i) => (covered ? setRevealed(true) : open(i))} blur={covered} />
          {covered && <Cover label={label} onReveal={() => setRevealed(true)} />}
        </View>
      )
    case 'video': {
      const style = box(m.width, m.height)
      return (
        <View style={style}>
          {covered ? (
            <>
              {m.poster && <Image cachePolicy="memory-disk" source={{ uri: m.poster }} style={{ width: '100%', height: '100%' }} blurRadius={50} />}
              <Cover label={label} onReveal={() => setRevealed(true)} />
            </>
          ) : (
            <Video hls={m.hls} mp4={m.mp4} poster={m.poster} autoPlay={autoplay} muted={muted || m.gif} loop controls={full} onPress={full ? undefined : () => open()} />
          )}
          {!full && <Badge icon={m.gif ? 'infinite' : 'play'} text={m.gif ? 'GIF' : duration(m.duration)} />}
        </View>
      )
    }
    case 'youtube': {
      const thumb = m.poster ?? `https://i.ytimg.com/vi/${m.id}/hqdefault.jpg`
      return (
        <Pressable onPress={() => onLink(`https://www.youtube.com/watch?v=${m.id}${m.start ? `&t=${m.start}` : ''}`)} style={box(16, 9)}>
          <Image cachePolicy="memory-disk" source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" blurRadius={covered ? 50 : 0} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 62, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,0,0,0.9)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play" size={24} color="#fff" />
            </View>
          </View>
          <Badge icon="logo-youtube" text="YouTube" />
        </Pressable>
      )
    }
    case 'embed':
    case 'imgur-album':
      if (m.poster)
        return (
          <Pressable onPress={() => onLink(m.kind === 'embed' ? m.url : `https://imgur.com/a/${m.id}`)} style={box(16, 9)}>
            <Image cachePolicy="memory-disk" source={{ uri: m.poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" blurRadius={covered ? 50 : 0} />
            <Badge icon={m.kind === 'embed' ? 'play' : 'images'} text={m.kind === 'embed' ? m.provider : 'Imgur album'} />
          </Pressable>
        )
      return (
        <View style={{ paddingHorizontal: 12 }}>
          <LinkCard url={m.kind === 'embed' ? m.url : `https://imgur.com/a/${m.id}`} onPress={() => onLink(m.kind === 'embed' ? m.url : `https://imgur.com/a/${m.id}`)} />
        </View>
      )
    case 'link':
      return (
        <View style={{ paddingHorizontal: 12 }}>
          {richLinks ? (
            <LinkCard url={m.url} thumb={covered ? undefined : m.thumb} onPress={() => onLink(m.url)} />
          ) : (
            <Pressable onPress={() => onLink(m.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, backgroundColor: colors.field }}>
              <Ionicons name="link" size={14} color={colors.accentHi} />
              <Text numberOfLines={1} style={{ color: colors.accentHi, flex: 1 }}>
                {m.url}
              </Text>
            </Pressable>
          )}
        </View>
      )
    default:
      return null
  }
})

/** A compact post's square thumbnail with a little badge for its kind. */
export function Thumb({ post, size, blurNsfw, blurSpoiler, onPress }: { post: Post; size: number; blurNsfw: boolean; blurSpoiler: boolean; onPress: () => void }) {
  const m = post.crosspost && post.media.kind === 'none' ? post.crosspost.media : post.media
  const src =
    m.kind === 'image' ? pick(m.image, size * 2) : m.kind === 'gif' ? pick(m.image, size * 2) : m.kind === 'gallery' ? pick(m.items[0], size * 2) : m.kind === 'video' || m.kind === 'embed' || m.kind === 'imgur-album' ? m.poster : m.kind === 'youtube' ? (m.poster ?? `https://i.ytimg.com/vi/${m.id}/mqdefault.jpg`) : m.kind === 'link' ? m.thumb : undefined
  const blur = (post.nsfw && blurNsfw) || (post.spoiler && blurSpoiler)
  const icon: keyof typeof Ionicons.glyphMap | null = m.kind === 'video' || m.kind === 'youtube' || m.kind === 'embed' ? 'play' : m.kind === 'gallery' || m.kind === 'imgur-album' ? 'images' : m.kind === 'gif' ? 'infinite' : m.kind === 'link' ? 'link' : null
  if (!src && m.kind === 'none') {
    return (
      <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="chatbubble-ellipses-outline" size={size * 0.36} color={colors.faint} />
      </View>
    )
  }
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' }}>
      {src ? <Image cachePolicy="memory-disk" source={{ uri: src }} style={{ width: size, height: size }} contentFit="cover" blurRadius={blur ? 18 : 0} recyclingKey={post.id} /> : <Ionicons name="link" size={size * 0.36} color={colors.faint} />}
      {icon && src && (
        <View style={{ position: 'absolute', right: 4, bottom: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={11} color="#fff" />
        </View>
      )}
      {blur && (
        <View style={{ position: 'absolute', left: 4, top: 4, paddingHorizontal: 4, borderRadius: 4, backgroundColor: post.nsfw ? colors.nsfw : colors.spoiler }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{post.nsfw ? 'NSFW' : 'SPOILER'}</Text>
        </View>
      )}
    </Pressable>
  )
}

/** Whether a post has something to show in its card's media slot. */
export const hasMedia = (p: Post) => {
  const m = p.crosspost && p.media.kind === 'none' ? p.crosspost.media : p.media
  return m.kind !== 'none'
}

export const useImageWidth = (pad = 0) => {
  const { width } = useWindowDimensions()
  return Math.max(200, width - pad)
}

export const dimOverlay = () => hexA('#000000', 0.5)
