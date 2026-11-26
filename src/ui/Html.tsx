import { memo, useMemo, useState, type ReactNode } from 'react'
import { Platform, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import { metaForHref } from '../lib/reddit/parse'
import type { MediaImage } from '../lib/reddit/types'
import { colors, font, fs } from './theme'
import { InlineImage } from './media'
import { parseHtml, textOf, type Node } from './htmlParse'

// Reddit's rendered Markdown (body_html / selftext_html) drawn with React Native views, so posts
// and comments look the same on every platform: paragraphs, quotes, lists, code, tables, headings,
// spoilers (tap to reveal), links, and images posted in comments shown inline.

const BLOCK = new Set(['p', 'div', 'blockquote', 'ul', 'ol', 'li', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr'])

const isImageUrl = (u: string) => /^https?:\/\/(preview\.redd\.it|i\.redd\.it|i\.imgur\.com|external-preview\.redd\.it)\/.+\.(jpe?g|png|gif|webp)(\?|$)/i.test(u) || /^https?:\/\/i\.imgur\.com\/\w+\.(jpe?g|png|gif)$/i.test(u)

export interface HtmlProps {
  html: string
  size?: number
  color?: string
  onLink?: (url: string) => void
  onLongLink?: (url: string) => void
  /** Show images linked in the text inline (Settings → Inline Media). */
  inlineMedia?: boolean
  mediaMetadata?: Record<string, MediaImage>
  numberOfLines?: number
  selectable?: boolean
}

interface Ctx extends HtmlProps {
  size: number
  color: string
}

function Spoiler({ children, style }: { children: ReactNode; style: TextStyle }) {
  const [open, setOpen] = useState(false)
  return (
    <Text onPress={() => setOpen((o) => !o)} style={[style, { backgroundColor: open ? colors.field : colors.spoiler, color: open ? style.color : 'transparent', borderRadius: 3 }]}>
      {children}
    </Text>
  )
}

function inline(nodes: Array<Node | string>, ctx: Ctx, style: TextStyle, key = 'i'): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`
    if (typeof n === 'string') return n
    switch (n.tag) {
      case 'strong':
      case 'b':
        return (
          <Text key={k} style={{ fontWeight: '700' }}>
            {inline(n.children, ctx, style, k)}
          </Text>
        )
      case 'em':
      case 'i':
        return (
          <Text key={k} style={{ fontStyle: 'italic' }}>
            {inline(n.children, ctx, style, k)}
          </Text>
        )
      case 'del':
      case 's':
        return (
          <Text key={k} style={{ textDecorationLine: 'line-through' }}>
            {inline(n.children, ctx, style, k)}
          </Text>
        )
      case 'code':
        return (
          <Text key={k} style={{ fontFamily: font.mono, fontSize: ctx.size * 0.9, backgroundColor: colors.field }}>
            {textOf(n)}
          </Text>
        )
      case 'sup':
        return (
          <Text key={k} style={{ fontSize: ctx.size * 0.75 }}>
            {inline(n.children, ctx, style, k)}
          </Text>
        )
      case 'br':
        return '\n'
      case 'a': {
        const href = n.attrs.href ?? ''
        const url = href.startsWith('/') ? `https://www.reddit.com${href}` : href
        return (
          <Text key={k} style={{ color: colors.accentHi }} onPress={() => ctx.onLink?.(url)} onLongPress={() => ctx.onLongLink?.(url)}>
            {inline(n.children, ctx, style, k)}
          </Text>
        )
      }
      case 'span':
        if ((n.attrs.class ?? '').includes('md-spoiler-text'))
          return (
            <Spoiler key={k} style={style}>
              {inline(n.children, ctx, style, k)}
            </Spoiler>
          )
        return <Text key={k}>{inline(n.children, ctx, style, k)}</Text>
      case 'img':
        return null
      default:
        return <Text key={k}>{inline(n.children, ctx, style, k)}</Text>
    }
  })
}

/** Images linked on their own in a paragraph (how Reddit renders pictures posted in comments). */
function imageLinks(n: Node, ctx: Ctx): Array<{ url: string; image?: MediaImage }> {
  if (!ctx.inlineMedia) return []
  const out: Array<{ url: string; image?: MediaImage }> = []
  for (const c of n.children) {
    // Some clients leave the markdown in the text: ![gif](giphy|id) or ![img](id).
    if (typeof c === 'string') {
      for (const m of c.matchAll(/!\[(?:gif|img)\]\(([^)\s]+)\)/g)) {
        const meta = metaForHref(m[1], ctx.mediaMetadata)
        if (meta) out.push({ url: meta.url, image: meta })
      }
      continue
    }
    if (c.tag !== 'a') continue
    const href = c.attrs.href ?? ''
    const meta = metaForHref(href, ctx.mediaMetadata)
    if (meta || (isImageUrl(href) && textOf(c).trim().startsWith('http'))) out.push({ url: meta?.url ?? href, image: meta })
  }
  return out
}

