import { Keyboard, Platform, useWindowDimensions } from 'react-native'
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

/** Whether the on-screen keyboard is up (phones). The dock steps aside while you type. */
export const useKeyboard = create<{ shown: boolean }>(() => ({ shown: false }))
if (Platform.OS !== 'web') {
  Keyboard.addListener('keyboardDidShow', () => useKeyboard.setState({ shown: true }))
  Keyboard.addListener('keyboardDidHide', () => useKeyboard.setState({ shown: false }))
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
