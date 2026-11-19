import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Image } from 'expo-image'
import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { compact, shortDate } from '../lib/format'
import * as api from '../lib/reddit/api'
import { myName, signIn, switchAccount, useSession } from '../lib/reddit/transport'
import type { Trophy, User } from '../lib/reddit/types'
import { forgetRead, useStore } from '../lib/store'
import { go, openUrl, type RootParams } from '../nav'
import { fail, filterUser } from '../ui/actions'
import { Avatar, Button, Empty, Group, Header, IconButton, Row, Screen, Segmented, Sep } from '../ui/kit'
import { confirm, showMenu } from '../ui/overlays'
import { colors, fs } from '../ui/theme'
import { ThingList } from '../ui/ThingList'
import { toast } from '../ui/toast'
import { PostCard } from '../ui/PostCard'

// Profiles: anyone's (overview, posts, comments) and your own Account tab (plus saved, upvoted,
// hidden, recently read, saved categories, and the account switcher).

function ProfileHeader({ user, trophies, own }: { user: User; trophies: Trophy[]; own: boolean }) {
  const [friend, setFriend] = useState(Boolean(user.isFriend))
  const age = Math.max(0, Math.floor((Date.now() - user.created) / (365.25 * 86400_000)))
  return (
    <View style={{ backgroundColor: colors.card, marginBottom: 8 }}>
      {user.banner ? <Image source={{ uri: user.banner }} style={{ height: 90 }} contentFit="cover" /> : <View style={{ height: 50, backgroundColor: colors.accentSoft }} />}
      <View style={{ padding: 14, paddingTop: 0, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: -26 }}>
          <View style={{ borderRadius: 40, borderWidth: 3, borderColor: colors.card, backgroundColor: colors.card }}>
            <Avatar uri={user.icon} name={user.name} size={66} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fs(20), fontWeight: '800' }}>u/{user.name}</Text>
            {user.title ? <Text style={{ color: colors.dim, fontSize: fs(13) }}>{user.title}</Text> : null}
          </View>
          {!own && (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <IconButton icon="mail-outline" label="Message" onPress={() => go('Compose', { mode: 'message', to: user.name })} />
              <IconButton
                icon={friend ? 'person-remove-outline' : 'person-add-outline'}
                label={friend ? 'Remove Friend' : 'Add Friend'}
                onPress={() =>
                  void api
                    .friend(user.name, !friend)
                    .then(() => (setFriend(!friend), toast(friend ? 'Removed from friends' : 'Added to friends')))
                    .catch(fail)
                }
              />
              <IconButton
                icon="ellipsis-horizontal"
                label="More"
                onPress={() =>
                  showMenu(`u/${user.name}`, [
                    { label: 'Filter Their Posts', onPress: () => filterUser(user.name) },
                    { label: 'Open on Reddit', onPress: () => void openUrl(`https://www.reddit.com/user/${user.name}`) },
                    { label: 'Block', destructive: true, onPress: () => confirm(`Block u/${user.name}?`, "You won't see their posts and comments.", 'Block', () => void api.blockUser(user.name).then(() => toast('Blocked')).catch(fail)) }
                  ])
                }
              />
            </View>
          )}
        </View>
        {user.description ? <Text style={{ color: colors.text, fontSize: fs(14) }}>{user.description}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 22 }}>
          {[
            [compact(user.linkKarma), 'Post Karma'],
            [compact(user.commentKarma), 'Comment Karma'],
            [age ? `${age}y` : shortDate(user.created), 'Account Age']
          ].map(([v, l]) => (
            <View key={l}>
              <Text style={{ color: colors.text, fontSize: fs(17), fontWeight: '800' }}>{v}</Text>
              <Text style={{ color: colors.dim, fontSize: fs(12) }}>{l}</Text>
            </View>
          ))}
        </View>
        {trophies.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {trophies.map((t, i) => (
              <Pressable key={i} onPress={() => toast(t.description ? `${t.name} — ${t.description}` : t.name)} style={{ alignItems: 'center', width: 64, gap: 3 }}>
                <Image source={{ uri: t.icon }} style={{ width: 36, height: 36 }} />
                <Text numberOfLines={2} style={{ color: colors.dim, fontSize: fs(10.5), textAlign: 'center' }}>
                  {t.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

type Where = 'overview' | 'submitted' | 'comments'

export function Profile({ name, own }: { name: string; own: boolean }) {
  const [user, setUser] = useState<User | null>(null)
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [error, setError] = useState<string | null>(null)
  const [where, setWhere] = useState<Where>('overview')
  const [sort, setSort] = useState<'new' | 'hot' | 'top'>('new')
  useEffect(() => {
    setUser(null)
    api
      .userAbout(name)
      .then(setUser)
      .catch((e) => setError((e as Error).message))
    void api.trophies(name).then(setTrophies)
  }, [name])
  const header = (
    <View>
      {user ? <ProfileHeader user={user} trophies={trophies} own={own} /> : error ? <Empty icon="person-outline" title="Couldn't load this profile" text={error} /> : null}
      {own && <AccountRows />}
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, alignItems: 'center' }}>
        <Segmented
          style={{ flex: 1 }}
          value={where}
          onChange={setWhere}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'submitted', label: 'Posts' },
            { value: 'comments', label: 'Comments' }
          ]}
        />
        <IconButton icon="swap-vertical" label="Sort" onPress={() => showMenu('Sort', (['new', 'hot', 'top'] as const).map((s) => ({ label: s[0].toUpperCase() + s.slice(1), selected: s === sort, onPress: () => setSort(s) })))} />
      </View>
    </View>
  )
  return <ThingList key={`${name}-${where}-${sort}`} load={(after) => api.userListing(name, where, sort, after, 'all')} deps={[name, where, sort]} header={header} empty={{ title: 'Nothing here yet' }} />
}

