import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseHtml, textOf } from '../src/ui/htmlParse'
import { comment, newComment, post } from '../src/lib/reddit/parse'
import { isCoolingDown, noteResult, resetRouteHealth, routesFor, routeUrl, setRouteOverrides } from '../src/lib/reddit/routes'

test('hot/new/rising go to oauth first, other sorts to www', () => {
  assert.deepEqual(routesFor('GET', '/r/pics/hot').routes.map((r) => r.host), ['oauth', 'www'])
  assert.deepEqual(routesFor('GET', '/hot').routes.map((r) => r.host), ['oauth', 'www'])
  assert.deepEqual(routesFor('GET', '/r/a+b/new').routes.map((r) => r.host), ['oauth', 'www'])
  assert.deepEqual(routesFor('GET', '/r/pics/top').routes.map((r) => r.host), ['www', 'oauth'])
  assert.deepEqual(routesFor('GET', '/user/x/m/y/hot').routes.map((r) => r.host), ['www', 'oauth'])
})

test('r/all and its filter forms use the r/all routes', () => {
  assert.equal(routesFor('GET', '/r/all/best').key, 'GET /r/all/*')
  assert.equal(routesFor('GET', '/r/all-pics-funny/hot').key, 'GET /r/all/*')
  assert.equal(routesFor('GET', '/r/allergies/hot').key, 'GET /r/*/hot')
})

test('api paths get .json (or /.json for www-dotjson)', () => {
  const { routes } = routesFor('GET', '/api/info')
  assert.equal(routeUrl(routes[0], '/api/info', 'id=t3_x'), 'https://oauth.reddit.com/api/info.json?id=t3_x')
  assert.equal(routeUrl(routes[1], '/api/info', ''), 'https://www.reddit.com/api/info/.json')
  assert.equal(routeUrl({ host: 'www' }, '/', 'limit=1'), 'https://www.reddit.com/.json?limit=1')
  assert.equal(routeUrl({ host: 'www' }, '/r/pics/top', ''), 'https://www.reddit.com/r/pics/top.json')
})

test('route overrides replace a built-in entry', () => {
  setRouteOverrides({ 'GET /r/*/hot': ['www', 'old'] })
  assert.deepEqual(routesFor('GET', '/r/pics/hot').routes.map((r) => r.host), ['www', 'old'])
  setRouteOverrides({})
})

test('three block pages in a row cool a route down', () => {
  resetRouteHealth()
  const route = { host: 'www' as const }
  noteResult('k', route, true, 0)
  noteResult('k', route, true, 0)
  assert.equal(isCoolingDown('k', route, 1), false)
  noteResult('k', route, true, 0)
  assert.equal(isCoolingDown('k', route, 1), true)
  assert.equal(isCoolingDown('k', route, 3600_001), false)
})

test('parses a gallery post and a video post', () => {
  const g = post({
    id: 'a',
    name: 't3_a',
    title: 'Pics &amp; more',
    author: 'me',
    subreddit: 'pics',
    is_gallery: true,
    gallery_data: { items: [{ media_id: 'x', caption: 'one' }, { media_id: 'y' }] },
    media_metadata: { x: { status: 'valid', s: { u: 'https://preview.redd.it/x.jpg?a=1&amp;b=2', x: 100, y: 50 }, p: [] }, y: { status: 'failed', id: 'y', m: 'image/png' } },
    url: 'https://www.reddit.com/gallery/a',
    created_utc: 1
  })
  assert.equal(g.title, 'Pics & more')
  assert.equal(g.media.kind, 'gallery')
  if (g.media.kind === 'gallery') {
    assert.equal(g.media.items.length, 2)
    assert.equal(g.media.items[0].url, 'https://preview.redd.it/x.jpg?a=1&b=2')
    assert.equal(g.media.items[0].caption, 'one')
    assert.equal(g.media.items[1].url, 'https://i.redd.it/y.png')
  }
  const v = post({ id: 'b', name: 't3_b', title: 't', author: 'u', subreddit: 's', is_video: true, domain: 'v.redd.it', url: 'https://v.redd.it/abc', secure_media: { reddit_video: { hls_url: 'https://v.redd.it/abc/HLSPlaylist.m3u8', fallback_url: 'https://v.redd.it/abc/DASH_720.mp4', width: 1280, height: 720, duration: 30 } } })
  assert.equal(v.media.kind, 'video')
  const y = post({ id: 'c', name: 't3_c', title: 't', author: 'u', subreddit: 's', url: 'https://youtu.be/dQw4w9WgXcQ?t=42', domain: 'youtu.be' })
  assert.deepEqual(y.media, { kind: 'youtube', id: 'dQw4w9WgXcQ', start: 42, poster: undefined })
  const l = post({ id: 'd', name: 't3_d', title: 't', author: 'u', subreddit: 's', url: 'https://example.com/a', domain: 'example.com', thumbnail: 'default' })
  assert.equal(l.media.kind, 'link')
})

