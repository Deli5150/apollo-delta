import Hls from 'hls.js'
import { createElement, useEffect, useRef } from 'react'

// Desktop video: Reddit's videos are HLS streams (picture and sound together), played with hls.js;
// GIF-style clips are plain MP4s.

export interface VideoProps {
  hls?: string
  mp4?: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  controls?: boolean
  contain?: boolean
  onPress?: () => void
  style?: Record<string, unknown>
}

export function Video({ hls, mp4, poster, autoPlay = true, muted = true, loop = true, controls = false, contain = true, onPress, style }: VideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let player: Hls | null = null
    if (hls && Hls.isSupported()) {
      player = new Hls({ capLevelToPlayerSize: true, startLevel: -1 })
      player.loadSource(hls)
      player.attachMedia(el)
      player.on(Hls.Events.ERROR, (_e, data) => {
        // The stream failed: fall back to the silent MP4.
        if (data.fatal && mp4) {
          player?.destroy()
          player = null
          el.src = mp4
          void el.play().catch(() => {})
        }
      })
    } else if (mp4) el.src = mp4
    else if (hls) el.src = hls
    return () => {
      player?.destroy()
      el.removeAttribute('src')
      el.load()
    }
  }, [hls, mp4])
  // Only play while on screen.
  useEffect(() => {
    const el = ref.current
    if (!el || !autoPlay || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) void el.play().catch(() => {})
      else el.pause()
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [autoPlay])
  return createElement('video', {
    ref,
    poster,
    muted,
    loop,
    controls,
    playsInline: true,
    preload: autoPlay ? 'auto' : 'metadata',
    onClick: onPress
      ? (e: MouseEvent) => {
          e.stopPropagation()
          onPress()
        }
      : undefined,
    style: { width: '100%', height: '100%', objectFit: contain ? 'contain' : 'cover', backgroundColor: '#000', display: 'block', cursor: onPress ? 'pointer' : undefined, ...style }
  })
}
