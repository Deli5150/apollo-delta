import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useCallback, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { create } from 'zustand'
import { useWide } from '../lib/layout'
import type { Post } from '../lib/reddit/types'
import { useStore } from '../lib/store'
import { go, type RootParams } from '../nav'
import { IconButton } from '../ui/kit'
import { colors } from '../ui/theme'
import { Feed } from './Feed'
import { SubredditList } from './Subreddits'
import { ThreadView } from './Thread'

// The Posts tab. On a wide window it's three panes, like Apollo on an iPad: your subreddits, the
// feed, and the open post's comments. On a phone it's the feed, with posts opening on top.

/** The Posts tab's current feed (so other screens can switch it). */
export const usePostsFeed = create<{ feed: string | null; showList: boolean }>(() => ({ feed: null, showList: true }))

/** A feed with a reader pane beside it when there's room. */
export function FeedWithReader({ feed, showBack, left }: { feed: string; showBack?: boolean; left?: React.ReactNode }) {
  const wide = useWide()
  const { width } = useWindowDimensions()
  const [open, setOpen] = useState<Post | null>(null)
  // Room for both: the window minus the sidebar (and list) must fit a feed and a reader.
  const split = wide && width >= 1000
  const onOpen = useCallback((p: Post) => (split ? setOpen(p) : go('Thread', { id: p.id, post: p })), [split])
  if (!split) return <Feed feed={feed} onOpen={onOpen} showBack={showBack} left={left} />
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: Math.min(560, Math.max(380, width * 0.36)), borderRightWidth: 1, borderColor: colors.separator }}>
        <Feed feed={feed} onOpen={onOpen} selected={open?.name} showBack={showBack} left={left} />
      </View>
      <View style={{ flex: 1 }}>{open ? <ThreadView key={open.name} id={open.id} initial={open} embedded onClose={() => setOpen(null)} /> : <ReaderPlaceholder />}</View>
    </View>
  )
}

function ReaderPlaceholder() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <View style={{ opacity: 0.35 }}>
        <IconButton icon="chatbubbles-outline" label="Pick a post" size={54} color={colors.faint} />
      </View>
    </View>
  )
}

export default function Posts() {
  const wide = useWide()
  const { width } = useWindowDimensions()
  const defaultFeed = useStore((s) => s.settings.defaultFeed)
  const { feed: picked, showList } = usePostsFeed()
  const feed = picked ?? defaultFeed
  const roomForList = wide && width >= 1180
  const toggle = <IconButton icon="list" label={showList ? 'Hide Subreddits' : 'Show Subreddits'} active={showList && roomForList} onPress={() => (roomForList ? usePostsFeed.setState({ showList: !showList }) : go('Subreddits'))} />
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {roomForList && showList && (
        <View style={{ width: 250, borderRightWidth: 1, borderColor: colors.separator }}>
          <SubredditList current={feed} onPick={(f) => usePostsFeed.setState({ feed: f })} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <FeedWithReader key={feed} feed={feed} left={toggle} showBack={false} />
      </View>
    </View>
  )
}

export function FeedScreen({ route }: NativeStackScreenProps<RootParams, 'Feed'>) {
  return <FeedWithReader feed={route.params.feed} />
}
