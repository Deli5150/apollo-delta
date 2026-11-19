import { Platform } from 'react-native'

// Colour themes. `colors` is one shared object that every component reads while rendering;
// applyTheme() swaps its values and the app re-renders from the root (App.tsx keys it on the theme).
// Each theme has a light and a dark look; Settings → Appearance picks which (or follows the system).

export interface Palette {
  id: string
  name: string
  dark: boolean
  bg: string
  /** The sidebar and bars beside the content. */
  chrome: string
  card: string
  cardHi: string
  field: string
  border: string
  separator: string
  text: string
  dim: string
  faint: string
  accent: string
  accentHi: string
  onAccent: string
  accentSoft: string
  danger: string
  success: string
  upvote: string
  downvote: string
  mod: string
  admin: string
  nsfw: string
  spoiler: string
  /** Comments that are new since your last visit. */
  fresh: string
  /** Comment thread depth lines, cycling. */
  depth: string[]
}

export const hexA = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

interface ThemeDef {
  name: string
  accent: string
  accentHi?: string
  onAccent?: string
  /** Dark look: background, surface. */
  darkBg: string
  darkSurface: string
  /** Light look: background, surface. */
  lightBg?: string
  lightSurface?: string
  depth?: string[]
  hidden?: boolean
  /** Only has a dark look. */
  darkOnly?: boolean
}

const DEPTH = ['#3d8bff', '#34c759', '#ffcc00', '#ff9500', '#ff2d55', '#af52de', '#5ac8fa']

const DEFS: Record<string, ThemeDef> = {
  apollo: { name: 'Delta Blue', accent: '#4b6bff', accentHi: '#7d93ff', darkBg: '#0b0d14', darkSurface: '#171a24', lightBg: '#f2f3f7', lightSurface: '#ffffff' },
  sky: { name: 'Sky', accent: '#0a9cf5', accentHi: '#5cc0ff', darkBg: '#081018', darkSurface: '#142130', lightBg: '#eef5fb', lightSurface: '#ffffff' },
  mint: { name: 'Mint', accent: '#1fbf8f', accentHi: '#62dcb5', onAccent: '#04281d', darkBg: '#07110e', darkSurface: '#13211c', lightBg: '#eef6f3', lightSurface: '#ffffff' },
  sunset: { name: 'Sunset', accent: '#ff6b3d', accentHi: '#ff9a78', darkBg: '#120b09', darkSurface: '#231915', lightBg: '#fbf3ef', lightSurface: '#ffffff' },
  grape: { name: 'Grape', accent: '#9b5cff', accentHi: '#bb8fff', darkBg: '#0d0914', darkSurface: '#1c1628', lightBg: '#f4f0fb', lightSurface: '#ffffff' },
  rose: { name: 'Rosé', accent: '#ff4f8b', accentHi: '#ff8db3', darkBg: '#12080c', darkSurface: '#24151b', lightBg: '#fbf0f4', lightSurface: '#ffffff' },
  gold: { name: 'Gold Rush', accent: '#e9a514', accentHi: '#f5c75a', onAccent: '#261900', darkBg: '#0f0c05', darkSurface: '#211c10', lightBg: '#f8f4ea', lightSurface: '#ffffff' },
  slate: { name: 'Slate', accent: '#8a98ad', accentHi: '#b8c3d3', onAccent: '#0e1116', darkBg: '#0d0f12', darkSurface: '#1b1f25', lightBg: '#f1f2f4', lightSurface: '#ffffff' },
  crimson: { name: 'Crimson', accent: '#e5383b', accentHi: '#f2777a', darkBg: '#100809', darkSurface: '#221416', lightBg: '#faf0f0', lightSurface: '#ffffff' },
  forest: { name: 'Forest', accent: '#3aa655', accentHi: '#74cc8a', darkBg: '#080f0a', darkSurface: '#152019', lightBg: '#eff5f0', lightSurface: '#ffffff' },
  midnight: { name: 'Midnight', accent: '#5e7bff', accentHi: '#8fa2ff', darkBg: '#000000', darkSurface: '#0f1118', darkOnly: true },
  solarized: { name: 'Solarized', accent: '#268bd2', accentHi: '#6cb4e6', darkBg: '#002b36', darkSurface: '#073642', lightBg: '#fdf6e3', lightSurface: '#eee8d5', depth: ['#268bd2', '#2aa198', '#859900', '#b58900', '#cb4b16', '#d33682', '#6c71c4'] },
  // A hidden theme, unlocked by tapping the version in About seven times.
  nebula: { name: 'Nebula', accent: '#ff5cf0', accentHi: '#ff9cf6', darkBg: '#0a0618', darkSurface: '#1a1233', darkOnly: true, hidden: true, depth: ['#ff5cf0', '#7b5cff', '#5ce1ff', '#5cffa8', '#fff35c', '#ff9a5c', '#ff5c7a'] }
}

