import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as api from '../lib/reddit/api'
import type { Comment } from '../lib/reddit/types'
import { addReply } from '../lib/replies'
import { desktop } from '../lib/storage'
import { setEdited } from '../lib/things'
import { back, go, openUrl, parseRedditLink, type RootParams } from '../nav'
import { fail } from '../ui/actions'
import { Button, Field, Header, Screen, Segmented, Toggle } from '../ui/kit'
import { showMenu } from '../ui/overlays'
import { colors, font, fs } from '../ui/theme'
import { toast } from '../ui/toast'

// Writing: replies, edits, new posts (text, link or image) and private messages. A Markdown
// toolbar inserts formatting around the selection.

type Kind = 'self' | 'link' | 'image'

function MarkdownBar({ onWrap }: { onWrap: (before: string, after?: string, placeholder?: string) => void }) {
  const items: Array<[keyof typeof Ionicons.glyphMap, string, () => void]> = [
    ['text', 'Bold', () => onWrap('**', '**', 'bold')],
    ['code-slash', 'Code', () => onWrap('`', '`', 'code')],
    ['link', 'Link', () => onWrap('[', '](https://)', 'text')],
    ['chatbox-ellipses-outline', 'Quote', () => onWrap('> ', '', 'quote')],
    ['list', 'List', () => onWrap('- ', '', 'item')],
    ['eye-off-outline', 'Spoiler', () => onWrap('>!', '!<', 'spoiler')],
    ['remove', 'Strikethrough', () => onWrap('~~', '~~', 'text')],
    ['code-working-outline', 'Superscript', () => onWrap('^(', ')', 'text')]
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderTopWidth: 1, borderColor: colors.separator }} contentContainerStyle={{ padding: 6, gap: 2 }}>
      {items.map(([icon, label, fn]) => (
        <Pressable key={label} onPress={fn} accessibilityLabel={label} {...(Platform.OS === 'web' ? ({ title: label } as object) : {})} style={({ hovered }: any) => ({ width: 38, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered ? colors.field : 'transparent' })}>
          <Ionicons name={icon} size={18} color={colors.dim} />
        </Pressable>
      ))}
    </ScrollView>
  )
}