/** Your own lists, on the Account tab. */
function AccountRows() {
  const categories = useStore((s) => s.savedCategories)
  const recent = useStore((s) => s.recentlyRead.length)
  return (
    <View style={{ paddingHorizontal: 10 }}>
      <Group>
        <Row icon="bookmark" iconColor="#34c759" title="Saved" onPress={() => go('Saved', {})} />
        <Sep inset={55} />
        <Row icon="folder" iconColor="#0a9cf5" title="Saved Categories" value={String(categories.length)} onPress={() => go('SettingsPage', { page: 'categories' })} />
        <Sep inset={55} />
        <Row icon="time" iconColor="#9b5cff" title="Recently Read" value={recent ? String(recent) : undefined} onPress={() => go('RecentlyRead')} />
        <Sep inset={55} />
        <Row icon="arrow-up" iconColor="#ff6a2c" title="Upvoted" onPress={() => go('SettingsPage', { page: 'list:upvoted' })} />
        <Sep inset={55} />
        <Row icon="arrow-down" iconColor="#7c8cff" title="Downvoted" onPress={() => go('SettingsPage', { page: 'list:downvoted' })} />
        <Sep inset={55} />
        <Row icon="eye-off" iconColor="#8a98ad" title="Hidden" onPress={() => go('SettingsPage', { page: 'list:hidden' })} />
      </Group>
    </View>
  )
}

export function accountSwitcher(): void {
  const { accounts, current } = useSession.getState()
  showMenu('Accounts', [
    ...accounts.map((a) => ({ label: `u/${a.username}`, selected: a.id === current, onPress: () => switchAccount(a.id) })),
    { label: 'Add Account…', onPress: () => void signIn().catch(fail) },
    { label: 'Manage Accounts', onPress: () => go('SettingsPage', { page: 'accounts' }) }
  ])
}

export function Account() {
  const account = useSession((s) => s.accounts.find((a) => a.id === s.current))
  return (
    <Screen>
      <Header showBack={false} title={account ? `u/${account.username}` : 'Account'} right={<IconButton icon="people-outline" label="Switch Account" onPress={accountSwitcher} />} />
      {account ? (
        <Profile key={account.id} name={account.username} own />
      ) : (
        <Empty icon="person-circle-outline" title="Sign in to Reddit" text="Sign in on Reddit's own page. Apollo Delta uses that session, so you don't need an API key." action={<Button title="Sign In" icon="log-in-outline" onPress={() => void signIn().catch(fail)} />} />
      )}
    </Screen>
  )
}

