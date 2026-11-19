import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { memo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { covers } from '../lib/filters'
import { ago, compact, fullDate } from '../lib/format'
import type { Flair, Post } from '../lib/reddit/types'
import { useStore } from '../lib/store'
import { usePatched } from '../lib/things'
import { useTranslations } from '../lib/translate'
import { go, openUrl } from '../nav'
import { doSave, doVote, postMenu } from './actions'
import { Html } from './Html'
import { Avatar, Pill } from './kit'
import { hasMedia, PostMedia, Thumb } from './media'
import { toast } from './toast'
import { colors, fs, hexA } from './theme'

// A post in a feed: Large (media full width, like Apollo's default) or Compact (thumbnail beside
// the title). Tapping opens the comments; the thumbnail or media opens the media.

export function FlairPill({ flair, small }: { flair: Flair; small?: boolean }) {
  const bg = flair.bg && flair.bg !== 'transparent' ? flair.bg : colors.field
  const fg = flair.bg && flair.bg !== 'transparent' ? (flair.color === 'dark' ? '#111' : '#fff') : colors.dim
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5, backgroundColor: bg, maxWidth: 220 }}>
      {flair.parts?.map((p, i) => (p.t === 'emoji' ? <Image key={i} source={{ uri: p.url }} style={{ width: 13, height: 13 }} /> : null))}
      <Text numberOfLines={1} style={{ color: fg, fontSize: fs(small ? 10.5 : 11.5), fontWeight: '600', flexShrink: 1 }}>
        {flair.text}
      </Text>
    </View>
  )
}

/** A relative time that shows the full date when tapped. */
export function Time({ ms, edited, style }: { ms: number; edited?: number; style?: object }) {
  const absolute = useStore((s) => s.settings.showTimestampsAbsolute)
  return (
    <Text onPress={() => toast(`${fullDate(ms)}${edited ? `\nEdited ${fullDate(edited)}` : ''}`)} style={style}>
      {absolute ? new Date(ms).toLocaleDateString() : ago(ms)}
      {edited ? '*' : ''}
    </Text>
  )
}

function Tags({ post }: { post: Post }) {
  return (
    <>
      {post.nsfw && <Pill text="NSFW" color="#fff" bg={colors.nsfw} small />}
      {post.spoiler && <Pill text="SPOILER" color="#fff" bg={colors.spoiler} small />}
      {post.stickied && <Ionicons name="pin" size={13} color={colors.mod} />}
      {post.locked && <Ionicons name="lock-closed" size={12} color={colors.dim} />}
      {post.archived && <Ionicons name="archive" size={12} color={colors.dim} />}
    </>
  )
}

export function ScoreButton({ likes, score, onUp, onDown, hideScore }: { likes: number; score: number; onUp: () => void; onDown: () => void; hideScore?: boolean }) {
  const color = likes === 1 ? colors.upvote : likes === -1 ? colors.downvote : colors.dim
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable onPress={onUp} hitSlop={6} accessibilityLabel="Upvote" style={({ hovered }: any) => ({ padding: 5, borderRadius: 8, backgroundColor: hovered ? hexA(colors.upvote, 0.12) : 'transparent' })}>
        <Ionicons name={likes === 1 ? 'arrow-up' : 'arrow-up-outline'} size={19} color={likes === 1 ? colors.upvote : colors.dim} />
      </Pressable>
      <Text style={{ color, fontSize: fs(13.5), fontWeight: '700', minWidth: 26, textAlign: 'center' }}>{hideScore ? '•' : compact(score)}</Text>
      <Pressable onPress={onDown} hitSlop={6} accessibilityLabel="Downvote" style={({ hovered }: any) => ({ padding: 5, borderRadius: 8, backgroundColor: hovered ? hexA(colors.downvote, 0.12) : 'transparent' })}>
        <Ionicons name={likes === -1 ? 'arrow-down' : 'arrow-down-outline'} size={19} color={likes === -1 ? colors.downvote : colors.dim} />
      </Pressable>
    </View>
  )
}

interface Props {
  post: Post
  /** The feed it's in ('' = Home): subreddit names show only in feeds that mix subreddits. */
  showSubreddit: boolean
  width: number
  selected?: boolean
  onOpen: (p: Post) => void
}

