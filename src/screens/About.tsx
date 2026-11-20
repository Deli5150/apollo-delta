import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useDockSpace } from '../lib/layout'
import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { compact, shortDate } from '../lib/format'
import * as api from '../lib/reddit/api'
import type { Subreddit } from '../lib/reddit/types'
import { useStore } from '../lib/store'
import { go, openUrl, type RootParams } from '../nav'
import { Html } from '../ui/Html'
import { Button, ErrorView, Group, Header, Loading, Row, Screen, Sep, ToggleRow } from '../ui/kit'
import { colors, fs } from '../ui/theme'
import { SubredditHeader } from './Feed'

// A subreddit's sidebar: description, rules, moderators, and its Tag Filter exceptions.

export default function About({ route }: NativeStackScreenProps<RootParams, 'About'>) {
  const dock = useDockSpace()
  const name = route.params.sr
  const [sr, setSr] = useState<Subreddit | null>(null)
  const [rules, setRules] = useState<Array<{ title: string; description: string }>>([])
  const [mods, setMods] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const override = useStore((s) => s.settings.tagOverrides[name.toLowerCase()])
  const s = useStore((x) => x.settings)
  useEffect(() => {
    api
      .about(name)
      .then(setSr)
      .catch((e) => setError((e as Error).message))
    void api.rules(name).then(setRules).catch(() => {})
    void api.moderators(name).then(setMods)
  }, [name])
  const setOverride = (k: 'nsfw' | 'spoiler', v: boolean) => {
    const cur = useStore.getState().settings.tagOverrides
    useStore.getState().set('tagOverrides', { ...cur, [name.toLowerCase()]: { ...cur[name.toLowerCase()], [k]: v } })
  }
  return (
    <Screen>
      <Header title={`r/${name}`} subtitle="About" />
      {error ? (
        <ErrorView error={error} />
      ) : !sr ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 + dock, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
          <SubredditHeader sr={sr} onAbout={() => {}} />
          <View style={{ paddingHorizontal: 14 }}>
            <Text style={{ color: colors.dim, fontSize: fs(13) }}>
              {compact(sr.subscribers)} members · created {shortDate(sr.created)} · {sr.type}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button title="New Post" icon="create-outline" onPress={() => go('Compose', { mode: 'post', sr: sr.name })} style={{ height: 36 }} />
              {sr.wikiEnabled !== false && <Button title="Wiki" icon="book-outline" kind="secondary" onPress={() => go('Wiki', { sr: sr.name })} style={{ height: 36 }} />}
              <Button title="Message Mods" icon="mail-outline" kind="secondary" onPress={() => go('Compose', { mode: 'message', to: `/r/${sr.name}` })} style={{ height: 36 }} />
            </View>
            {sr.descriptionHtml && (
              <Group title="Sidebar">
                <View style={{ padding: 14 }}>
                  <Html html={sr.descriptionHtml} size={fs(14)} onLink={(u) => void openUrl(u)} />
                </View>
              </Group>
            )}
            {rules.length > 0 && (
              <Group title="Rules">
                {rules.map((r, i) => (
                  <View key={i}>
                    {i > 0 && <Sep />}
                    <View style={{ padding: 14, gap: 4 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: fs(14.5) }}>
                        {i + 1}. {r.title}
                      </Text>
                      {r.description ? <Text style={{ color: colors.dim, fontSize: fs(13.5), lineHeight: 19 }}>{r.description}</Text> : null}
                    </View>
                  </View>
                ))}
              </Group>
            )}
            <Group title="Tag Filters Here" footer="Exceptions to Settings → Tag Filters for this subreddit only.">
              <ToggleRow title="Blur NSFW" value={override?.nsfw ?? s.blurNsfw} onChange={(v) => setOverride('nsfw', v)} />
              <Sep />
              <ToggleRow title="Blur Spoilers" value={override?.spoiler ?? s.blurSpoilers} onChange={(v) => setOverride('spoiler', v)} />
            </Group>
            {mods.length > 0 && (
              <Group title="Moderators">
                {mods.slice(0, 30).map((m, i) => (
                  <View key={m}>
                    {i > 0 && <Sep />}
                    <Row title={`u/${m}`} onPress={() => go('User', { name: m })} />
                  </View>
                ))}
              </Group>
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  )
}

export function Wiki({ route }: NativeStackScreenProps<RootParams, 'Wiki'>) {
  const dock = useDockSpace()
  const { sr, page = 'index' } = route.params
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api
      .wiki(sr, page)
      .then((w) => setHtml(w.html))
      .catch((e) => setError((e as Error).message))
  }, [sr, page])
  return (
    <Screen>
      <Header title={`r/${sr} Wiki`} subtitle={page} />
      {error ? (
        <ErrorView error={error} />
      ) : html === null ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + dock, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
          <Html html={html} onLink={(u) => void openUrl(u)} />
        </ScrollView>
      )}
    </Screen>
  )
}
