import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as ScreenOrientation from 'expo-screen-orientation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { GestureDetector, GestureHandlerRootView, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { compact, redditUrl } from '../lib/format'
import { desktop } from '../lib/storage'
import { go, nav } from '../nav'
import { ThreadView } from '../screens/Thread'
import { copy, fail, saveMedia, share, shareMedia } from './actions'
import type { Post } from '../lib/reddit/types'
import { useViewer, viewerItems, type ViewerItem } from './media'
import { colors } from './theme'
import { toast, ToastHost } from './toast'
import { Video } from './Video'
import { TAP_SLOP, ZoomImage } from './ZoomImage'

// The full-screen media viewer: pictures (pinch or double-tap to zoom on phones, click on desktop; tap around to close), galleries (arrow keys / buttons),
// videos with controls; save, copy, open the post's comments (from Gallery View, in a panel at the
// right that follows the arrow keys from post to post). Phones swipe sideways instead of the arrows,
// can turn sideways while it's open, and share the post or the picture/video itself.

export function MediaViewerHost() {
  const open = useViewer((s) => s.open)
  const { width, height } = useWindowDimensions()
  // What's showing: a post's items (and which), which can change as you step through a sequence.
  const [view, setView] = useState<{ items: ViewerItem[]; index: number; post?: Post }>({ items: [], index: 0 })
  const [zoom, setZoom] = useState(false)
  // The picture's size once loaded (for posts that don't say), so only the picture itself zooms.
  const [loaded, setLoaded] = useState<{ url: string; w: number; h: number } | null>(null)
  // Gallery View: the post's comments in a panel at the right, which follows the post you're on.
  const [comments, setComments] = useState(false)
  // The panel stays mounted until it has finished sliding away.
  const [panel, setPanel] = useState(false)
  const slide = useRef(new Animated.Value(0)).current
  // Phones: how far the comments sheet has been dragged down by its grabber.
  const drag = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  // Phones: the Share choices (the post, or the picture/video itself).
  const [sharing, setSharing] = useState(false)
  // Phones turn sideways only while the viewer is open; the rest of the app stays upright.
  useEffect(() => {
    if (Platform.OS === 'web') return
    void (open ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)).catch(() => undefined)
  }, [open])
  useEffect(() => {
    if (open) setView({ items: open.items, index: open.index, post: open.post })
    // Every opening starts with the comments put away. (Closed with the sheet up, its slide-out
    // never finishes off screen, which used to leave it stuck open on the next post.)
    setComments(false)
    setPanel(false)
    slide.setValue(0)
    drag.setValue(0)
    setZoom(false)
    setSharing(false)
  }, [open, slide, drag])
  useEffect(() => {
    if (comments) {
      drag.setValue(0)
      setPanel(true)
    }
    Animated.timing(slide, { toValue: comments ? 1 : 0, duration: comments ? 340 : 260, easing: comments ? Easing.bezier(0.2, 0.9, 0.25, 1) : Easing.in(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished && !comments) setPanel(false)
    })
  }, [comments, slide, drag])
  const close = () => useViewer.setState({ open: null })
  // Going somewhere from the comments (a profile, a reply, a subreddit) leaves the viewer.
  useEffect(() => (open ? nav.addListener('state', close) : undefined), [open])
  const { items, index, post } = view
  const item = items[index]
  const sequence = open?.sequence
  /** The neighbouring post with something to show, `d` steps away in the sequence. */
  const neighbour = (d: 1 | -1): { post: Post; items: ViewerItem[] } | null => {
    if (!sequence || !post) return null
    const posts = sequence.posts()
    let i = posts.findIndex((p) => p.name === post.name)
    if (i < 0) return null
    for (i += d; i >= 0 && i < posts.length; i += d) {
      const next = viewerItems(posts[i].media)
      if (next.length) {
        if (d > 0 && i >= posts.length - 4) sequence.onNearEnd?.()
        return { post: posts[i], items: next }
      }
    }
    if (d > 0) sequence.onNearEnd?.()
    return null
  }
  const go2 = (d: 1 | -1) => {
    setZoom(false)
    if (index + d >= 0 && index + d < items.length) return setView((v) => ({ ...v, index: v.index + d }))
    // Past this post's first or last item: on to the previous or next post.
    const n = neighbour(d)
    if (n) setView({ items: n.items, post: n.post, index: d > 0 ? 0 : n.items.length - 1 })
  }
  // Swipes come from the gesture worklets, which keep the callback they started with: they go through
  // this (always the latest go2).
  const latestGo = useRef(go2)
  useEffect(() => {
    latestGo.current = go2
  })
  const swipe = useCallback((d: 1 | -1) => {
    setSharing(false)
    latestGo.current(d)
  }, [])
  const position = (() => {
    if (!sequence || !post) return null
    const posts = sequence.posts()
    const i = posts.findIndex((p) => p.name === post.name)
    return i < 0 ? null : { at: i + 1, of: posts.length }
  })()
  const canBack = index > 0 || Boolean(neighbour(-1))
  const canForward = index < items.length - 1 || Boolean(neighbour(1))
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (comments ? setComments(false) : close())
      else if (e.key === 'ArrowRight') (e.preventDefault(), go2(1))
      else if (e.key === 'ArrowLeft') (e.preventDefault(), go2(-1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!open || !item) return null
  const url = item.kind === 'image' ? item.url : (item.mp4 ?? item.hls ?? '')
  const phone = Platform.OS !== 'web'
  // The stage as laid out (on phones it runs under the status and navigation bars).
  const W = box?.w ?? width
  const H = box?.h ?? height
  // Wide windows: the comments sit beside the picture. Narrow ones: a sheet that slides up over it.
  const besides = width >= 900
  const panelW = besides ? Math.min(480, Math.round(width * 0.4)) : W
  const panelOpen = panel && Boolean(post)
  const stageW = panelOpen && besides ? W - panelW : W
  const sheetH = Math.round((H - insets.top) * 0.88)
  const inGallery = Boolean(open.sequence)
  const openComments = () => (inGallery ? setComments((c) => !c) : post && (close(), go('Thread', { id: post.id, post })))
  // Phones: the picture fills the screen at its own shape; desktop leaves a margin around it.
  const room = phone ? { w: stageW, h: H } : { w: stageW - 80, h: H - 140 }
  const top = phone ? insets.top + 8 : 10
  const bottom = phone ? Math.max(insets.bottom, 10) + 6 : 14
  const grab = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > sheetH * 0.22 || g.vy > 0.9) setComments(false)
      else Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web', damping: 20, stiffness: 260 }).start()
    }
  })
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (comments ? setComments(false) : close())}>
      {/* A modal is its own view tree on Android: gestures need their own root inside it. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ flex: 1, flexDirection: 'row', backgroundColor: phone ? '#000' : 'rgba(0,0,0,0.94)' }}>
      <View style={{ width: stageW, height: H }}>
        {phone ? (
          <Backdrop onTap={close} onSwipe={swipe} />
        ) : (
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={close} />
        )}
        <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {item.kind === 'image' && phone ? (
            <ZoomImage key={item.url} uri={item.url} {...fitted(item, loaded, room.w, room.h)} stageW={stageW} stageH={H} onClose={close} onSwipe={swipe} onLoad={(e) => setLoaded({ url: item.url, w: e.source.width, h: e.source.height })} />
          ) : item.kind === 'image' ? (
            <Pressable onPress={() => setZoom((z) => !z)} style={{ ...(zoom ? { width: stageW, height: H } : fitted(item, loaded, room.w, room.h)), ...(Platform.OS === 'web' ? ({ cursor: zoom ? 'zoom-out' : 'zoom-in' } as object) : {}) }}>
              <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} contentFit={zoom ? 'cover' : 'contain'} allowDownscaling={false} transition={100} onLoad={(e) => setLoaded({ url: item.url, w: e.source.width, h: e.source.height })} />
            </Pressable>
          ) : phone ? (
            <SwipeArea onSwipe={swipe} style={{ position: 'absolute', left: 0, right: 0, top: top + 52, bottom: post ? bottom + 76 : bottom }}>
              <Video hls={item.hls} mp4={item.mp4} poster={item.poster} autoPlay muted={false} loop controls />
            </SwipeArea>
          ) : (
            <View style={{ width: stageW - 80, height: H - 140 }}>
              <Video hls={item.hls} mp4={item.mp4} poster={item.poster} autoPlay muted={false} loop controls />
            </View>
          )}
        </View>
        {item.kind === 'image' && item.caption && (
          <View pointerEvents="none" style={{ position: 'absolute', bottom: bottom + (post ? 76 : 0) + 10, left: 20, right: 20, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 }}>{item.caption}</Text>
          </View>
        )}
        {!phone && canBack && <Arrow icon="chevron-back" side="left" onPress={() => go2(-1)} />}
        {!phone && canForward && <Arrow icon="chevron-forward" side="right" onPress={() => go2(1)} />}
        {(items.length > 1 || position) && (
          <Text style={{ position: 'absolute', top: top + 11, alignSelf: 'center', color: '#fff', fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 }}>
            {position ? `Post ${position.at} of ${position.of}` : ''}
            {position && items.length > 1 ? '  ·  ' : ''}
            {items.length > 1 ? `${index + 1} / ${items.length}` : ''}
          </Text>
        )}
        <View style={{ position: 'absolute', top, right: 10, flexDirection: 'row', gap: 4 }}>
          {desktop && <Tool icon="download-outline" label="Save" onPress={() => void desktop!.saveMedia(url).then(() => toast('Saved to Downloads')).catch(fail)} />}
          {desktop && item.kind === 'image' && <Tool icon="copy-outline" label="Copy Image" onPress={() => (desktop!.copyImage(url), toast('Image copied'))} />}
          {phone && <Tool icon="share-outline" label="Share" onPress={() => setSharing((v) => !v)} />}
          <Tool icon="link-outline" label="Copy Link" onPress={() => void copy(url)} />
          {/* Phones open the comments from the post bar at the bottom; the corner has Share instead. */}
          {!phone && inGallery && post && <Tool icon={comments ? 'chatbubbles' : 'chatbubbles-outline'} label={comments ? 'Hide Comments' : 'Show Comments'} onPress={openComments} />}
          <Tool icon="close" label="Close" onPress={close} />
        </View>
        {sharing && (
          <View style={{ position: 'absolute', top: top + 50, right: 10, minWidth: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(30,30,36,0.97)' }}>
            {post && (
              <>
                <ShareChoice icon="document-text-outline" label="Share Post" onPress={() => (setSharing(false), void share(redditUrl(post.permalink), post.title))} />
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              </>
            )}
            <ShareChoice icon={item.kind === 'video' ? 'videocam-outline' : 'image-outline'} label={item.kind === 'video' ? 'Share Video' : 'Share Picture'} onPress={() => (setSharing(false), void shareMedia(url, item.kind))} />
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <ShareChoice icon="download-outline" label={item.kind === 'video' ? 'Save Video' : 'Save Picture'} onPress={() => (setSharing(false), void saveMedia(url, item.kind))} />
          </View>
        )}
        {post && (
          <Pressable key={post.name} onPress={openComments} style={{ position: 'absolute', bottom, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(30,30,36,0.85)', maxWidth: 720, alignSelf: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700' }}>
                {post.title}
              </Text>
              <Text style={{ color: '#aaa', fontSize: 12 }}>
                r/{post.subreddit} · ↑ {compact(post.score)} · {compact(post.numComments)} comments
              </Text>
            </View>
            <Ionicons name={comments ? (besides ? 'chevron-forward' : 'chevron-down') : 'chatbubbles-outline'} size={20} color={colors.accentHi} />
          </Pressable>
        )}
      </View>
      {panelOpen && post && besides && (
        <Animated.View
          style={{
            width: panelW,
            height: H,
            backgroundColor: colors.bg,
            borderLeftWidth: 1,
            borderColor: colors.separator,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 20,
            opacity: slide,
            transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [panelW * 0.25, 0] }) }]
          }}
        >
          <ThreadView key={post.name} id={post.id} initial={post} embedded hideMedia onClose={() => setComments(false)} />
        </Animated.View>
      )}
      {panelOpen && post && !besides && (
        <>
          <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }}>
            <Pressable style={{ flex: 1 }} onPress={() => setComments(false)} accessibilityLabel="Hide Comments" />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: sheetH,
              backgroundColor: colors.bg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              overflow: 'hidden',
              transform: [{ translateY: Animated.add(slide.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] }), drag) }]
            }}
          >
            <View {...grab.panHandlers} style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2 }}>
              <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: colors.faint }} />
            </View>
            <View style={{ flex: 1, paddingBottom: insets.bottom }}>
              <ThreadView key={post.name} id={post.id} initial={post} embedded hideMedia onClose={() => setComments(false)} />
            </View>
          </Animated.View>
        </>
      )}
      </View>
      {/* This Modal covers the app's own toasts ("Picture saved", "Link copied"): show them here too. */}
      <ToastHost bottom={bottom + (post ? 76 : 0) + 10} />
      </GestureHandlerRootView>
    </Modal>
  )
}