export default function UserScreen({ route }: NativeStackScreenProps<RootParams, 'User'>) {
  const name = route.params.name
  const own = myName()?.toLowerCase() === name.toLowerCase()
  return (
    <Screen>
      <Header title={`u/${name}`} />
      <Profile name={name} own={own} />
    </Screen>
  )
}

export function SavedScreen({ route }: NativeStackScreenProps<RootParams, 'Saved'>) {
  const me = myName()
  const categories = useStore((s) => s.savedCategories)
  const itemCategories = useStore((s) => s.itemCategories)
  const [category, setCategory] = useState<string | undefined>(route.params.category)
  const [kind, setKind] = useState<'all' | 'posts' | 'comments'>('all')
  if (!me) return <Empty icon="bookmark-outline" title="Sign in to see what you've saved" />
  const header = (
    <View style={{ padding: 10, gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[undefined, ...categories].map((c) => (
          <Pressable key={c ?? 'all'} onPress={() => setCategory(c)} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: category === c ? colors.accent : colors.field }}>
            <Text style={{ color: category === c ? colors.onAccent : colors.text, fontWeight: '600', fontSize: fs(13) }}>{c ?? 'All Saved'}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'posts', label: 'Posts' }, { value: 'comments', label: 'Comments' }]} />
    </View>
  )
  return (
    <Screen>
      <Header title={category ?? 'Saved'} right={<IconButton icon="grid-outline" label="Gallery View" onPress={() => go('Gallery', { feed: `saved:${category ?? ''}` })} />} />
      <ThingList
        key={`${category}-${kind}`}
        deps={[category, kind, me]}
        header={header}
        empty={{ title: category ? `Nothing saved to ${category}` : 'Nothing saved yet', text: 'Save posts and comments from their ••• menu.' }}
        load={async (after) => {
          const page = await api.userListing(me, 'saved', 'new', after)
          return {
            ...page,
            items: page.items.filter((x) => (!category || itemCategories[x.name] === category) && (kind === 'all' || (kind === 'posts' ? x.kind === 't3' : x.kind === 't1')))
          }
        }}
      />
    </Screen>
  )
}

export function RecentlyRead() {
  const recent = useStore((s) => s.recentlyRead)
  const [width, setWidth] = useState(600)
  const posts = useMemo(
    () =>
      recent.map((r) => ({
        ...r.post,
        kind: 't3' as const,
        subredditId: '',
        selftext: '',
        media: r.post.thumbnail ? { kind: 'link' as const, url: r.post.url, domain: r.post.domain, thumb: r.post.thumbnail } : { kind: 'none' as const },
        stickied: false,
        pinned: false,
        locked: false,
        archived: false,
        saved: false,
        hidden: false,
        likes: 0 as const,
        awards: 0
      })),
    [recent]
  )
  return (
    <Screen>
      <Header title="Recently Read" right={<IconButton icon="trash-outline" label="Clear History" onPress={() => confirm('Clear Recently Read?', 'Posts stay on Reddit; this only clears the list here.', 'Clear', () => useStore.getState().update(() => ({ recentlyRead: [], read: {} })))} />} />
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <FlatList
          data={posts}
          keyExtractor={(p) => p.name}
          renderItem={({ item }) => (
            <View style={{ maxWidth: 860, width: '100%', alignSelf: 'center' }}>
              <PostCard post={item} showSubreddit width={Math.min(width, 860)} onOpen={(p) => go('Thread', { id: p.id })} />
              <Pressable onPress={() => forgetRead(item.name)} style={{ position: 'absolute', top: 8, right: 8, padding: 6 }} accessibilityLabel="Remove from Recently Read">
                <Ionicons name="close-circle" size={18} color={colors.faint} />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Empty icon="time-outline" title="Nothing read yet" text="Posts you open show up here." />}
        />
      </View>
    </Screen>
  )
}
