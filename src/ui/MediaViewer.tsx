import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { compact } from '../lib/format'
import { desktop } from '../lib/storage'
import { go } from '../nav'
import { copy, fail } from './actions'
import type { Post } from '../lib/reddit/types'
import { useViewer, viewerItems, type ViewerItem } from './media'
import { colors } from './theme'
import { toast } from './toast'
import { Video } from './Video'

// The full-screen media viewer: pictures (click to zoom), galleries (arrow keys / buttons),
// videos with controls; save, copy, open the post's comments.

export function MediaViewerHost() {
  const open = useViewer((s) => s.open)
  const { width, height } = useWindowDimensions()
  // What's showing: a post's items (and which), which can change as you step through a sequence.
  const [view, setView] = useState<{ items: ViewerItem[]; index: number; post?: Post }>({ items: [], index: 0 })
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    if (open) setView({ items: open.items, index: open.index, post: open.post })
    setZoom(false)
  }, [open])
  const close = () => useViewer.setState({ open: null })
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
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') (e.preventDefault(), go2(1))
      else if (e.key === 'ArrowLeft') (e.preventDefault(), go2(-1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!open || !item) return null
  const url = item.kind === 'image' ? item.url : (item.mp4 ?? item.hls ?? '')
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={close} />
        <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: zoom ? 0 : 40 }}>
          {item.kind === 'image' ? (
            <Pressable onPress={() => setZoom((z) => !z)} style={{ width: zoom ? width : width - 80, height: zoom ? height : height - 140, ...(Platform.OS === 'web' ? ({ cursor: zoom ? 'zoom-out' : 'zoom-in' } as object) : {}) }}>
              <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} contentFit={zoom ? 'cover' : 'contain'} transition={100} />
            </Pressable>
          ) : (
            <View style={{ width: width - 80, height: height - 140 }}>
              <Video hls={item.hls} mp4={item.mp4} poster={item.poster} autoPlay muted={false} loop controls />
            </View>
          )}
        </View>
        {item.kind === 'image' && item.caption && (
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 70, left: 20, right: 20, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 }}>{item.caption}</Text>
          </View>
        )}
        {canBack && <Arrow icon="chevron-back" side="left" onPress={() => go2(-1)} />}
        {canForward && <Arrow icon="chevron-forward" side="right" onPress={() => go2(1)} />}
        {(items.length > 1 || position) && (
          <Text style={{ position: 'absolute', top: 18, alignSelf: 'center', color: '#fff', fontWeight: '700' }}>
            {position ? `Post ${position.at} of ${position.of}` : ''}
            {position && items.length > 1 ? '  ·  ' : ''}
            {items.length > 1 ? `${index + 1} / ${items.length}` : ''}
          </Text>
        )}
        <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 4 }}>
          {desktop && <Tool icon="download-outline" label="Save" onPress={() => void desktop!.saveMedia(url).then(() => toast('Saved to Downloads')).catch(fail)} />}
          {desktop && item.kind === 'image' && <Tool icon="copy-outline" label="Copy Image" onPress={() => (desktop!.copyImage(url), toast('Image copied'))} />}
          <Tool icon="link-outline" label="Copy Link" onPress={() => void copy(url)} />
          <Tool icon="close" label="Close" onPress={close} />
        </View>
        {post && (
          <Pressable key={post.name} onPress={() => (close(), go('Thread', { id: post.id, post }))} style={{ position: 'absolute', bottom: 14, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(30,30,36,0.85)', maxWidth: 720, alignSelf: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700' }}>
                {post.title}
              </Text>
              <Text style={{ color: '#aaa', fontSize: 12 }}>
                r/{post.subreddit} · ↑ {compact(post.score)} · {compact(post.numComments)} comments
              </Text>
            </View>
            <Ionicons name="chatbubbles-outline" size={20} color={colors.accentHi} />
          </Pressable>
        )}
      </View>
    </Modal>
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