function build(id: string, def: ThemeDef, dark: boolean, pureBlack: boolean): Palette {
  const bg = dark ? (pureBlack ? '#000000' : def.darkBg) : (def.lightBg ?? '#f2f3f7')
  const surface = dark ? (pureBlack ? '#101114' : def.darkSurface) : (def.lightSurface ?? '#ffffff')
  return {
    id,
    name: def.name,
    dark,
    bg,
    chrome: dark ? (pureBlack ? '#000000' : def.darkBg) : bg,
    card: surface,
    cardHi: dark ? hexA(mix(surface, '#ffffff', 0.06), 1) : '#ffffff',
    field: dark ? mix(surface, '#ffffff', 0.05) : mix(bg, '#000000', 0.04),
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    separator: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)',
    text: dark ? '#f3f4f7' : '#111318',
    dim: dark ? '#9ba0ad' : '#5d6270',
    faint: dark ? '#636876' : '#9a9eaa',
    accent: def.accent,
    accentHi: dark ? (def.accentHi ?? def.accent) : def.accent,
    onAccent: def.onAccent ?? '#ffffff',
    accentSoft: hexA(def.accent, dark ? 0.2 : 0.13),
    danger: '#ff4d5e',
    success: '#34c759',
    upvote: '#ff6a2c',
    downvote: '#7c8cff',
    mod: '#2fbf4a',
    admin: '#ff4d5e',
    nsfw: '#ff3b5c',
    spoiler: dark ? '#8e93a0' : '#6b7080',
    fresh: hexA(def.accent, dark ? 0.12 : 0.08),
    depth: def.depth ?? DEPTH
  }
}

/** Mixes two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
}

export const THEMES = Object.entries(DEFS).map(([id, d]) => ({ id, name: d.name, accent: d.accent, hidden: Boolean(d.hidden), darkOnly: Boolean(d.darkOnly), darkBg: d.darkBg, lightBg: d.lightBg }))

export const DEFAULT_THEME = 'apollo'

export const colors: Palette = build(DEFAULT_THEME, DEFS[DEFAULT_THEME], true, false)

/** The key App.tsx re-renders on. */
export const themeKey = (id: string, dark: boolean, pureBlack: boolean) => `${id}-${dark || DEFS[id]?.darkOnly ? 'd' : 'l'}-${pureBlack ? 'b' : ''}`

export function applyTheme(id: string, dark: boolean, pureBlack: boolean): void {
  const def = DEFS[id] ?? DEFS[DEFAULT_THEME]
  Object.assign(colors, build(DEFS[id] ? id : DEFAULT_THEME, def, dark || Boolean(def.darkOnly), pureBlack))
}

export const radius = { card: 14, row: 12, pill: 999 }

export const font = {
  family: Platform.select({ web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, sans-serif', default: undefined }),
  mono: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', default: 'monospace' })
}

/** Text sizes scale with Settings → Text Size. */
const SCALE = { small: 0.92, medium: 1, large: 1.1, xlarge: 1.22 }
export const type = { scale: 1 }
export const setTextScale = (size: keyof typeof SCALE) => (type.scale = SCALE[size] ?? 1)
export const fs = (n: number) => Math.round(n * type.scale * 10) / 10

/** Widest the feed gets in a single-column layout. */
export const MAX_WIDTH = 860
