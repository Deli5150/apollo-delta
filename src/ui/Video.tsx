import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'

// Phones: Reddit's videos with expo-video, which plays the HLS stream (picture and sound together);
// GIF-style clips are plain MP4s. The desktop app uses Video.web.tsx (hls.js).

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

export function Video({ hls, mp4, autoPlay = true, muted = true, loop = true, controls = false, contain = true, onPress }: VideoProps) {
  const source = hls ?? mp4 ?? null
  const player = useVideoPlayer(source, (p) => {
    p.loop = loop
    p.muted = muted
    if (autoPlay) p.play()
  })
  useEffect(() => {
    player.muted = muted
  }, [muted, player])
  // Feeds turn autoplay off as the video leaves the screen (or the page goes behind another).
  useEffect(() => {
    if (autoPlay) player.play()
    else player.pause()
  }, [autoPlay, player])
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit={contain ? 'contain' : 'cover'} nativeControls={controls} allowsPictureInPicture={controls} />
      {onPress && !controls && <Pressable onPress={onPress} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />}
    </View>
  )
}
