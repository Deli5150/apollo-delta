import { Ionicons } from '@expo/vector-icons'
import { useDockSpace } from '../lib/layout'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, View } from 'react-native'
import { create } from 'zustand'
import { ago } from '../lib/format'
import * as api from '../lib/reddit/api'
import { refreshMe, useSession } from '../lib/reddit/transport'
import type { Message } from '../lib/reddit/types'
import { go, openUrl, parseRedditLink, type RootParams } from '../nav'
import { fail } from '../ui/actions'
import { Html } from '../ui/Html'
import { Empty, ErrorView, Header, IconButton, Loading, Screen, Segmented } from '../ui/kit'
import { colors, fs } from '../ui/theme'
import { toast } from '../ui/toast'

// The Inbox: replies, mentions and messages, with unread ones marked; and a message conversation.

type Tab = 'inbox' | 'unread' | 'messages' | 'mentions' | 'sent'

export const useUnread = create<{ count: number; latest: string | null }>(() => ({ count: 0, latest: null }))

/** Checks the unread count (and the newest unread, for a notification). */
export async function checkUnread(): Promise<Message[]> {
  if (!useSession.getState().current) return []
  try {
    const page = await api.inbox('unread')
    useUnread.setState({ count: page.items.length, latest: page.items[0]?.name ?? null })
    return page.items
  } catch {
    return []
  }
}

function MessageRow({ m, onRead }: { m: Message; onRead: (m: Message) => void }) {
  const isComment = m.kind === 't1'
  const icon: keyof typeof Ionicons.glyphMap = m.type === 'username_mention' ? 'at' : m.type === 'post_reply' ? 'chatbox-outline' : isComment ? 'chatbubble-outline' : 'mail-outline'
  const open = () => {
    onRead(m)
    if (isComment && m.context) {
      const link = parseRedditLink(m.context)
      if (link?.kind === 'post') return go('Thread', { id: link.id, focus: link.focus })
      return void openUrl(`https://www.reddit.com${m.context}`)
    }
    go('Conversation', { message: m })
  }
  return (
    <Pressable onPress={open} style={({ hovered }: any) => ({ flexDirection: 'row', gap: 12, padding: 14, backgroundColor: hovered ? colors.cardHi : colors.card, borderBottomWidth: 1, borderColor: colors.separator })}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: m.isNew ? colors.accent : colors.field, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={16} color={m.isNew ? colors.onAccent : colors.dim} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontWeight: m.isNew ? '800' : '600', fontSize: fs(14.5), flex: 1 }}>
            {isComment ? (m.linkTitle ?? m.subject) : m.subject}
          </Text>
          <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>{ago(m.created)}</Text>
        </View>
        <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>
          {m.author ? `u/${m.author}` : 'Reddit'}
          {m.subreddit ? ` · r/${m.subreddit}` : ''}
          {m.type === 'username_mention' ? ' · mentioned you' : m.type === 'post_reply' ? ' · replied to your post' : m.type === 'comment_reply' ? ' · replied to your comment' : ''}
        </Text>
        <Html html={m.bodyHtml || m.body} numberOfLines={3} color={colors.text} size={fs(14)} />
      </View>
      {m.isNew && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, alignSelf: 'center' }} />}
    </Pressable>
  )
}

export default function Inbox() {
  const dock = useDockSpace()
  const account = useSession((s) => s.current)
  const [tab, setTab] = useState<Tab>('inbox')
  const [items, setItems] = useState<Message[]>([])
  const [after, setAfter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(
    async (more = false, from: string | null = null) => {
      if (!account) return setLoading(false)
      try {
        const page = await api.inbox(tab === 'mentions' ? 'mentions' : tab, more ? from : null)
        setItems((cur) => (more ? [...cur, ...page.items] : page.items))
        setAfter(page.after)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [tab, account]
  )

  useEffect(() => {
    setLoading(true)
    setItems([])
    void load()
  }, [load])

  const read = (m: Message) => {
    if (!m.isNew) return
    setItems((cur) => cur.map((x) => (x.name === m.name ? { ...x, isNew: false } : x)))
    useUnread.setState((s) => ({ count: Math.max(0, s.count - 1) }))
    void api.markRead([m.name]).catch(() => {})
  }

  const readAll = async () => {
    try {
      await api.markAllRead()
      setItems((cur) => cur.map((x) => ({ ...x, isNew: false })))
      useUnread.setState({ count: 0 })
      toast('Marked all as read')
      void refreshMe()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <Screen>
      <Header
        showBack={false}
        title="Inbox"
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="checkmark-done" label="Mark All Read" onPress={() => void readAll()} />
            <IconButton icon="create-outline" label="New Message" onPress={() => go('Compose', { mode: 'message' })} />
            {Platform.OS === 'web' && <IconButton icon="refresh" label="Refresh" onPress={() => (setRefreshing(true), void load())} />}
          </View>
        }
      />
      <View style={{ padding: 10 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'inbox', label: 'All' },
            { value: 'unread', label: 'Unread' },
            { value: 'messages', label: 'Messages' },
            { value: 'mentions', label: 'Mentions' },
            { value: 'sent', label: 'Sent' }
          ]}
        />
      </View>
      {!account ? (
        <Empty icon="mail-outline" title="Sign in to see your inbox" />
      ) : (
        <FlatList
          data={items}
          contentContainerStyle={{ paddingBottom: dock }}
          keyExtractor={(m) => m.name}
          renderItem={({ item }) => <MessageRow m={item} onRead={read} />}
          ListEmptyComponent={loading ? <Loading /> : error ? <ErrorView error={error} onRetry={() => void load()} /> : <Empty icon="mail-open-outline" title={tab === 'unread' ? 'No unread messages' : 'Nothing here'} />}
          ListFooterComponent={after ? <ActivityIndicator style={{ padding: 20 }} color={colors.accentHi} /> : undefined}
          onEndReached={() => after && void load(true, after)}
          refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load())} tintColor={colors.accentHi} />}
        />
      )}
    </Screen>
  )
}

export function Conversation({ route }: NativeStackScreenProps<RootParams, 'Conversation'>) {
  const dock = useDockSpace()
  const m = route.params.message
  const thread = [m, ...(m.replies ?? [])]
  const last = thread[thread.length - 1]
  return (
    <Screen>
      <Header title={m.subject} subtitle={m.author ? `with u/${m.author === useSession.getState().accounts.find((a) => a.id === useSession.getState().current)?.username ? m.dest : m.author}` : undefined} right={<IconButton icon="arrow-undo-outline" label="Reply" onPress={() => go('Compose', { mode: 'reply', parent: last.name, parentAuthor: last.author })} />} />
      <FlatList
        data={thread}
        keyExtractor={(x) => x.name}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 14 + dock }}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 6 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text onPress={() => item.author && go('User', { name: item.author })} style={{ color: colors.accentHi, fontWeight: '700', fontSize: fs(13.5), flex: 1 }}>
                {item.author ? `u/${item.author}` : item.subreddit ? `r/${item.subreddit}` : 'Reddit'}
              </Text>
              <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>{ago(item.created)}</Text>
            </View>
            <Html html={item.bodyHtml || item.body} onLink={(u) => void openUrl(u)} />
          </View>
        )}
      />
    </Screen>
  )
}