export const PostCard = memo(function PostCard({ post: p0, showSubreddit, width, selected, onOpen }: Props) {
  const p = usePatched(p0)
  const s = useStore(
    useShallow((x) => ({
      postSize: x.settings.postSize,
      thumbSide: x.settings.thumbnailSide,
      showThumbs: x.settings.showThumbnails,
      showFlair: x.settings.showFlair,
      showIcons: x.settings.showSubredditIcons,
      dim: x.settings.dimReadPosts,
      autoplay: x.settings.autoplay,
      muted: x.settings.mutedVideos,
      richLinks: x.settings.richLinks,
      read: Boolean(x.read[p0.name]),
      settings: x.settings
    }))
  )
  const translated = useTranslations((x) => (x.shown[p.name] ? x.byName[p.name] : undefined))
  const [hover, setHover] = useState(false)
  if (p.deleted) return null
  const cover = covers(p, s.settings)
  const read = s.dim && s.read && !selected
  const title = translated && translated !== 'loading' ? translated.text.split('\n\n')[0] : p.title
  const titleColor = read ? colors.dim : colors.text
  const open = () => onOpen(p)
  const meta = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {showSubreddit && (
        <Pressable onPress={() => go('Feed', { feed: p.subreddit })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {s.showIcons && <Avatar uri={p.subredditIcon} name={p.subreddit} size={16} />}
          <Text style={{ color: colors.dim, fontSize: fs(12.5), fontWeight: '600' }}>{p.subreddit}</Text>
        </Pressable>
      )}
      {showSubreddit && <Text style={{ color: colors.faint, fontSize: fs(12.5) }}>·</Text>}
      <Text onPress={() => go('User', { name: p.author })} style={{ color: p.distinguished === 'moderator' ? colors.mod : p.distinguished === 'admin' ? colors.admin : colors.dim, fontSize: fs(12.5) }}>
        {p.author}
      </Text>
      <Text style={{ color: colors.faint, fontSize: fs(12.5) }}>·</Text>
      <Time ms={p.created} edited={p.edited} style={{ color: colors.dim, fontSize: fs(12.5) }} />
      {!p.isSelf && p.media.kind === 'link' && (
        <Text numberOfLines={1} style={{ color: colors.faint, fontSize: fs(12.5), flexShrink: 1 }}>
          · {p.domain}
        </Text>
      )}
      {p.awards > 0 && s.settings.showAwards && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Ionicons name="trophy" size={11} color="#e9a514" />
          <Text style={{ color: colors.dim, fontSize: fs(11.5) }}>{p.awards}</Text>
        </View>
      )}
    </View>
  )
  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -5 }}>
      <ScoreButton likes={p.likes} score={p.score} onUp={() => void doVote(p, 1)} onDown={() => void doVote(p, -1)} />
      <Pressable onPress={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
        <Ionicons name="chatbubble-outline" size={16} color={colors.dim} />
        <Text style={{ color: colors.dim, fontSize: fs(13.5), fontWeight: '600' }}>{compact(p.numComments)}</Text>
      </Pressable>
      {p.upvoteRatio !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4 }}>
          <Ionicons name="happy-outline" size={15} color={colors.faint} />
          <Text style={{ color: colors.faint, fontSize: fs(12.5) }}>{Math.round(p.upvoteRatio * 100)}%</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => void doSave(p)} hitSlop={6} accessibilityLabel={p.saved ? 'Unsave' : 'Save'} style={{ padding: 6, opacity: hover || p.saved ? 1 : 0.7 }}>
        <Ionicons name={p.saved ? 'bookmark' : 'bookmark-outline'} size={17} color={p.saved ? colors.success : colors.dim} />
      </Pressable>
      <Pressable onPress={() => postMenu(p)} hitSlop={6} accessibilityLabel="More" style={{ padding: 6 }}>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.dim} />
      </Pressable>
    </View>
  )
  const bg = selected ? colors.accentSoft : hover ? (colors.dark ? hexA('#ffffff', 0.025) : hexA('#000000', 0.02)) : colors.card

  if (s.postSize === 'compact') {
    const thumb = s.showThumbs && (hasMedia(p) || p.isSelf) && <Thumb post={p} size={70} blurNsfw={p.nsfw && cover.nsfw} blurSpoiler={p.spoiler && cover.spoiler} onPress={() => (p.media.kind === 'link' || p.media.kind === 'youtube' || p.media.kind === 'none' ? (p.media.kind === 'none' ? open() : void openUrl(p.url)) : open())} />
    return (
      <Pressable onPress={open} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onLongPress={() => postMenu(p)} style={{ backgroundColor: bg, borderBottomWidth: 1, borderColor: colors.separator, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flexDirection: s.thumbSide === 'left' ? 'row' : 'row-reverse', gap: 12 }}>
          {thumb}
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: titleColor, fontSize: fs(15.5), fontWeight: '600', lineHeight: fs(20.5) }}>{title}</Text>
            <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tags post={p} />
              {s.showFlair && p.flair && <FlairPill flair={p.flair} small />}
            </View>
            {meta}
          </View>
        </View>
        {footer}
      </Pressable>
    )
  }

  return (
    <Pressable onPress={open} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} onLongPress={() => postMenu(p)} style={{ backgroundColor: bg, borderBottomWidth: 8, borderColor: colors.bg, paddingTop: 12 }}>
      <View style={{ paddingHorizontal: 14, gap: 6, paddingBottom: 10 }}>
        <Text style={{ color: titleColor, fontSize: fs(17), fontWeight: '600', lineHeight: fs(22.5) }}>{title}</Text>
        {(p.nsfw || p.spoiler || p.stickied || p.locked || (s.showFlair && p.flair)) && (
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tags post={p} />
            {s.showFlair && p.flair && <FlairPill flair={p.flair} />}
          </View>
        )}
      </View>
      {hasMedia(p) && (
        <View style={{ marginBottom: 10 }}>
          <PostMedia post={p} width={width} maxHeight={620} autoplay={s.autoplay} muted={s.muted} blurNsfw={cover.nsfw} blurSpoiler={cover.spoiler} richLinks={s.richLinks} onLink={(u) => void openUrl(u)} />
        </View>
      )}
      {p.isSelf && p.selftextHtml && !(p.spoiler && cover.spoiler) && (
        <View style={{ paddingHorizontal: 14, marginBottom: 10 }}>
          <Html html={p.selftextHtml} numberOfLines={4} color={colors.dim} size={fs(14.5)} />
        </View>
      )}
      {p.crosspost && (
        <Pressable onPress={() => go('Thread', { id: p.crosspost!.id })} style={{ marginHorizontal: 14, marginBottom: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.separator, gap: 3 }}>
          <Text style={{ color: colors.dim, fontSize: fs(12) }}>
            <Ionicons name="git-branch-outline" size={12} /> Crossposted from r/{p.crosspost.subreddit}
          </Text>
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: fs(14), fontWeight: '600' }}>
            {p.crosspost.title}
          </Text>
        </Pressable>
      )}
      <View style={{ paddingHorizontal: 14, gap: 4, paddingBottom: 4 }}>
        {meta}
        {footer}
      </View>
    </Pressable>
  )
})
