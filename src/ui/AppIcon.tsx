import { Asset } from 'expo-asset'
import { Image } from 'react-native'
import CATALOGUE from '../../assets/app-icons/icons.json'
import { APP_ICON_DOCK, APP_ICON_THUMBS } from './appIconImages'

// Apollo Delta's icons for Settings → App Icon: the robot in each colourway, in eight art styles,
// and the themed sets (accessories, holidays, pride flags, minimal), all original artwork.
// The pictures are drawn by the icon generator into assets/app-icons (thumbnails, the macOS dock
// icon, and Android's launcher icons, which plugins/withAppIcons.js puts in the app). Ids are kept
// from before (default, midnight, …, light, nebula), so a saved choice carries over.

export type IconGroup = 'Colours' | 'Art Styles' | 'Frosted' | 'Crystal' | 'Moods' | 'Remix' | 'Two-Tone' | 'Accessories' | 'Holidays' | 'Pride' | 'Minimal'
export interface IconInfo {
  id: string
  name: string
  group: IconGroup
}

/** Unlocked by Pixel Pal on the About page. */
export const SECRET_ICONS = new Set(['nebula'])

export const ICONS: IconInfo[] = CATALOGUE as IconInfo[]

/** Settings → App Icon: icons are grouped into packs (an IconGroup each), laid out in sections. */
export interface IconPack {
  id: IconGroup | 'Secret'
  name: string
  blurb: string
}
export const ICON_SECTIONS: Array<{ title: string; packs: IconPack[] }> = [
  {
    title: 'Glass Icon Packs',
    packs: [
      { id: 'Frosted', name: 'Frosted', blurb: 'A see-through robot over soft colour.' },
      { id: 'Crystal', name: 'Crystal', blurb: 'Clear glass glowing in the dark.' }
    ]
  },
  {
    title: 'Character Packs',
    packs: [
      { id: 'Moods', name: 'Moods', blurb: 'Sleepy, starstruck, grumpy and more.' },
      { id: 'Remix', name: 'Remix', blurb: 'Costumes and patterns.' },
      { id: 'Accessories', name: 'Dress-Up', blurb: 'Hats, shades, headphones and a helmet.' },
      { id: 'Holidays', name: 'Holidays', blurb: 'Seasonal scenes through the year.' }
    ]
  },
  {
    title: 'Standard Icon Packs',
    packs: [
      { id: 'Colours', name: 'Colors', blurb: 'The robot in every colourway.' },
      { id: 'Two-Tone', name: 'Two-Tone', blurb: 'A coloured robot on a pale ground.' },
      { id: 'Art Styles', name: 'Art Styles', blurb: 'Pixel art, oil paint, neon and more.' },
      { id: 'Minimal', name: 'Minimal', blurb: 'Flat and line-drawn.' },
      { id: 'Pride', name: 'Pride', blurb: 'The robot over each flag.' }
    ]
  }
]
/** The single icons across the top of the page. */
export const FEATURED_ICONS = ['default', 'frost-frost', 'min-glyph']

export const iconsInPack = (pack: IconPack['id']): IconInfo[] =>
  ICONS.filter((i) => (pack === 'Secret' ? SECRET_ICONS.has(i.id) : i.group === pack && !SECRET_ICONS.has(i.id)))
export const packOf = (id: string): IconPack['id'] | undefined => (SECRET_ICONS.has(id) ? 'Secret' : ICONS.find((i) => i.id === id)?.group)
export const SECRET_PACK: IconPack = { id: 'Secret', name: 'Sekrit', blurb: 'Unlocked by Pixel Pal.' }
export const packById = (id: string): IconPack | undefined => (id === 'Secret' ? SECRET_PACK : ICON_SECTIONS.flatMap((s) => s.packs).find((p) => p.id === id))

export function AppIcon({ id, size = 60 }: { id: string; size?: number }) {
  return <Image source={APP_ICON_THUMBS[id] ?? APP_ICON_THUMBS.default} style={{ width: size, height: size, borderRadius: size * 0.225 }} />
}

/** The dock icon for `id` as a PNG data URL (desktop). */
export async function dockIcon(id: string): Promise<string> {
  const asset = Asset.fromModule(APP_ICON_DOCK[id] ?? APP_ICON_DOCK.default)
  const blob = await (await fetch(asset.uri)).blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
