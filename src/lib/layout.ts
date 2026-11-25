import { Dimensions, Keyboard, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'

/** The desktop app (and a wide browser window) gets the wide layout: a sidebar and side-by-side panes. */
export function useWide(): boolean {
  const { width } = useWindowDimensions()
  return Platform.OS === 'web' && width >= 760
}

export type TabKey = 'posts' | 'inbox' | 'account' | 'search' | 'settings'

/** The selected main section (tab bar on phones, sidebar on desktop). */
export const useTab = create<{ tab: TabKey; set: (t: TabKey) => void }>((set) => ({ tab: 'posts', set: (tab) => set({ tab }) }))

/**
 * Whether the on-screen keyboard is up (phones), and how tall it is. The dock steps aside while you
 * type. Android draws the app edge to edge, so the keyboard covers the page instead of shrinking it:
 * pages with something to keep above it (the composer's toolbar) add `height` at the bottom.
 */
export const useKeyboard = create<{ shown: boolean; height: number }>(() => ({ shown: false, height: 0 }))
if (Platform.OS !== 'web') {
  // From the keyboard's top edge to the bottom of the screen: Android's reported height leaves out
  // the navigation bar under the keyboard, which left the composer's toolbar half covered.
  Keyboard.addListener('keyboardDidShow', (e) => useKeyboard.setState({ shown: true, height: Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY) }))
  Keyboard.addListener('keyboardDidHide', () => useKeyboard.setState({ shown: false, height: 0 }))
}

/** The floating dock's height (phones): the pill plus the gap below it. */
export const DOCK_HEIGHT = 64
export const DOCK_GAP = 10

/** Room to leave at the bottom of a scrolling page so its last items clear the floating dock. */
export function useDockSpace(): number {
  const wide = useWide()
  const insets = useSafeAreaInsets()
  const typing = useKeyboard((s) => s.shown)
  return wide || typing ? 0 : DOCK_HEIGHT + DOCK_GAP + Math.max(insets.bottom, 8) + 12
}