export default function Compose({ route }: NativeStackScreenProps<RootParams, 'Compose'>) {
  const p = route.params
  const [text, setText] = useState(p.mode === 'edit' ? p.text : p.mode === 'reply' && p.quote ? `> ${p.quote}\n\n` : '')
  const [title, setTitle] = useState('')
  const [sr, setSr] = useState(p.mode === 'post' ? (p.sr ?? '') : '')
  const [to, setTo] = useState(p.mode === 'message' ? (p.to ?? '') : '')
  const [subject, setSubject] = useState(p.mode === 'message' ? (p.subject ?? '') : '')
  const [kind, setKind] = useState<Kind>('self')
  const [url, setUrl] = useState('')
  const [nsfw, setNsfw] = useState(false)
  const [spoiler, setSpoiler] = useState(false)
  const [flair, setFlair] = useState<{ id: string; text: string } | null>(null)
  const [flairs, setFlairs] = useState<Array<{ id: string; text: string }>>([])
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const selection = useRef({ start: text.length, end: text.length })

  useEffect(() => {
    if (p.mode !== 'post' || !sr.trim()) return setFlairs([])
    const t = setTimeout(() => void api.linkFlairs(sr.trim()).then(setFlairs), 500)
    return () => clearTimeout(t)
  }, [sr, p.mode])

  const wrap = (before: string, after = '', placeholder = '') => {
    const { start, end } = selection.current
    const picked = text.slice(start, end) || placeholder
    setText(text.slice(0, start) + before + picked + after + text.slice(end))
  }

  const pickImage = async () => {
    if (!desktop) return toast('Image upload works in the desktop app for now.')
    const file = await desktop.openFile(['jpg', 'jpeg', 'png', 'gif', 'webp'])
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mimetype = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const link = await api.uploadImage({ name: file.name, mimetype, base64: file.base64 })
      if (p.mode === 'post') {
        setKind('image')
        setUrl(link)
      } else setText((t) => `${t}${t && !t.endsWith('\n') ? '\n\n' : ''}${link}\n`)
      toast('Image uploaded')
    } catch (e) {
      fail(e)
    } finally {
      setUploading(false)
    }
  }

  const send = async () => {
    setSending(true)
    try {
      if (p.mode === 'reply') {
        const r = await api.reply(p.parent, text)
        if (r.kind === 't1' && p.postId) addReply(p.postId, p.parent, r as Comment)
        toast('Reply posted')
      } else if (p.mode === 'edit') {
        const r = await api.edit(p.name, text)
        if (r.kind === 't1') setEdited(p.name, r.body, r.bodyHtml)
        else setEdited(p.name, r.selftext, r.selftextHtml ?? '')
        toast('Saved')
      } else if (p.mode === 'message') {
        await api.compose(to.replace(/^\/?u\//, ''), subject, text)
        toast('Message sent')
      } else {
        const link = await api.submit({ sr: sr.trim().replace(/^\/?r\//, ''), title, kind: kind === 'image' ? 'link' : kind, text, url, nsfw, spoiler, flairId: flair?.id })
        toast('Posted!')
        back()
        const target = link ? parseRedditLink(link) : null
        if (target?.kind === 'post') setTimeout(() => go('Thread', { id: target.id }), 50)
        else if (link) setTimeout(() => void openUrl(link), 50)
        return
      }
      back()
    } catch (e) {
      fail(e)
    } finally {
      setSending(false)
    }
  }

  const ready =
    p.mode === 'reply' || p.mode === 'edit' ? text.trim().length > 0 : p.mode === 'message' ? to.trim() && subject.trim() && text.trim() : sr.trim() && title.trim() && (kind === 'self' || url.trim())
  const heading = p.mode === 'reply' ? `Reply to u/${p.parentAuthor ?? ''}` : p.mode === 'edit' ? 'Edit' : p.mode === 'message' ? 'New Message' : 'New Post'

  return (
    <Screen>
      <Header title={heading} right={<Button title={p.mode === 'edit' ? 'Save' : p.mode === 'post' ? 'Post' : 'Send'} onPress={() => void send()} disabled={!ready} loading={sending} style={{ height: 34, marginRight: 6 }} />} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 10, maxWidth: 860, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {p.mode === 'message' && (
            <>
              <Field placeholder="To (username)" value={to} onChangeText={setTo} autoCapitalize="none" icon="person-outline" />
              <Field placeholder="Subject" value={subject} onChangeText={setSubject} />
            </>
          )}
          {p.mode === 'post' && (
            <>
              <Field placeholder="Subreddit" value={sr} onChangeText={setSr} autoCapitalize="none" icon="planet-outline" />
              <Segmented value={kind} onChange={setKind} options={[{ value: 'self', label: 'Text' }, { value: 'link', label: 'Link' }, { value: 'image', label: 'Image' }]} />
              <Field placeholder="Title" value={title} onChangeText={setTitle} />
              {kind === 'link' && <Field placeholder="https://" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" icon="link" />}
              {kind === 'image' && (
                <Button title={url ? 'Change Image' : uploading ? 'Uploading…' : 'Choose Image'} icon="image-outline" kind="secondary" onPress={() => void pickImage()} loading={uploading} />
              )}
              {kind === 'image' && url ? <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>{url}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Toggle value={nsfw} onChange={setNsfw} />
                  <Text style={{ color: colors.text }}>NSFW</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Toggle value={spoiler} onChange={setSpoiler} />
                  <Text style={{ color: colors.text }}>Spoiler</Text>
                </View>
                {flairs.length > 0 && <Button title={flair ? flair.text : 'Add Flair'} kind="secondary" icon="pricetag-outline" onPress={() => showMenu('Flair', [{ label: 'None', selected: !flair, onPress: () => setFlair(null) }, ...flairs.map((f) => ({ label: f.text, selected: flair?.id === f.id, onPress: () => setFlair(f) }))])} style={{ height: 34 }} />}
              </View>
            </>
          )}
          {(p.mode !== 'post' || kind === 'self') && (
            <TextInput
              value={text}
              onChangeText={setText}
              onSelectionChange={(e) => (selection.current = e.nativeEvent.selection)}
              multiline
              autoFocus={p.mode === 'reply' || p.mode === 'edit'}
              placeholder={p.mode === 'post' ? 'Text (optional)' : 'Write something… (Markdown)'}
              placeholderTextColor={colors.faint}
              textAlignVertical="top"
              style={{ minHeight: 260, color: colors.text, fontSize: fs(15.5), lineHeight: fs(22), padding: 12, backgroundColor: colors.card, borderRadius: 12, fontFamily: font.family, outlineStyle: 'none' } as object}
            />
          )}
        </ScrollView>
        {(p.mode !== 'post' || kind === 'self') && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <MarkdownBar onWrap={wrap} />
            </View>
            <Pressable onPress={() => void pickImage()} accessibilityLabel="Add Image" style={{ padding: 10, borderTopWidth: 1, borderColor: colors.separator }}>
              <Ionicons name={uploading ? 'cloud-upload' : 'image-outline'} size={20} color={colors.accentHi} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  )
}
