import { Image, type ImageLoadEventData } from 'expo-image'
import { useEffect } from 'react'
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

// Phones: a picture in the media viewer you can pinch to zoom (1×–6×), drag around once zoomed,
// and double-tap to zoom in on a spot (or back out). A tap beside the picture closes the viewer.
// The gestures run on the UI thread, so zooming stays smooth while the app is busy.

const MAX = 6
const SPRING = { damping: 22, stiffness: 240, mass: 0.7 }

export function ZoomImage({ uri, width, height, stageW, stageH, onClose, onLoad }: { uri: string; width: number; height: number; stageW: number; stageH: number; onClose: () => void; onLoad?: (e: ImageLoadEventData) => void }) {
  const scale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  // Where a pinch or drag started.
  const s0 = useSharedValue(1)
  const x0 = useSharedValue(0)
  const y0 = useSharedValue(0)
  const fx0 = useSharedValue(0)
  const fy0 = useSharedValue(0)
  // The picture's fitted size and the stage, for the worklets.
  const size = useSharedValue({ w: width, h: height, W: stageW, H: stageH })
  useEffect(() => {
    size.value = { w: width, h: height, W: stageW, H: stageH }
  }, [width, height, stageW, stageH, size])

  /** How far the picture may move at scale `s` before its edge leaves the screen's edge. */
  const limit = (s: number) => {
    'worklet'
    const z = size.value
    return { x: Math.max(0, (z.w * s - z.W) / 2), y: Math.max(0, (z.h * s - z.H) / 2) }
  }
  const clamp = (v: number, m: number) => {
    'worklet'
    return Math.min(m, Math.max(-m, v))
  }
  /** After a gesture: back inside 1×–6× and the picture's edges. */
  const settle = () => {
    'worklet'
    const s = Math.min(MAX, Math.max(1, scale.value))
    const m = limit(s)
    scale.value = withSpring(s, SPRING)
    tx.value = withSpring(s === 1 ? 0 : clamp(tx.value, m.x), SPRING)
    ty.value = withSpring(s === 1 ? 0 : clamp(ty.value, m.y), SPRING)
  }

  const pinch = usePinchGesture({
    onActivate: (e) => {
      'worklet'
      s0.value = scale.value
      x0.value = tx.value
      y0.value = ty.value
      fx0.value = e.focalX - size.value.W / 2
      fy0.value = e.focalY - size.value.H / 2
    },
    onUpdate: (e) => {
      'worklet'
      const s = Math.min(MAX * 1.25, Math.max(0.6, s0.value * e.scale))
      const k = s / s0.value
      // Keep the spot between your fingers under them (and follow them as they move).
      tx.value = e.focalX - size.value.W / 2 - (fx0.value - x0.value) * k
      ty.value = e.focalY - size.value.H / 2 - (fy0.value - y0.value) * k
      scale.value = s
    },
    onDeactivate: () => {
      'worklet'
      settle()
    }
  })

  const pan = usePanGesture({
    maxPointers: 1,
    onActivate: () => {
      'worklet'
      x0.value = tx.value
      y0.value = ty.value
    },
    onUpdate: (e) => {
      'worklet'
      if (scale.value <= 1.01) return
      tx.value = x0.value + e.translationX
      ty.value = y0.value + e.translationY
    },
    onDeactivate: (e) => {
      'worklet'
      if (scale.value <= 1.01) return
      const m = limit(scale.value)
      tx.value = withDecay({ velocity: e.velocityX, clamp: [-m.x, m.x] })
      ty.value = withDecay({ velocity: e.velocityY, clamp: [-m.y, m.y] })
    }
  })

  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet'
      // Outside the picture (as it's zoomed and moved now): close.
      const z = size.value
      const dx = Math.abs(e.x - z.W / 2 - tx.value)
      const dy = Math.abs(e.y - z.H / 2 - ty.value)
      if (dx > (z.w * scale.value) / 2 || dy > (z.h * scale.value) / 2) scheduleOnRN(onClose)
    }
  })

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet'
      if (scale.value > 1.05) {
        scale.value = withTiming(1, { duration: 220 })
        tx.value = withTiming(0, { duration: 220 })
        ty.value = withTiming(0, { duration: 220 })
        return
      }
      const s = 2.5
      const m = limit(s)
      const fx = e.x - size.value.W / 2
      const fy = e.y - size.value.H / 2
      scale.value = withTiming(s, { duration: 240 })
      tx.value = withTiming(clamp(-fx * (s - 1), m.x), { duration: 240 })
      ty.value = withTiming(clamp(-fy * (s - 1), m.y), { duration: 240 })
    }
  })

  const gesture = useSimultaneousGestures(pinch, pan, tap, doubleTap)
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }))

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View collapsable={false} style={{ width: stageW, height: stageH, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ width, height }, style]}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" allowDownscaling={false} transition={100} onLoad={onLoad} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  )
}
