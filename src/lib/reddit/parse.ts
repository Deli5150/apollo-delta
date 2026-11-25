import type { Comment, Flair, Media, MediaImage, Message, More, Multi, Post, Subreddit, Trophy, User, Vote } from './types'

// Reddit's raw JSON → the app's types. Requests always ask for raw_json=1, so text comes unescaped.

type Raw = Record<string, any>

const decode = (s?: string | null): string =>
  (s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

const goodUrl = (u?: string | null): string | undefined => (u && /^https?:\/\//.test(u) ? decode(u) : undefined)

const likes = (v: boolean | null | undefined): Vote => (v === true ? 1 : v === false ? -1 : 0)

export function flair(text?: string | null, richtext?: Raw[] | null, bg?: string | null, color?: string | null): Flair | undefined {
  const parts: NonNullable<Flair['parts']> = []
  for (const r of richtext ?? []) {
    if (r.e === 'text' && r.t) parts.push({ t: 'text', v: decode(r.t) })
    else if (r.e === 'emoji' && r.u) parts.push({ t: 'emoji', url: r.u })
  }
  // With rich text, the plain text has :emoji: placeholders where the pictures go.
  const t = parts.length ? parts.filter((p) => p.t === 'text').map((p) => (p as { v: string }).v).join('').trim() : decode(text).trim()
  if (!t && !parts.length) return undefined
  return { text: t, bg: bg || undefined, color: color === 'light' ? 'light' : color === 'dark' ? 'dark' : undefined, parts: parts.length ? parts : undefined }
}

function image(src?: Raw, resolutions?: Raw[]): MediaImage | undefined {
  if (!src?.url) return undefined
  return {
    url: decode(src.url),
    width: src.width ?? 0,
    height: src.height ?? 0,
    previews: (resolutions ?? []).map((r) => ({ url: decode(r.url), width: r.width, height: r.height }))
  }
}

/** Reddit's media_metadata entry (galleries, images and GIFs in comments and self posts). */
function metaImage(m: Raw | undefined): MediaImage | undefined {
  if (!m || m.status !== 'valid' || !m.s) {
    // Reddit marks some gallery photos as failed but still has their files.
    if (m?.id && m.m) return { url: `https://i.redd.it/${m.id}.${String(m.m).split('/')[1] === 'jpeg' ? 'jpg' : String(m.m).split('/')[1]}`, width: 0, height: 0 }
    return undefined
  }
  const s = m.s
  const url = decode(s.u ?? s.gif ?? s.mp4)
  return {
    url,
    width: s.x ?? 0,
    height: s.y ?? 0,
    previews: (m.p ?? []).map((p: Raw) => ({ url: decode(p.u), width: p.x, height: p.y })),
    mp4: s.mp4 ? decode(s.mp4) : undefined
  }
}

export function mediaMetadata(raw?: Raw | null): Record<string, MediaImage> | undefined {
  if (!raw) return undefined
  const out: Record<string, MediaImage> = {}
  for (const [k, v] of Object.entries(raw)) {
    const img = metaImage(v as Raw)
    if (img) out[k] = img
  }
  return out
}

const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/

export function youTubeId(url: string): { id: string; start?: number } | null {
  const m = url.match(YT)
  if (!m) return null
  const t = url.match(/[?&]t=(\d+)/)
  return { id: m[1], start: t ? Number(t[1]) : undefined }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)(\?|$)/i

function media(d: Raw): Media {
  const preview = d.preview?.images?.[0]
  const poster = preview ? decode(preview.source?.url) : undefined
  // Video hosted on Reddit.
  const hosted = d.secure_media?.reddit_video ?? d.media?.reddit_video
  // Links to GIF hosts (gfycat, redgifs, …) come with Reddit's own MP4 copy as a "video preview".
  const rv = hosted ?? (d.post_hint === 'link' || d.post_hint === 'rich:video' || d.post_hint === 'image' ? d.preview?.reddit_video_preview : undefined)
  if (rv && (d.is_video || d.domain === 'v.redd.it' || !hosted)) {
    return { kind: 'video', hls: rv.hls_url ? decode(rv.hls_url) : undefined, dash: rv.dash_url ? decode(rv.dash_url) : undefined, mp4: rv.fallback_url ? decode(rv.fallback_url) : undefined, width: rv.width ?? 16, height: rv.height ?? 9, poster, duration: rv.duration, gif: Boolean(rv.is_gif) }
  }
  // Galleries.
  if (d.is_gallery && d.gallery_data?.items && d.media_metadata) {
    const items: MediaImage[] = []
    for (const it of d.gallery_data.items) {
      const img = metaImage(d.media_metadata[it.media_id])
      if (img) items.push({ ...img, caption: it.caption ? decode(it.caption) : undefined, link: goodUrl(it.outbound_url) })
    }
    if (items.length) return { kind: 'gallery', items }
  }
  const url: string = decode(d.url_overridden_by_dest ?? d.url ?? '')
  const yt = youTubeId(url)
  if (yt) return { kind: 'youtube', id: yt.id, start: yt.start, poster }
  // Imgur: direct files and .gifv become images/videos; albums need their own lookup.
  const imgur = url.match(/^https?:\/\/(?:i\.|m\.)?imgur\.com\/(a\/|gallery\/)?([\w]+)(\.\w+)?/)
  if (imgur) {
    if (imgur[1]) return { kind: 'imgur-album', id: imgur[2], poster }
    const ext = (imgur[3] ?? '').toLowerCase()
    if (ext === '.gifv' || ext === '.mp4' || ext === '.gif') return { kind: 'video', mp4: `https://i.imgur.com/${imgur[2]}.mp4`, width: preview?.source?.width ?? 16, height: preview?.source?.height ?? 9, poster, gif: true }
    const img = image(preview?.source, preview?.resolutions)
    return { kind: 'image', image: img ? { ...img, url: `https://i.imgur.com/${imgur[2]}${ext || '.jpg'}` } : { url: `https://i.imgur.com/${imgur[2]}${ext || '.jpg'}`, width: 0, height: 0 } }
  }
  // GIFs Reddit converted to MP4.
  const mp4 = preview?.variants?.mp4
  if (mp4?.source?.url && (d.post_hint === 'image' || /\.gif(\?|$)/i.test(url))) {
    const img = image(preview.variants.gif?.source ?? preview.source, preview.resolutions)!
    return { kind: 'gif', image: img, mp4: decode(mp4.source.url) }
  }
  if (d.post_hint === 'image' || IMAGE_EXT.test(url) || d.domain === 'i.redd.it') {
    const img = image(preview?.source, preview?.resolutions)
    if (img) return { kind: 'image', image: { ...img, url: d.domain === 'i.redd.it' ? url : img.url } }
    return { kind: 'image', image: { url, width: 0, height: 0 } }
  }
  if (d.post_hint === 'rich:video' && (d.secure_media?.oembed || d.media?.oembed)) {
    const o = d.secure_media?.oembed ?? d.media?.oembed
    return { kind: 'embed', html: decode(o.html), url, poster: goodUrl(o.thumbnail_url) ?? poster, provider: o.provider_name }
  }
  if (d.is_self) return { kind: 'none' }
  if (url && !/reddit\.com\/r\/[^/]+\/comments\//.test(url)) {
    return { kind: 'link', url, domain: d.domain, thumb: poster ?? goodUrl(d.thumbnail) }
  }
  return { kind: 'none' }
}

export function post(d: Raw, me?: string): Post {
  const removed = d.removed_by_category != null || (d.selftext === '[removed]' && d.author === '[deleted]')
  return {
    kind: 't3',
    id: d.id,
    name: d.name,
    title: decode(d.title),
    author: d.author ?? '[deleted]',
    authorId: d.author_fullname ?? undefined,
    authorFlair: flair(d.author_flair_text, d.author_flair_richtext, d.author_flair_background_color, d.author_flair_text_color),
    distinguished: d.distinguished ?? null,
    subreddit: d.subreddit,
    subredditId: d.subreddit_id,
    score: d.score ?? 0,
    upvoteRatio: d.upvote_ratio,
    numComments: d.num_comments ?? 0,
    created: (d.created_utc ?? 0) * 1000,
    edited: d.edited ? Number(d.edited) * 1000 : undefined,
    permalink: d.permalink,
    url: decode(d.url_overridden_by_dest ?? d.url),
    domain: d.domain,
    isSelf: Boolean(d.is_self),
    selftext: d.selftext ?? '',
    selftextHtml: d.selftext_html ?? undefined,
    thumbnail: goodUrl(d.thumbnail),
    media: media(d),
    flair: flair(d.link_flair_text, d.link_flair_richtext, d.link_flair_background_color, d.link_flair_text_color),
    nsfw: Boolean(d.over_18),
    spoiler: Boolean(d.spoiler),
    stickied: Boolean(d.stickied),
    pinned: Boolean(d.pinned),
    locked: Boolean(d.locked),
    archived: Boolean(d.archived),
    saved: Boolean(d.saved),
    hidden: Boolean(d.hidden),
    likes: likes(d.likes),
    awards: d.total_awards_received ?? 0,
    crosspost: d.crosspost_parent_list?.[0] ? post(d.crosspost_parent_list[0], me) : undefined,
    isOwn: me ? d.author?.toLowerCase() === me.toLowerCase() : false,
    removed,
    suggestedSort: d.suggested_sort ?? undefined,
    isGallery: Boolean(d.is_gallery),
    pollOptions: d.poll_data?.options?.map((o: Raw) => ({ text: o.text, votes: o.vote_count })),
    pollTotal: d.poll_data?.total_vote_count,
    mediaMetadata: mediaMetadata(d.media_metadata)
  }
}

/**
 * The comment Reddit hands back after you post or edit one (/api/comment, /api/editusertext). It's
 * usually a full comment, but Reddit can also answer in an older, shorter shape (id, parent, link,
 * contentText, contentHTML) with no author or body: drawing that one crashed the app on Android
 * (issue #10). Either way this returns a whole comment, filling in what's missing from what you sent.
 */
export function newComment(d: Raw, me: string, text: string, parent?: string): Comment {
  if (d.author && typeof d.body === 'string') return comment(d)
  const name = String(d.name ?? d.id ?? '')
  const id = name.replace(/^t1_/, '')
  const body = typeof d.body === 'string' ? d.body : typeof d.contentText === 'string' ? d.contentText : text
  const given = typeof d.body_html === 'string' ? d.body_html : typeof d.contentHTML === 'string' ? d.contentHTML : ''
  const html = /^\s*&lt;/.test(given) ? decode(given) : given
  return comment({
    ...d,
    id,
    name: `t1_${id}`,
    parent_id: d.parent_id ?? d.parent ?? parent,
    link_id: d.link_id ?? d.link,
    author: d.author || me,
    body,
    body_html: html || paragraphs(body),
    score: d.score ?? 1,
    likes: d.likes ?? true,
    created_utc: d.created_utc ?? Date.now() / 1000,
    replies: ''
  })
}

/** Plain text as simple HTML paragraphs (for a new comment Reddit didn't send the HTML of). */
function paragraphs(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div class="md">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')}</div>`
}

export function comment(d: Raw, depthBase = 0): Comment {
  const replies: Array<Comment | More> = []
  for (const c of d.replies?.data?.children ?? []) {
    if (c.kind === 't1') replies.push(comment(c.data))
    else if (c.kind === 'more') replies.push(more(c.data))
  }
  return {
    kind: 't1',
    id: d.id,
    name: d.name,
    parentId: d.parent_id,
    linkId: d.link_id,
    author: d.author,
    authorId: d.author_fullname ?? undefined,
    authorFlair: flair(d.author_flair_text, d.author_flair_richtext, d.author_flair_background_color, d.author_flair_text_color),
    isSubmitter: Boolean(d.is_submitter),
    distinguished: d.distinguished ?? null,
    body: d.body ?? '',
    bodyHtml: d.body_html ?? '',
    score: d.score ?? 0,
    scoreHidden: Boolean(d.score_hidden),
    created: (d.created_utc ?? 0) * 1000,
    edited: d.edited ? Number(d.edited) * 1000 : undefined,
    depth: (d.depth ?? 0) + depthBase,
    likes: likes(d.likes),
    saved: Boolean(d.saved),
    stickied: Boolean(d.stickied),
    locked: Boolean(d.locked),
    collapsedByReddit: Boolean(d.collapsed),
    controversial: (d.controversiality ?? 0) > 0,
    awards: d.total_awards_received ?? 0,
    replies,
    mediaMetadata: mediaMetadata(d.media_metadata),
    linkTitle: d.link_title ? decode(d.link_title) : undefined,
    linkPermalink: d.link_permalink,
    subreddit: d.subreddit,
    permalink: d.permalink ?? '',
    deleted: d.author === '[deleted]' && (d.body === '[deleted]' || d.body === '[removed]')
  }
}

export function more(d: Raw): More {
  return { kind: 'more', id: d.id, name: d.name, parentId: d.parent_id, depth: d.depth ?? 0, count: d.count ?? 0, children: d.children ?? [] }
}

export function subreddit(d: Raw): Subreddit {
  const icon = goodUrl(d.community_icon) ?? goodUrl(d.icon_img)
  return {
    name: d.display_name,
    displayName: d.display_name_prefixed ?? `r/${d.display_name}`,
    title: decode(d.title),
    icon: icon?.split('?')[0] === icon ? icon : icon,
    banner: goodUrl(d.banner_background_image) ?? goodUrl(d.mobile_banner_image) ?? goodUrl(d.banner_img),
    color: d.primary_color || d.key_color || undefined,
    subscribers: d.subscribers ?? 0,
    active: d.active_user_count ?? d.accounts_active ?? undefined,
    description: d.description ?? '',
    descriptionHtml: d.description_html ?? undefined,
    publicDescription: decode(d.public_description),
    nsfw: Boolean(d.over18),
    subscribed: Boolean(d.user_is_subscriber),
    created: (d.created_utc ?? 0) * 1000,
    type: d.subreddit_type ?? 'public',
    isUser: d.subreddit_type === 'user',
    submitText: d.submit_text ?? undefined,
    allowImages: d.allow_images,
    allowVideos: d.allow_videos,
    allowGalleries: d.allow_galleries,
    allowPolls: d.allow_polls,
    linkFlairEnabled: d.link_flair_enabled,
    wikiEnabled: d.wiki_enabled,
    userIsModerator: d.user_is_moderator
  }
}

export function user(d: Raw): User {
  return {
    name: d.name,
    id: d.id,
    icon: goodUrl(d.snoovatar_img) ?? goodUrl(d.icon_img)?.split('?')[0],
    banner: goodUrl(d.subreddit?.banner_img),
    linkKarma: d.link_karma ?? 0,
    commentKarma: d.comment_karma ?? 0,
    totalKarma: d.total_karma ?? (d.link_karma ?? 0) + (d.comment_karma ?? 0),
    created: (d.created_utc ?? 0) * 1000,
    isFriend: d.is_friend,
    isMod: d.is_mod,
    isGold: d.is_gold,
    verified: d.verified,
    description: d.subreddit?.public_description,
    title: d.subreddit?.title,
    isBlocked: d.is_blocked,
    acceptsFollowers: d.accept_followers,
    suspended: d.is_suspended
  }
}

export function message(kind: string, d: Raw): Message {
  return {
    kind: kind === 't1' ? 't1' : 't4',
    id: d.id,
    name: d.name,
    author: d.author ?? '',
    dest: d.dest ?? '',
    subject: decode(d.subject),
    body: d.body ?? '',
    bodyHtml: d.body_html ?? '',
    created: (d.created_utc ?? 0) * 1000,
    isNew: Boolean(d.new),
    type: d.type,
    context: d.context || undefined,
    linkTitle: d.link_title ? decode(d.link_title) : undefined,
    subreddit: d.subreddit ?? undefined,
    parentId: d.parent_id ?? undefined,
    firstMessageName: d.first_message_name ?? undefined,
    replies: d.replies?.data?.children?.map((c: Raw) => message(c.kind, c.data)),
    likes: likes(d.likes),
    score: d.score,
    distinguished: d.distinguished
  }
}

export function multi(d: Raw): Multi {
  return {
    name: d.name,
    displayName: d.display_name ?? d.name,
    path: d.path,
    owner: d.owner,
    subreddits: (d.subreddits ?? []).map((s: Raw) => s.name),
    icon: goodUrl(d.icon_url),
    color: d.key_color || undefined,
    description: d.description_md || undefined
  }
}

export function trophy(d: Raw): Trophy {
  return { name: d.name, icon: d.icon_70 ?? d.icon_40, description: d.description ?? undefined, url: d.url ?? undefined }
}
