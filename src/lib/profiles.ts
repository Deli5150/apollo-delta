// Settings follow the Reddit account you're using: each account keeps its own settings, favorites,
// saved categories, recently read and searches ("device" when signed out). Switching account
// saves what you had into the old account's profile and loads the new one's. A few settings are
// about the app itself rather than you, so they stay the same on every account.

import type { Settings } from './store'

/** What each account keeps. */
export const PROFILE_KEYS = ['settings', 'favorites', 'savedCategories', 'itemCategories', 'recentlyRead', 'recentlyVisited', 'searches'] as const

/** Settings shared by every account: updates and how the app reaches Reddit. */
export const DEVICE_SETTINGS = ['checkUpdates', 'skippedVersion', 'laterVersion', 'laterUntil', 'routeUpdates'] as const satisfies ReadonlyArray<keyof Settings>

export const SIGNED_OUT = 'device'

type ProfileKey = (typeof PROFILE_KEYS)[number]

export interface ProfileData {
  settings: Settings
  favorites: string[]
  savedCategories: string[]
  itemCategories: Record<string, string>
  recentlyRead: unknown[]
  recentlyVisited: string[]
  searches: string[]
}

export interface WithProfiles extends ProfileData {
  profiles: Record<string, ProfileData>
  activeProfile?: string
}

export function snapshot(d: ProfileData): ProfileData {
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, d[k]])) as unknown as ProfileData
}

/** The active profile's latest values written back into `profiles` (before saving). */
export function withActive<T extends WithProfiles>(d: T): T {
  return d.activeProfile ? { ...d, profiles: { ...d.profiles, [d.activeProfile]: snapshot(d) } } : d
}

/**
 * The changes to make for switching to the profile `id`. The first time (no profile active yet,
 * as on the first launch with this feature) what you have becomes that account's. An account
 * seen for the first time starts with your current settings and empty lists.
 */
export function switchTo<T extends WithProfiles>(d: T, id: string, defaults: Settings, fresh: Pick<ProfileData, 'savedCategories'>): Partial<T> | null {
  if (d.activeProfile === id) return null
  if (!d.activeProfile) return { activeProfile: id } as Partial<T>
  const profiles = { ...d.profiles, [d.activeProfile]: snapshot(d) }
  const device = Object.fromEntries(DEVICE_SETTINGS.map((k) => [k, d.settings[k]]))
  const next = profiles[id]
  const loaded: ProfileData = next
    ? { ...next, settings: { ...defaults, ...next.settings, filters: { ...defaults.filters, ...next.settings?.filters } } }
    : { settings: { ...d.settings }, favorites: [], savedCategories: [...fresh.savedCategories], itemCategories: {}, recentlyRead: [], recentlyVisited: [], searches: [] }
  return { ...(loaded as Pick<T, ProfileKey>), settings: { ...loaded.settings, ...device }, profiles, activeProfile: id } as Partial<T>
}
