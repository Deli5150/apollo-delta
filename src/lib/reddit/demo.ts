import { Platform } from 'react-native'
import * as Linking from 'expo-linking'
import type { AccountInfo, RedditRequest, RedditResponse } from '../storage'

// Demo mode: a made-up Reddit with sample posts, comments and messages (all written for Apollo
// Delta, with pictures drawn for it, hosted on the project's site), for screenshots and trying the
// app without an account. Nothing is sent to Reddit and nothing is saved. Turn it on with
// `?demo=1` on desktop (DELTA_DEMO=1 when launching Electron) or the link apollodelta://demo.

let on = false
export const isDemo = (): boolean => on

/** Checks the launch for the demo switch. Call before loading accounts. */
export async function initDemo(): Promise<void> {
  if (Platform.OS === 'web') on = typeof location !== 'undefined' && /[?&]demo=1\b/.test(location.search)
  else on = /:\/\/demo\b/.test((await Linking.getInitialURL().catch(() => null)) ?? '')
}

const IMG = 'https://deli5150.github.io/apollo-delta/demo'
const NOW = Math.floor(Date.now() / 1000)
const ago = (minutes: number) => NOW - minutes * 60
const ME = 'delta_demo'

const account: AccountInfo = { id: 'demo', username: ME, icon: 'https://deli5150.github.io/apollo-delta/icon.png', hasModhash: true }

type Raw = Record<string, any>
const listing = (children: Raw[], after: string | null = null) => ({ kind: 'Listing', data: { children, after, before: null } })
const html = (text: string) => `<div class="md">${text.split('\n\n').map((p) => `<p>${p}</p>`).join('')}</div>`

const picture = (file: string, w: number, h: number): Raw => ({
  post_hint: 'image',
  domain: 'i.redd.it',
  url: `${IMG}/${file}`,
  preview: { images: [{ source: { url: `${IMG}/${file}`, width: w, height: h }, resolutions: [] }] }
})
const gallery = (files: Array<[string, number, number]>): Raw => ({
  is_gallery: true,
  domain: 'reddit.com',
  url: 'https://www.reddit.com/gallery/demo',
  gallery_data: { items: files.map(([f], i) => ({ media_id: `m${i}`, id: i })) },
  media_metadata: Object.fromEntries(files.map(([f, w, h], i) => [`m${i}`, { status: 'valid', e: 'Image', m: 'image/jpg', s: { u: `${IMG}/${f}`, x: w, y: h }, p: [] }]))
})

interface Seed {
  id: string
  sr: string
  title: string
  author: string
  minutes: number
  score: number
  comments: number
  flair?: [string, string]
  text?: string
  media?: Raw
  link?: string
}

const SEEDS: Seed[] = [
  { id: 'd1', sr: 'DeltaScenery', title: 'Caught the last light over the ridgelines tonight', author: 'quiet_orbit_demo', minutes: 42, score: 4821, comments: 6, flair: ['Sunset', '#c76b8f'], media: picture('mountains.jpg', 1600, 1000) },
  { id: 'd2', sr: 'NightCities', title: 'Every window on the block was lit up after the storm passed', author: 'neon_tram_demo', minutes: 95, score: 2210, comments: 4, flair: ['Skyline', '#3a2a6b'], media: picture('city.jpg', 1600, 1000) },
  { id: 'd3', sr: 'DeltaScenery', title: 'Four days in the dunes: a few favourites from the trip', author: 'sandglass_demo', minutes: 180, score: 1675, comments: 3, flair: ['Gallery', '#cc7f3d'], media: gallery([['dunes.jpg', 1600, 1000], ['ocean.jpg', 1600, 1000], ['forest.jpg', 1600, 1000]]) },
  { id: 'd4', sr: 'ApolloDelta', title: 'Tip: pinch the grid in Gallery View to change how many columns you see', author: 'delta_tips_demo', minutes: 240, score: 932, comments: 2, flair: ['Tips', '#4b6bff'], text: 'Pinch apart for bigger tiles, pinch together for more of them. On desktop, the + and − buttons do the same.\n\nDouble-tap a picture to zoom in on that spot, and tap beside it to close the viewer.' },
  { id: 'd5', sr: 'AuroraWatch', title: 'The sky turned green for about twenty minutes around midnight', author: 'polar_kite_demo', minutes: 300, score: 3390, comments: 2, flair: ['Northern lights', '#1fbf8f'], media: picture('aurora.jpg', 1000, 1500) },
  { id: 'd6', sr: 'CozyCoding', title: 'What is the one keyboard shortcut you could not live without?', author: 'tab_and_tea_demo', minutes: 360, score: 488, comments: 2, flair: ['Discussion', '#8a4fff'], text: 'Mine is jumping back to the last place I edited. Curious what everyone else leans on all day.' },
  { id: 'd7', sr: 'DeltaScenery', title: 'Morning fog rolling through the pines', author: 'mossy_path_demo', minutes: 420, score: 2044, comments: 1, flair: ['Forest', '#45695f'], media: picture('forest.jpg', 1600, 1000) },
  { id: 'd8', sr: 'SlowTravel', title: 'Watched the sun sink into the sea from the ferry deck', author: 'harbor_light_demo', minutes: 520, score: 1502, comments: 1, media: picture('ocean.jpg', 1600, 1000) }
]