/** The box a picture fills inside `w`×`h` without cropping, so the dark bands around it close the viewer. */
function fitted(item: { url: string; width?: number; height?: number }, loaded: { url: string; w: number; h: number } | null, w: number, h: number) {
  const size = item.width && item.height ? { w: item.width, h: item.height } : loaded?.url === item.url ? loaded : null
  if (!size || !size.w || !size.h) return { width: w, height: h }
  const scale = Math.min(w / size.w, h / size.h)
  return { width: Math.round(size.w * scale), height: Math.round(size.h * scale) }
}

/** Phones: a sideways swipe over a video goes to the previous or next item; taps reach its controls. */
function SwipeArea({ onSwipe, style, children }: { onSwipe: (d: 1 | -1) => void; style: object; children: React.ReactNode }) {
  const pan = usePanGesture({
    activeOffsetX: [-24, 24],
    failOffsetY: [-20, 20],
    onDeactivate: (e) => {
      'worklet'
      if (Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 650) scheduleOnRN(onSwipe, e.translationX < 0 ? 1 : -1)
    }
  })
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={style}>
        {children}
      </View>
    </GestureDetector>
  )
}

/**
 * Phones: the empty space around a video or picture. A tap closes the viewer; a sideways swipe goes
 * to the previous or next item, like swiping over the picture itself. (It was a Pressable, which
 * fires on release even after a swipe, so swiping over empty space closed the viewer: issue #11.)
 */
