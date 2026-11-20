import { Ionicons } from '@expo/vector-icons'
import { useDockSpace } from '../lib/layout'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { compact } from '../lib/format'
import * as api from '../lib/reddit/api'
import type { SearchSort } from '../lib/reddit/api'
import { useSession } from '../lib/reddit/transport'
import type { Subreddit, TimeRange, User } from '../lib/reddit/types'
import { rememberSearch, useStore } from '../lib/store'
import { go } from '../nav'
import { Avatar, Field, Header, IconButton, Screen, SectionTitle, Segmented } from '../ui/kit'
import { showMenu } from '../ui/overlays'
import { colors, fs, hexA } from '../ui/theme'
import { ThingList } from '../ui/ThingList'

// Search: subreddits and people as you type; posts when you press Return. Before typing: your
// recent searches, recently visited subreddits, and trending ones.

function SubRow({ sr, onPress }: { sr: Subreddit; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: hovered ? hexA(colors.dark ? '#ffffff' : '#000000', 0.04) : 'transparent' })}>
      <Avatar uri={sr.icon} name={sr.name} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: fs(15), fontWeight: '600' }}>r/{sr.name}</Text>
        <Text numberOfLines={1} style={{ color: colors.dim, fontSize: fs(12.5) }}>
          {compact(sr.subscribers)} members{sr.publicDescription ? ` · ${sr.publicDescription}` : ''}
        </Text>
      </View>
      {sr.nsfw && <Text style={{ color: colors.nsfw, fontSize: fs(11), fontWeight: '800' }}>NSFW</Text>}
    </Pressable>
  )
}