function postRaw(s: Seed): Raw {
  return {
    id: s.id,
    name: `t3_${s.id}`,
    title: s.title,
    author: s.author,
    author_fullname: `t2_${s.author}`,
    subreddit: s.sr,
    subreddit_id: `t5_${s.sr}`,
    score: s.score,
    upvote_ratio: 0.97,
    num_comments: s.comments,
    created_utc: ago(s.minutes),
    permalink: `/r/${s.sr}/comments/${s.id}/demo/`,
    is_self: Boolean(s.text),
    selftext: s.text ?? '',
    selftext_html: s.text ? html(s.text) : null,
    link_flair_text: s.flair?.[0],
    link_flair_background_color: s.flair?.[1],
    link_flair_text_color: 'light',
    domain: s.text ? `self.${s.sr}` : 'i.redd.it',
    url: s.text ? `https://www.reddit.com/r/${s.sr}/comments/${s.id}/demo/` : undefined,
    ...(s.media ?? {})
  }
}

const COMMENTS: Record<string, Array<[string, string, number, Array<[string, string, number]>?]>> = {
  d1: [
    ['ridge_runner_demo', 'Those layers fading into the distance are unreal. How long did you wait for the sun to sit right on the ridge?', 412, [['quiet_orbit_demo', 'About forty minutes, and it dropped behind the peak right after this one.', 188], ['lumen_sample_demo', 'Worth every minute.', 64]]],
    ['amber_hour_demo', 'This is going straight to my wallpaper folder.', 296, [['quiet_orbit_demo', 'Glad you like it!', 41]]],
    ['trail_notes_demo', 'The purple in the far ridges is my favourite part.', 120]
  ],
  d2: [
    ['night_owl_demo', 'Love how the windows make their own constellation.', 233, [['neon_tram_demo', 'That was the idea!', 70]]],
    ['metro_map_demo', 'Which side of town is this?', 58]
  ],
  d3: [['dune_hopper_demo', 'The second one feels like a different planet.', 140], ['sandglass_demo', 'It was even windier than it looks.', 52]],
  d4: [['grid_fan_demo', 'Six columns is perfect for scrolling through r/DeltaScenery.', 77], ['delta_tips_demo', 'And it remembers the size you picked next time.', 39]],
  d5: [['polar_kite_demo', 'Took this from the frozen lake, it was silent apart from the ice cracking.', 301], ['starfield_demo', 'Adding this to my bucket list.', 120]],
  d6: [['tab_and_tea_demo', 'Undo close tab, every single day.', 64], ['vim_curious_demo', 'Multi-cursor editing changed my life.', 51]],
  d7: [['mossy_path_demo', 'Shot at 6 a.m., the fog was gone by seven.', 88]],
  d8: [['harbor_light_demo', 'The ferry crew said it was the calmest crossing all month.', 45]]
}

function commentsFor(id: string): Raw[] {
  const seed = SEEDS.find((s) => s.id === id)!
  let n = 0
  const make = (author: string, body: string, score: number, depth: number, parent: string, replies: Raw[] = []): Raw => {
    const cid = `${id}c${n++}`
    return {
      kind: 't1',
      data: { id: cid, name: `t1_${cid}`, parent_id: parent, link_id: `t3_${id}`, author, body, body_html: html(body), score, created_utc: ago(seed.minutes - 5 - n * 3), depth, is_submitter: author === seed.author, replies: replies.length ? listing(replies) : '', subreddit: seed.sr, permalink: `/r/${seed.sr}/comments/${id}/demo/${cid}/` }
    }
  }
  return (COMMENTS[id] ?? []).map(([author, body, score, replies]) => {
    const top = make(author, body, score, 0, `t3_${id}`)
    top.data.replies = replies?.length ? listing(replies.map(([a, b, s]) => make(a, b, s, 1, top.data.name))) : ''
    return top
  })
}

const SUBS: Array<[string, string, number, string]> = [
  ['ApolloDelta', 'Apollo Delta', 12400, '#4b6bff'],
  ['AuroraWatch', 'Aurora Watch', 88200, '#1fbf8f'],
  ['CozyCoding', 'Cozy Coding', 45100, '#8a4fff'],
  ['DeltaScenery', 'Delta Scenery', 1204000, '#c76b8f'],
  ['NightCities', 'Night Cities', 318000, '#3a2a6b'],
  ['SlowTravel', 'Slow Travel', 97300, '#2f6fa3']
]
const subRaw = ([name, title, subs, color]: (typeof SUBS)[number]): Raw => ({
  kind: 't5',
  data: { display_name: name, display_name_prefixed: `r/${name}`, title, subscribers: subs, primary_color: color, key_color: color, public_description: `${title}: a sample community in Apollo Delta's demo.`, description: `Welcome to r/${name}, a sample community for trying Apollo Delta.`, description_html: html(`Welcome to r/${name}, a sample community for trying Apollo Delta.`), user_is_subscriber: true, banner_background_image: `${IMG}/mountains.jpg`, created_utc: ago(60 * 24 * 900), name: `t5_${name}`, accounts_active: Math.round(subs / 400) }
})