test('parses a comment tree with a more node', () => {
  const c = comment({
    id: 'c1',
    name: 't1_c1',
    parent_id: 't3_a',
    author: 'x',
    body: 'hi',
    body_html: '<div class="md"><p>hi</p></div>',
    depth: 0,
    replies: { data: { children: [{ kind: 't1', data: { id: 'c2', name: 't1_c2', parent_id: 't1_c1', author: 'y', body: 'yo', depth: 1 } }, { kind: 'more', data: { id: 'm', name: 't1_m', parent_id: 't1_c1', count: 4, children: ['c3', 'c4'], depth: 1 } }] } }
  })
  assert.equal(c.replies.length, 2)
  assert.equal(c.replies[1].kind, 'more')
})

test('html parser handles Reddit markdown output', () => {
  const tree = parseHtml('<div class="md"><p>Hello <strong>world</strong> &amp; <a href="/r/pics">r/pics</a></p>\n\n<blockquote>\n<p>quote</p>\n</blockquote>\n\n<p><span class="md-spoiler-text">secret</span></p></div>')
  assert.equal(textOf(tree).replace(/\s+/g, ' ').trim(), 'Hello world & r/pics quote secret')
  const escaped = parseHtml('&lt;div class="md"&gt;&lt;p&gt;x&lt;/p&gt;&lt;/div&gt;')
  assert.equal(textOf(escaped), 'x')
})

test('a new comment in the full shape is read as is', () => {
  const c = newComment({ id: 'abc', name: 't1_abc', author: 'someone', body: 'hi', body_html: '<div class="md"><p>hi</p></div>', parent_id: 't3_p', link_id: 't3_p', score: 1, created_utc: 1, replies: '' }, 'me', 'hi')
  assert.equal(c.author, 'someone')
  assert.equal(c.body, 'hi')
  assert.equal(c.name, 't1_abc')
})

test('a new comment in the short shape gets an author and body (issue #10)', () => {
  const c = newComment({ id: 't1_abc', parent: 't1_par', link: 't3_p', contentText: 'Nice & tidy', contentHTML: '&lt;div class="md"&gt;&lt;p&gt;Nice &amp;amp; tidy&lt;/p&gt;&lt;/div&gt;', replies: '' }, 'me', 'Nice & tidy')
  assert.equal(c.author, 'me')
  assert.equal(c.body, 'Nice & tidy')
  assert.equal(c.name, 't1_abc')
  assert.equal(c.id, 'abc')
  assert.equal(c.parentId, 't1_par')
  assert.match(c.bodyHtml, /^<div class="md"><p>Nice/)
  assert.deepEqual(c.replies, [])
})

test('a new comment with nothing but an id falls back to what was sent', () => {
  const c = newComment({ id: 'abc' }, 'me', 'line one\n\n<b>two</b>', 't3_p')
  assert.equal(c.author, 'me')
  assert.equal(c.body, 'line one\n\n<b>two</b>')
  assert.equal(c.parentId, 't3_p')
  assert.equal(c.bodyHtml, '<div class="md"><p>line one</p><p>&lt;b&gt;two&lt;/b&gt;</p></div>')
})
