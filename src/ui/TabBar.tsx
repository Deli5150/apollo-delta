import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { TabKey } from '../lib/layout'
import { useSession } from '../lib/reddit/transport'
import { useStore } from '../lib/store'
import { useUnread } from '../screens/Inbox'
import { Avatar } from './kit'
import { colors, hexA } from './theme'

// Apollo's five tabs: Posts, Inbox, Account, Search, Settings. A bottom bar on phones, a rail on desktop.

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

export function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flexDirection: 'row', paddingBottom: insets.bottom, borderTopWidth: 1, borderColor: colors.separator, backgroundColor: colors.chrome }}>
      {TABS.map((t) => {
        const on = t.key === tab
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, gap: 3 }}>
            <TabIcon t={t} on={on} size={25} />
            <Text style={{ color: on ? colors.accentHi : colors.dim, fontSize: 10.5, fontWeight: '600' }}>{t.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

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
