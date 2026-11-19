import assert from 'node:assert/strict'
import { test } from 'node:test'
import { switchTo, withActive, type WithProfiles } from '../src/lib/profiles'
import type { Settings } from '../src/lib/store'

const defaults = { theme: 'apollo', postSize: 'large', checkUpdates: true, routeUpdates: true, laterUntil: 0, filters: { keywords: [], subreddits: [], users: [], domains: [], flairs: [] } } as unknown as Settings

const data = (over: Partial<WithProfiles> = {}): WithProfiles => ({
  settings: { ...defaults },
  favorites: [],
  savedCategories: ['Read Later'],
  itemCategories: {},
  recentlyRead: [],
  recentlyVisited: [],
  searches: [],
  profiles: {},
  ...over
})

const apply = (d: WithProfiles, id: string): WithProfiles => ({ ...d, ...switchTo(d, id, defaults, { savedCategories: ['Read Later'] }) })

test('the first account adopts what you already have', () => {
  const d = data({ favorites: ['pics'], settings: { ...defaults, theme: 'mint' } })
  const a = apply(d, 'A')
  assert.equal(a.activeProfile, 'A')
  assert.deepEqual(a.favorites, ['pics'])
  assert.equal(a.settings.theme, 'mint')
})

test('each account keeps its own settings and lists', () => {
  let d = apply(data({ favorites: ['pics'], settings: { ...defaults, theme: 'mint' } }), 'A')
  // Switch to a new account: settings carry over as a start, lists start empty.
  d = apply(d, 'B')
  assert.equal(d.settings.theme, 'mint')
  assert.deepEqual(d.favorites, [])
  d = { ...d, settings: { ...d.settings, theme: 'grape' }, favorites: ['funny'] }
  // Back to A: A's things.
  d = apply(d, 'A')
  assert.equal(d.settings.theme, 'mint')
  assert.deepEqual(d.favorites, ['pics'])
  // And B kept its own.
  d = apply(d, 'B')
  assert.equal(d.settings.theme, 'grape')
  assert.deepEqual(d.favorites, ['funny'])
})

test('update settings stay the same on every account', () => {
  let d = apply(data(), 'A')
  d = apply(d, 'B')
  d = { ...d, settings: { ...d.settings, checkUpdates: false, theme: 'grape' } }
  d = apply(d, 'A')
  assert.equal(d.settings.checkUpdates, false)
  assert.equal(d.settings.theme, 'apollo')
})

test('saving writes the active profile back', () => {
  const d = apply(data(), 'A')
  const saved = withActive({ ...d, favorites: ['x'] })
  assert.deepEqual(saved.profiles.A.favorites, ['x'])
})
