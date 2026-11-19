import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Phones: replaced by a native player with the Android app. For now the poster with a play button.

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

export function Video({ poster, onPress }: VideoProps) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, backgroundColor: '#000' }}>
      {poster && <Image source={{ uri: poster }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="contain" />}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.9)" />
      </View>
    </Pressable>
  )
}
