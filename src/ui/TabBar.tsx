import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DOCK_GAP, DOCK_HEIGHT, type TabKey } from '../lib/layout'
import { useSession } from '../lib/reddit/transport'
import { useStore } from '../lib/store'
import { useUnread } from '../screens/Inbox'
import { Avatar } from './kit'
import { colors, hexA } from './theme'

// Apollo's five tabs: Posts, Inbox, Account, Search, Settings. A floating dock on phones, a rail on desktop.

export const TABS: Array<{ key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; on: keyof typeof Ionicons.glyphMap }> = [
  { key: 'posts', label: 'Posts', icon: 'albums-outline', on: 'albums' },
  { key: 'inbox', label: 'Inbox', icon: 'mail-outline', on: 'mail' },
  { key: 'account', label: 'Account', icon: 'person-circle-outline', on: 'person-circle' },
  { key: 'search', label: 'Search', icon: 'search-outline', on: 'search' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', on: 'settings' }
]

export function useBadge(): number {
  const count = useUnread((s) => s.count)
  const show = useStore((s) => s.settings.unreadBadge)
  return show ? count : 0
}

function TabIcon({ t, on, size }: { t: (typeof TABS)[number]; on: boolean; size: number }) {
  const badge = useBadge()
  const account = useSession((s) => s.accounts.find((a) => a.id === s.current))
  return (
    <View>
      {t.key === 'account' && account?.icon ? (
        <View style={{ borderRadius: size, borderWidth: 2, borderColor: on ? colors.accent : 'transparent' }}>
          <Avatar uri={account.icon} name={account.username} size={size - 2} />
        </View>
      ) : (
        <Ionicons name={on ? t.on : t.icon} size={size} color={on ? colors.accentHi : colors.dim} />
      )}
      {t.key === 'inbox' && badge > 0 && (
        <View style={{ position: 'absolute', top: -4, right: -9, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
  )
}

/**
 * Phones: the tabs as a floating dock, after iOS's: a frosted pill above the bottom edge, with a
 * soft capsule that glides to the selected tab. `blurTarget` is what it frosts on Android.
 */
export function Dock({ tab, onChange, blurTarget }: { tab: TabKey; onChange: (t: TabKey) => void; blurTarget?: RefObject<ComponentRef<typeof View> | null> }) {
  const insets = useSafeAreaInsets()
  const [w, setW] = useState(0)
  const index = TABS.findIndex((t) => t.key === tab)
  const x = useRef(new Animated.Value(index)).current
  useEffect(() => {
    Animated.spring(x, { toValue: index, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.8 }).start()
  }, [index, x])
  const slot = (w - DOCK_PAD * 2) / TABS.length
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 8) + DOCK_GAP, alignItems: 'center' }}>
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ width: '100%', maxWidth: 420, height: DOCK_HEIGHT, borderRadius: DOCK_HEIGHT / 2, backgroundColor: hexA(colors.chrome, 0.35), elevation: 10, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }}
      >
        <View style={{ flex: 1, borderRadius: DOCK_HEIGHT / 2, overflow: 'hidden', borderWidth: 1, borderColor: hexA(colors.dark ? '#ffffff' : '#000000', colors.dark ? 0.12 : 0.07) }}>
          <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={70} tint={colors.dark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: hexA(colors.chrome, 0.45) }} />
          {w > 0 && (
            <Animated.View
              pointerEvents="none"
              style={{ position: 'absolute', top: 6, bottom: 6, left: DOCK_PAD, width: slot, borderRadius: DOCK_HEIGHT / 2, backgroundColor: hexA(colors.accent, colors.dark ? 0.24 : 0.14), transform: [{ translateX: Animated.multiply(x, slot) }] }}
            />
          )}
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: DOCK_PAD }}>
            {TABS.map((t) => {
              const on = t.key === tab
              return (
                <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <TabIcon t={t} on={on} size={23} />
                  <Text numberOfLines={1} style={{ color: on ? colors.accentHi : colors.dim, fontSize: 10, fontWeight: on ? '700' : '600' }}>{t.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </View>
  )
}

/** The gap between the dock's ends and its outer tabs. */
const DOCK_PAD = 6

/** Desktop: the tabs as a slim rail down the left. */
export function Rail({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <View style={{ width: 74, backgroundColor: colors.chrome, borderRightWidth: 1, borderColor: colors.separator, paddingTop: 10, alignItems: 'center', gap: 4 }}>
      {TABS.map((t) => {
        const on = t.key === tab
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityLabel={t.label}
            style={({ hovered }: any) => ({ width: 62, paddingVertical: 8, borderRadius: 12, alignItems: 'center', gap: 3, backgroundColor: on ? colors.accentSoft : hovered ? hexA(colors.dark ? '#ffffff' : '#000000', 0.05) : 'transparent' })}
          >
            <TabIcon t={t} on={on} size={23} />
            <Text style={{ color: on ? colors.accentHi : colors.dim, fontSize: 10.5, fontWeight: '600' }}>{t.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