function block(n: Node, ctx: Ctx, key: string, depth = 0): ReactNode {
  const base: TextStyle = { color: ctx.color, fontSize: ctx.size, lineHeight: Math.round(ctx.size * 1.42), fontFamily: font.family }
  const para = (children: Array<Node | string>, style: TextStyle = {}, k = key) => (
    <Text key={k} selectable={ctx.selectable} style={[base, style]}>
      {inline(children, ctx, { ...base, ...style }, k)}
    </Text>
  )
  switch (n.tag) {
    case 'p': {
      const images = imageLinks(n, ctx)
      if (images.length) {
        // A paragraph that's only the image link becomes the image.
        const onlyLinks = n.children.every((c) => (typeof c === 'string' ? !c.replace(/!\[(?:gif|img)\]\([^)\s]+\)/g, '').trim() : c.tag === 'a' || c.tag === 'br'))
        return (
          <View key={key} style={{ gap: 6 }}>
            {!onlyLinks && para(n.children, {}, `${key}t`)}
            {images.map((img, i) => (
              <InlineImage key={i} url={img.url} image={img.image} onPress={() => ctx.onLink?.(img.url)} />
            ))}
          </View>
        )
      }
      return para(n.children)
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(n.tag[1])
      return para(n.children, { fontWeight: '700', fontSize: ctx.size * (level <= 1 ? 1.45 : level === 2 ? 1.3 : level === 3 ? 1.15 : 1.05), lineHeight: Math.round(ctx.size * 1.7) })
    }
    case 'blockquote':
      return (
        <View key={key} style={{ borderLeftWidth: 3, borderColor: colors.faint, paddingLeft: 10, gap: 8 }}>
          {blocks(n.children, { ...ctx, color: colors.dim }, key, depth)}
        </View>
      )
    case 'ul':
    case 'ol': {
      let i = Number(n.attrs.start ?? 1)
      return (
        <View key={key} style={{ gap: 4 }}>
          {n.children
            .filter((c): c is Node => typeof c !== 'string' && c.tag === 'li')
            .map((li, j) => {
              const marker = n.tag === 'ol' ? `${i++}.` : depth % 2 ? '◦' : '•'
              return (
                <View key={j} style={{ flexDirection: 'row' }}>
                  <Text style={[base, { width: n.tag === 'ol' ? 26 : 16, color: colors.dim }]}>{marker}</Text>
                  <View style={{ flex: 1, gap: 4 }}>{blocks(li.children, ctx, `${key}.${j}`, depth + 1)}</View>
                </View>
              )
            })}
        </View>
      )
    }
    case 'pre':
      return (
        <ScrollView key={key} horizontal style={{ backgroundColor: colors.field, borderRadius: 8 }} contentContainerStyle={{ padding: 10 }}>
          <Text selectable style={{ fontFamily: font.mono, fontSize: ctx.size * 0.85, color: ctx.color, lineHeight: Math.round(ctx.size * 1.3) }}>
            {textOf(n).replace(/\n$/, '')}
          </Text>
        </ScrollView>
      )
    case 'hr':
      return <View key={key} style={{ height: 1, backgroundColor: colors.separator, marginVertical: 4 }} />
    case 'table': {
      const rows: Node[] = []
      const collect = (x: Node) => x.children.forEach((c) => typeof c !== 'string' && (c.tag === 'tr' ? rows.push(c) : collect(c)))
      collect(n)
      return (
        <ScrollView key={key} horizontal>
          <View style={{ borderWidth: 1, borderColor: colors.separator, borderRadius: 6 }}>
            {rows.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', borderTopWidth: i ? 1 : 0, borderColor: colors.separator, backgroundColor: i === 0 ? colors.field : undefined }}>
                {r.children
                  .filter((c): c is Node => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th'))
                  .map((c, j) => (
                    <View key={j} style={{ minWidth: 90, maxWidth: 260, padding: 6, borderLeftWidth: j ? 1 : 0, borderColor: colors.separator }}>
                      <Text style={[base, { fontSize: ctx.size * 0.9, fontWeight: c.tag === 'th' ? '700' : '400', textAlign: (c.attrs.align as TextStyle['textAlign']) ?? 'left' }]}>{inline(c.children, ctx, base, `${key}.${i}.${j}`)}</Text>
                    </View>
                  ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )
    }
    case 'div':
    case 'root':
    case 'li':
    case 'tbody':
    case 'thead':
      return (
        <View key={key} style={{ gap: 8 }}>
          {blocks(n.children, ctx, key, depth)}
        </View>
      )
    default:
      return para([n])
  }
}

/** Block children; loose inline runs between blocks become paragraphs. */
function blocks(nodes: Array<Node | string>, ctx: Ctx, key: string, depth: number): ReactNode[] {
  const out: ReactNode[] = []
  let run: Array<Node | string> = []
  const flush = () => {
    if (run.some((r) => (typeof r === 'string' ? r.trim() : true))) out.push(block({ tag: 'p', attrs: {}, children: run }, ctx, `${key}.r${out.length}`, depth))
    run = []
  }
  nodes.forEach((n, i) => {
    if (typeof n !== 'string' && BLOCK.has(n.tag)) {
      flush()
      out.push(block(n, ctx, `${key}.${i}`, depth))
    } else if (typeof n === 'string') {
      // Whitespace between blocks.
      if (n.trim() || run.length) run.push(n.replace(/^\n+/, ''))
    } else run.push(n)
  })
  flush()
  return out
}

/** Reddit HTML → views. */
export const Html = memo(function Html(props: HtmlProps) {
  const tree = useMemo(() => parseHtml(props.html), [props.html])
  const ctx: Ctx = { ...props, size: props.size ?? fs(15), color: props.color ?? colors.text, selectable: props.selectable ?? Platform.OS === 'web' }
  if (props.numberOfLines) {
    // Previews (feeds, inbox rows): plain text, clipped.
    return (
      <Text numberOfLines={props.numberOfLines} style={{ color: ctx.color, fontSize: ctx.size, lineHeight: Math.round(ctx.size * 1.38) }}>
        {textOf(tree).replace(/\n{2,}/g, '\n').trim()}
      </Text>
    )
  }
  return <View style={{ gap: 8 }}>{blocks(tree.children, ctx, 'h', 0)}</View>
})
