import { Ionicons } from '@expo/vector-icons'
import { useEffect } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { cancelDownload, checkModel, commentCount, downloadModel, MODEL, stopSummary, summarize, toggleFolded, useSummaries, WRITTEN_ON_DEVICE } from '../lib/summarizer'
import { WRITTEN_ON } from '../lib/summaryPrompt'
import type { Comment, More, Post } from '../lib/reddit/types'
import { colors, fs } from './theme'

// Summarize Comments under a post's comment bar (phones and the desktop app): the summary is written on the device by an
// open-source model (src/lib/summarizer.ts), downloaded once the first time.

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`

export function SummaryCard({ post, comments }: { post: Post; comments: Array<Comment | More> }) {
  const { model, progress, error } = useSummaries()
  const summary = useSummaries((s) => s.byPost[post.name])
  useEffect(() => void checkModel(), [])
  if (commentCount(comments) < 3) return null

  const box = { margin: 10, marginBottom: 2, padding: 12, borderRadius: 14, backgroundColor: colors.accentSoft, gap: 8 } as const
  const title = (text: string, busy = false) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {busy ? <ActivityIndicator size="small" color={colors.accentHi} /> : <Ionicons name="sparkles" size={16} color={colors.accentHi} />}
      <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: fs(14), flex: 1 }}>{text}</Text>
    </View>
  )
  const note = (text: string) => <Text style={{ color: colors.dim, fontSize: fs(12.5), lineHeight: fs(17) }}>{text}</Text>
  const action = (label: string, onPress: () => void, plain = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: plain ? 'transparent' : colors.accent, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: plain ? colors.accentHi : '#fff', fontWeight: '700', fontSize: fs(13.5) }}>{label}</Text>
    </Pressable>
  )

  if (summary && summary.state !== 'error') {
    const busy = summary.state !== 'done'
    // Done: the title folds the summary away and back (issue #7).
    if (!busy) {
      return (
        <View style={box}>
          <Pressable onPress={() => toggleFolded(post.name)} accessibilityRole="button" accessibilityLabel={summary.folded ? 'Show Comment Summary' : 'Hide Comment Summary'} accessibilityState={{ expanded: !summary.folded }} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={16} color={colors.accentHi} />
            <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: fs(14), flex: 1 }}>Comment Summary</Text>
            <Ionicons name={summary.folded ? 'chevron-down' : 'chevron-up'} size={18} color={colors.accentHi} />
          </Pressable>
          {!summary.folded && (
            <>
              <Text style={{ color: colors.text, fontSize: fs(14.5), lineHeight: fs(21) }}>{summary.text}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.faint, fontSize: fs(11.5), flex: 1 }}>{WRITTEN_ON(WRITTEN_ON_DEVICE)}</Text>
                {action('Again', () => void summarize(post, comments), true)}
              </View>
            </>
          )}
        </View>
      )
    }
    return (
      <View style={box}>
        {title(summary.state === 'reading' ? `Reading ${commentCount(comments)} comments…` : 'Summarizing…', true)}
        {summary.text ? <Text style={{ color: colors.text, fontSize: fs(14.5), lineHeight: fs(21) }}>{summary.text}</Text> : null}
        {action('Stop', stopSummary, true)}
      </View>
    )
  }

  if (model === 'downloading') {
    return (
      <View style={box}>
        {title(`Downloading ${MODEL.name}… ${Math.round(progress * 100)}%`, true)}
        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.separator, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: colors.accent }} />
        </View>
        {note(`${gb(progress * MODEL.bytes)} of ${gb(MODEL.bytes)}. You can keep reading; it carries on while the app is open.`)}
        {action('Cancel', () => void cancelDownload(), true)}
      </View>
    )
  }

  if (model === 'missing') {
    return (
      <View style={box}>
        {title('Summarize Comments')}
        {note(`Summaries are written on your ${WRITTEN_ON_DEVICE} by ${MODEL.name}, a free open-source AI model, so nothing leaves your ${WRITTEN_ON_DEVICE}. It's a one-time ${gb(MODEL.bytes)} download${WRITTEN_ON_DEVICE === 'phone' ? ' (Wi-Fi recommended)' : ''}.`)}
        {error ? <Text style={{ color: colors.danger, fontSize: fs(12.5) }}>{error}</Text> : null}
        {action(`Download (${gb(MODEL.bytes)})`, () => void downloadModel())}
      </View>
    )
  }

  if (model !== 'ready') return null
  return (
    <Pressable onPress={() => void summarize(post, comments)} accessibilityRole="button" style={({ pressed }) => [box, { flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.75 : 1 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        {title('Summarize Comments')}
        {summary?.state === 'error' ? <Text style={{ color: colors.danger, fontSize: fs(12.5) }}>Couldn't summarize: {summary.error}. Tap to try again.</Text> : note('Get the gist of what everyone is saying.')}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.accentHi} />
    </Pressable>
  )
}