function Backdrop({ onTap, onSwipe }: { onTap: () => void; onSwipe: (d: 1 | -1) => void }) {
  const pan = usePanGesture({
    activeOffsetX: [-24, 24],
    onDeactivate: (e) => {
      'worklet'
      const sideways = Math.abs(e.translationX) > Math.abs(e.translationY) * 1.2
      if (sideways && (Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 650)) scheduleOnRN(onSwipe, e.translationX < 0 ? 1 : -1)
    }
  })
  const tap = useTapGesture({
    maxDistance: TAP_SLOP,
    onActivate: () => {
      'worklet'
      scheduleOnRN(onTap)
    }
  })
  const gesture = useExclusiveGestures(pan, tap)
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
    </GestureDetector>
  )
}

function ShareChoice({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent' })}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 15 }}>{label}</Text>
    </Pressable>
  )
}

function Tool({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} {...(Platform.OS === 'web' ? ({ title: label } as object) : {})} style={({ hovered }: any) => ({ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)' })}>
      <Ionicons name={icon} size={21} color="#fff" />
    </Pressable>
  )
}

function Arrow({ icon, side, onPress }: { icon: keyof typeof Ionicons.glyphMap; side: 'left' | 'right'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', top: '50%', marginTop: -24, [side]: 12, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={28} color="#fff" />
    </Pressable>
  )
}