const MESSAGES: Raw[] = [
  { kind: 't1', data: { name: 't1_m1', author: 'ridge_runner_demo', subject: 'comment reply', body: 'Thanks for the tip about Gallery View, pinching the grid is great.', body_html: html('Thanks for the tip about Gallery View, pinching the grid is great.'), created_utc: ago(30), new: true, was_comment: true, link_title: 'Tip: pinch the grid in Gallery View to change how many columns you see', subreddit: 'ApolloDelta', context: '/r/ApolloDelta/comments/d4/demo/' } },
  { kind: 't4', data: { name: 't4_m2', author: 'quiet_orbit_demo', dest: ME, subject: 'Wallpaper', body: 'Happy for you to use the ridgeline photo as a wallpaper!', body_html: html('Happy for you to use the ridgeline photo as a wallpaper!'), created_utc: ago(200), new: false } }
]

const ME_RAW = { name: ME, id: 'demo', icon_img: account.icon, link_karma: 15230, comment_karma: 8412, total_karma: 23642, created_utc: ago(60 * 24 * 1200), inbox_count: 1, has_mail: true, modhash: 'demo' }

function feed(sr?: string): Raw {
  const all = SEEDS.filter((s) => !sr || s.sr.toLowerCase() === sr.toLowerCase() || /^(all|popular)$/i.test(sr))
  return listing(all.map((s) => ({ kind: 't3', data: postRaw(s) })))
}

function answer(url: string): unknown {
  const u = new URL(url)
  const p = u.pathname.replace(/\.json$/, '').replace(/\/$/, '')
  let m: RegExpMatchArray | null
  if ((m = p.match(/\/comments\/(\w+)/))) {
    const s = SEEDS.find((x) => x.id === m![1])
    return s ? [listing([{ kind: 't3', data: postRaw(s) }]), listing(commentsFor(s.id))] : [listing([]), listing([])]
  }
  if (p === '/api/me') return { kind: 't2', data: ME_RAW }
  if ((m = p.match(/^\/r\/([\w+]+)\/about$/))) return subRaw(SUBS.find((x) => x[0].toLowerCase() === m![1].toLowerCase()) ?? [m[1], m[1], 1000, '#4b6bff'])
  if (/^\/r\/[\w+]+\/about\/(rules|moderators)$/.test(p)) return { rules: [], data: { children: [] } }
  if ((m = p.match(/^\/r\/([\w+]+)(?:\/(hot|new|top|rising|controversial|best))?$/))) return feed(m[1])
  if (p === '' || /^\/(hot|new|top|rising|best|controversial)$/.test(p)) return feed()
  if (p === '/subreddits/mine/subscriber' || /^\/subreddits\/(popular|new|search)$/.test(p)) return listing(SUBS.map(subRaw))
  if (p === '/api/multi/mine') return []
  if ((m = p.match(/^\/message\/(\w+)/))) return listing(m[1] === 'unread' ? MESSAGES.filter((x) => x.data.new) : m[1] === 'sent' ? [] : MESSAGES)
  if ((m = p.match(/^\/user\/([\w-]+)\/about$/))) return { kind: 't2', data: m[1] === ME ? ME_RAW : { name: m[1], link_karma: 4200, comment_karma: 1800, total_karma: 6000, created_utc: ago(60 * 24 * 700) } }
  if (/^\/user\/[\w-]+\/trophies$/.test(p)) return { kind: 'TrophyList', data: { trophies: [] } }
  if ((m = p.match(/^\/user\/([\w-]+)\/(\w+)$/))) return listing(m[2] === 'saved' || m[1] !== ME ? SEEDS.slice(0, 3).map((s) => ({ kind: 't3', data: postRaw(s) })) : [])
  if (p === '/api/user_data_by_account_ids') return {}
  if (p === '/search') {
    const q = (u.searchParams.get('q') ?? '').toLowerCase()
    return listing(SEEDS.filter((s) => s.title.toLowerCase().includes(q) || s.sr.toLowerCase().includes(q)).map((s) => ({ kind: 't3', data: postRaw(s) })))
  }
  if (p === '/users/search') return listing([])
  // Writes (votes, saves, …) just succeed.
  return { json: { errors: [], data: {} } }
}

export const demoTransport = {
  async accounts() {
    return [account]
  },
  async signIn() {
    return account
  },
  async signOut() {},
  async refresh() {
    return { ...account, hasModhash: true, me: ME_RAW }
  },
  async reorder() {},
  async request(_id: string | null, req: RedditRequest): Promise<RedditResponse> {
    await new Promise((r) => setTimeout(r, 120))
    return { status: 200, url: req.url, json: answer(req.url) } as RedditResponse
  },
  async upload() {
    return { error: 'Uploads are off in the demo.' }
  }
}
