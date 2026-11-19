import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { loadSubs, useSubs } from '../lib/feeds'
import * as api from '../lib/reddit/api'
import { useSession } from '../lib/reddit/transport'
import { isFavorite, toggleFavorite, useStore } from '../lib/store'
import { go } from '../nav'
import { fail } from '../ui/actions'
import { Avatar, Field, Header, IconButton, Screen } from '../ui/kit'
import { showMenu } from '../ui/overlays'
import { colors, fs, hexA } from '../ui/theme'
import { toast } from '../ui/toast'

// Apollo's subreddit list: Home, Popular, All, Random, then favorites, multireddits and every
// subscription A–Z, with a filter field. Picking one opens its feed.

interface Item {
  key: string
  feed: string
  title: string
  icon?: string
  sys?: keyof typeof Ionicons.glyphMap
  sysColor?: string
  sub?: string
  fav?: boolean
}

const SYSTEM: Item[] = [
  { key: 'home', feed: '', title: 'Home', sys: 'home', sysColor: '#4b6bff', sub: 'Posts from your subscriptions' },
  { key: 'popular', feed: 'popular', title: 'Popular', sys: 'trending-up', sysColor: '#ff6a2c', sub: 'Most popular posts across Reddit' },
  { key: 'all', feed: 'all', title: 'All', sys: 'globe', sysColor: '#1fbf8f', sub: 'Posts across all subreddits' }
]

export function SubredditList({ current, onPick, header = true }: { current?: string; onPick: (feed: string) => void; header?: boolean }) {
  const account = useSession((s) => s.current)
  const { subs, multis, loading } = useSubs(useShallow((s) => ({ subs: s.subs, multis: s.multis, loading: s.loading })))
  const favorites = useStore((s) => s.favorites)
  const nsfw = useStore((s) => s.settings.showNsfw)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (account) void loadSubs()
  }, [account])

  const sections = useMemo(() => {
    const f = q.trim().toLowerCase()
    const match = (s: string) => !f || s.toLowerCase().includes(f)
    const out: Array<{ title: string; data: Item[] }> = []
    const sys = SYSTEM.filter((x) => match(x.title))
    if (sys.length) out.push({ title: '', data: sys })
    const favs = favorites.filter(match).map((n) => ({ key: `fav-${n}`, feed: n, title: n, icon: subs.find((s) => s.name.toLowerCase() === n.toLowerCase())?.icon, fav: true }))
    if (favs.length) out.push({ title: 'Favorites', data: favs })
    const ms = multis.filter((m) => match(m.displayName)).map((m) => ({ key: `multi-${m.path}`, feed: m.path.replace(/\/$/, ''), title: m.displayName, icon: m.icon, sub: `${m.subreddits.length} subreddits` }))
    if (ms.length) out.push({ title: 'Multireddits', data: ms })
    const groups = new Map<string, Item[]>()
    for (const s of subs) {
      if (s.isUser || !match(s.name) || (s.nsfw && !nsfw)) continue
      const letter = /[a-z]/i.test(s.name[0]) ? s.name[0].toUpperCase() : '#'
      const list = groups.get(letter) ?? []
      list.push({ key: `sub-${s.name}`, feed: s.name, title: s.name, icon: s.icon, fav: isFavorite(favorites, s.name) })
      groups.set(letter, list)
    }
    for (const [letter, data] of [...groups.entries()].sort((a, b) => (a[0] === '#' ? 1 : b[0] === '#' ? -1 : a[0].localeCompare(b[0])))) out.push({ title: letter, data })
    // Typed a name you're not subscribed to: offer to go there.
    if (f && /^[a-z0-9_]{2,21}$/i.test(f) && !subs.some((s) => s.name.toLowerCase() === f)) out.push({ title: 'Go To', data: [{ key: `go-${f}`, feed: f, title: f, sys: 'arrow-forward', sysColor: colors.accent, sub: `Open r/${f}` }] })
    return out
  }, [subs, multis, favorites, q, nsfw])

  const random = async () => {
    try {
      onPick(await api.randomSubreddit())
    } catch (e) {
      fail(e)
    }
  }

  const itemMenu = (it: Item) => {
    if (it.sys) return
    if (it.feed.startsWith('/user/'))
      return showMenu(it.title, [{ label: 'Open', onPress: () => onPick(it.feed) }, { label: 'Delete Multireddit', destructive: true, onPress: () => void api.deleteMulti(it.feed).then(() => (toast('Deleted'), void loadSubs(true))).catch(fail) }])
    showMenu(`r/${it.title}`, [
      { label: isFavorite(favorites, it.feed) ? 'Remove from Favorites' : 'Add to Favorites', onPress: () => toggleFavorite(it.feed) },
      { label: 'About', onPress: () => go('About', { sr: it.feed }) },
      { label: 'Unsubscribe', destructive: true, onPress: () => void api.subscribe(it.feed, false).then(() => (toast(`Left r/${it.feed}`), void loadSubs(true))).catch(fail) }
    ])
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.chrome }}>
      {header && (
        <Header
          showBack={false}
          title="Subreddits"
          right={
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="shuffle" label="Random Subreddit" onPress={() => void random()} />
              <IconButton icon={loading ? 'sync' : 'refresh'} label="Refresh List" onPress={() => void loadSubs(true)} />
            </View>
          }
        />
      )}
      <View style={{ padding: 10, paddingBottom: 4 }}>
        <Field icon="search" placeholder="Filter subreddits" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => q.trim() && onPick(q.trim())} />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.key}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={{ color: colors.dim, fontSize: fs(12), fontWeight: '700', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: colors.chrome, textTransform: 'uppercase', letterSpacing: 0.4 }}>{section.title}</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const on = current !== undefined && item.feed.toLowerCase() === current.toLowerCase()
          return (
            <Pressable
              onPress={() => onPick(item.feed)}
              onLongPress={() => itemMenu(item)}
              style={({ hovered, pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 7, marginHorizontal: 6, borderRadius: 10, backgroundColor: on ? colors.accentSoft : pressed ? colors.field : hovered ? hexA(colors.dark ? '#ffffff' : '#000000', 0.04) : 'transparent' })}
            >
              {item.sys ? (
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: item.sysColor, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.sys} size={17} color="#fff" />
                </View>
              ) : (
                <Avatar uri={item.icon} name={item.title} size={30} />
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: on ? colors.accentHi : colors.text, fontSize: fs(15), fontWeight: item.sys ? '700' : '500' }}>
                  {item.title}
                </Text>
                {item.sub && (
                  <Text numberOfLines={1} style={{ color: colors.dim, fontSize: fs(12) }}>
                    {item.sub}
                  </Text>
                )}
              </View>
              {item.fav && !item.sys && <Ionicons name="star" size={13} color="#f5b83d" />}
              {!item.sys && (
                <Pressable onPress={() => itemMenu(item)} hitSlop={8} accessibilityLabel="Options" style={{ padding: 2, opacity: 0.6 }}>
                  <Ionicons name="ellipsis-horizontal" size={15} color={colors.dim} />
                </Pressable>
              )}
            </Pressable>
          )
        }}
        ListFooterComponent={<View style={{ height: 30 }} />}
      />
    </View>
  )
}

export default function SubredditsScreen() {
  return (
    <Screen>
      <SubredditList onPick={(feed) => go('Feed', { feed })} />
    </Screen>
  )
}