export function SearchView({ scope }: { scope?: string }) {
  const dock = useDockSpace()
  const account = useSession((s) => s.current)
  const { searches, recentlyVisited, limit, nsfw } = useStore(useShallow((s) => ({ searches: s.searches, recentlyVisited: s.recentlyVisited, limit: s.settings.recentlyVisitedLimit, nsfw: s.settings.showNsfw })))
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [subs, setSubs] = useState<Subreddit[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [trending, setTrending] = useState<Subreddit[]>([])
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [time, setTime] = useState<TimeRange>('all')
  const [tab, setTab] = useState<'posts' | 'subreddits' | 'users'>('posts')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!account) return
    void api
      .popularSubreddits()
      .then((p) => setTrending(p.items.slice(0, 12)))
      .catch(() => {})
  }, [account])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = q.trim()
    if (!t || !account) {
      setSubs([])
      setUsers([])
      return
    }
    timer.current = setTimeout(() => {
      void api.searchSubreddits(t, nsfw, 8).then(setSubs).catch(() => {})
      void api.searchUsers(t).then(setUsers).catch(() => {})
    }, 300)
  }, [q, account, nsfw])

  const submit = (text = q) => {
    const t = text.trim()
    if (!t) return
    setQ(t)
    rememberSearch(t)
    setSubmitted(t)
    setTab('posts')
  }

  const sortMenu = () =>
    showMenu(
      'Sort Results',
      (['relevance', 'hot', 'top', 'new', 'comments'] as SearchSort[]).map((s) => ({
        label: s === 'comments' ? 'Most Comments' : s[0].toUpperCase() + s.slice(1),
        selected: s === sort,
        onPress: () => setSort(s)
      }))
    )

  const timeMenu = () => showMenu('From', (['hour', 'day', 'week', 'month', 'year', 'all'] as TimeRange[]).map((t) => ({ label: t === 'all' ? 'All Time' : `Past ${t[0].toUpperCase()}${t.slice(1)}`, selected: t === time, onPress: () => setTime(t) })))

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 10, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Field
            icon="search"
            placeholder={scope ? `Search in ${scope.startsWith('/') ? 'this feed' : `r/${scope}`}` : 'Search Reddit'}
            value={q}
            onChangeText={(t) => {
              setQ(t)
              if (!t) setSubmitted(null)
            }}
            onSubmitEditing={() => submit()}
            autoCapitalize="none"
            returnKeyType="search"
            autoFocus
          />
        </View>
        {submitted && (
          <>
            <IconButton icon="swap-vertical" label="Sort" onPress={sortMenu} />
            <IconButton icon="calendar-outline" label="Time" onPress={timeMenu} />
          </>
        )}
      </View>
      {submitted ? (
        <View style={{ flex: 1 }}>
          {!scope && (
            <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
              <Segmented value={tab} onChange={setTab} options={[{ value: 'posts', label: 'Posts' }, { value: 'subreddits', label: 'Subreddits' }, { value: 'users', label: 'Users' }]} />
            </View>
          )}
          {tab === 'posts' ? (
            <ThingList key={`${submitted}-${sort}-${time}`} deps={[submitted, sort, time, scope]} load={(after) => api.searchPosts(submitted, { sr: scope?.startsWith('/') ? undefined : scope, sort, time, after, nsfw })} empty={{ title: 'No posts found' }} />
          ) : tab === 'subreddits' ? (
            <ScrollView>
              {subs.map((s) => (
                <SubRow key={s.name} sr={s} onPress={() => go('Feed', { feed: s.name })} />
              ))}
            </ScrollView>
          ) : (
            <ScrollView>
              {users.map((u) => (
                <Pressable key={u.name} onPress={() => go('User', { name: u.name })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9 }}>
                  <Avatar uri={u.icon} name={u.name} size={34} />
                  <View>
                    <Text style={{ color: colors.text, fontSize: fs(15), fontWeight: '600' }}>u/{u.name}</Text>
                    <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>{compact(u.totalKarma)} karma</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 + dock, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
          {q.trim() ? (
            <>
              <Pressable onPress={() => submit()} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Ionicons name="search" size={18} color={colors.accentHi} />
                <Text style={{ color: colors.accentHi, fontSize: fs(15), fontWeight: '600' }}>Search posts for “{q.trim()}”</Text>
              </Pressable>
              {/^[a-z0-9_]{2,21}$/i.test(q.trim()) && (
                <Pressable onPress={() => go('Feed', { feed: q.trim() })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.accentHi} />
                  <Text style={{ color: colors.accentHi, fontSize: fs(15), fontWeight: '600' }}>Go to r/{q.trim()}</Text>
                </Pressable>
              )}
              {subs.length > 0 && <SectionTitle>Subreddits</SectionTitle>}
              {subs.map((s) => (
                <SubRow key={s.name} sr={s} onPress={() => go('Feed', { feed: s.name })} />
              ))}
              {users.length > 0 && <SectionTitle>Users</SectionTitle>}
              {users.slice(0, 5).map((u) => (
                <Pressable key={u.name} onPress={() => go('User', { name: u.name })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 9 }}>
                  <Avatar uri={u.icon} name={u.name} size={30} />
                  <Text style={{ color: colors.text, fontSize: fs(15) }}>u/{u.name}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              {searches.length > 0 && <SectionTitle right={<Text onPress={() => useStore.getState().update(() => ({ searches: [] }))} style={{ color: colors.accentHi, fontSize: fs(13) }}>Clear</Text>}>Recent Searches</SectionTitle>}
              {searches.map((s) => (
                <Pressable key={s} onPress={() => submit(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Ionicons name="time-outline" size={17} color={colors.dim} />
                  <Text style={{ color: colors.text, fontSize: fs(15) }}>{s}</Text>
                </Pressable>
              ))}
              {recentlyVisited.length > 0 && <SectionTitle>Recently Visited</SectionTitle>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
                {recentlyVisited.slice(0, limit).map((s) => (
                  <Pressable key={s} onPress={() => go('Feed', { feed: s })} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.field, justifyContent: 'center' }}>
                    <Text style={{ color: colors.text, fontSize: fs(13.5) }}>r/{s}</Text>
                  </Pressable>
                ))}
              </View>
              {trending.length > 0 && <SectionTitle>Trending Subreddits</SectionTitle>}
              {trending.map((s) => (
                <SubRow key={s.name} sr={s} onPress={() => go('Feed', { feed: s.name })} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

export default function Search() {
  return (
    <Screen>
      <Header showBack={false} title="Search" />
      <SearchView />
    </Screen>
  )
}
