import Svg, { Circle, Defs, Ellipse, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

// Apollo Delta's icon (assets/src/icon.svg) in each alternate colourway, drawn live for
// Settings → App Icon. The desktop app turns the picked one into the dock icon (iconPng).

export interface IconStyle {
  id: string
  name: string
  bg: [string, string, string]
  body: [string, string]
  visor: string
  eyes: string
  ring: [string, string]
  orb: string
  pack: 'Standard' | 'Community' | 'Secret'
}

export const ICONS: IconStyle[] = [
  { id: 'default', name: 'Delta', bg: ['#5f86ff', '#4554f2', '#3a2bc4'], body: ['#ffffff', '#dfe5ff'], visor: '#1c2257', eyes: '#7fe3ff', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c', pack: 'Standard' },
  { id: 'midnight', name: 'Midnight', bg: ['#1b2040', '#11142b', '#07081a'], body: ['#ffffff', '#cfd6ff'], visor: '#0b0e24', eyes: '#8fa2ff', ring: ['#5366d6', '#8fa2ff'], orb: '#8fa2ff', pack: 'Standard' },
  { id: 'sunrise', name: 'Sunrise', bg: ['#ffb36b', '#ff6f5c', '#d9367a'], body: ['#ffffff', '#ffe6dc'], visor: '#40143a', eyes: '#ffd45c', ring: ['#ffd45c', '#fff2a8'], orb: '#fff2a8', pack: 'Standard' },
  { id: 'mint', name: 'Mint', bg: ['#4fe0b0', '#1fbf8f', '#0d7d63'], body: ['#ffffff', '#ddf7ee'], visor: '#0a3a30', eyes: '#a5ffe1', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c', pack: 'Standard' },
  { id: 'grape', name: 'Grape', bg: ['#b083ff', '#8a4fff', '#5a1fcf'], body: ['#ffffff', '#ebe0ff'], visor: '#2a0f5a', eyes: '#ff9cf6', ring: ['#ff5cf0', '#ff9cf6'], orb: '#ff9cf6', pack: 'Community' },
  { id: 'mono', name: 'Mono', bg: ['#3a3a40', '#232327', '#111113'], body: ['#f4f4f6', '#c9c9cf'], visor: '#111113', eyes: '#ffffff', ring: ['#8a8a92', '#c9c9cf'], orb: '#ffffff', pack: 'Community' },
  { id: 'light', name: 'Daylight', bg: ['#ffffff', '#eef1ff', '#dfe5ff'], body: ['#4b6bff', '#3a2bc4'], visor: '#ffffff', eyes: '#3a2bc4', ring: ['#e8b43a', '#ffd45c'], orb: '#ffd45c', pack: 'Community' },
  { id: 'nebula', name: 'Nebula', bg: ['#ff5cf0', '#7b5cff', '#1a1233'], body: ['#ffffff', '#ffe0fb'], visor: '#1a1233', eyes: '#5ce1ff', ring: ['#5cffa8', '#fff35c'], orb: '#5cffa8', pack: 'Secret' }
]

export function iconSvg(s: IconStyle): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.bg[0]}"/><stop offset="0.55" stop-color="${s.bg[1]}"/><stop offset="1" stop-color="${s.bg[2]}"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.body[0]}"/><stop offset="1" stop-color="${s.body[1]}"/></linearGradient></defs>
<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
<g transform="translate(100 100) scale(0.8047)">
<path d="M 168 742 A 360 92 -12 0 1 856 596" fill="none" stroke="${s.ring[0]}" stroke-width="30" stroke-linecap="round"/>
<line x1="512" y1="300" x2="512" y2="196" stroke="${s.body[0]}" stroke-width="30" stroke-linecap="round"/>
<circle cx="512" cy="172" r="40" fill="${s.orb}"/>
<path d="M 512 300 L 768 740 L 256 740 Z" fill="url(#body)" stroke="url(#body)" stroke-width="120" stroke-linejoin="round"/>
<path d="M 396 520 Q 512 470 628 520 Q 660 600 600 640 Q 512 668 424 640 Q 364 600 396 520 Z" fill="${s.visor}"/>
<ellipse cx="462" cy="572" rx="30" ry="38" fill="${s.eyes}"/><ellipse cx="562" cy="572" rx="30" ry="38" fill="${s.eyes}"/>
<circle cx="472" cy="558" r="10" fill="#ffffff"/><circle cx="572" cy="558" r="10" fill="#ffffff"/>
<path d="M 478 696 Q 512 722 546 696" fill="none" stroke="${s.visor}" stroke-width="16" stroke-linecap="round"/>
<ellipse cx="392" cy="690" rx="26" ry="15" fill="#ff9ab8" opacity="0.75"/><ellipse cx="632" cy="690" rx="26" ry="15" fill="#ff9ab8" opacity="0.75"/>
<path d="M 856 596 A 360 92 -12 0 1 168 742" fill="none" stroke="${s.ring[1]}" stroke-width="34" stroke-linecap="round"/>
</g></svg>`
}

/** The icon as a PNG data URL (desktop only: drawn on a canvas). */
export async function iconPng(s: IconStyle, size = 512): Promise<string> {
  const img = new window.Image()
  img.src = `data:image/svg+xml;base64,${btoa(iconSvg(s))}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.drawImage(img, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

export function AppIcon({ style: s, size = 60 }: { style: IconStyle; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="100 100 824 824">
      <Defs>
        <LinearGradient id={`bg-${s.id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={s.bg[0]} />
          <Stop offset="0.55" stopColor={s.bg[1]} />
          <Stop offset="1" stopColor={s.bg[2]} />
        </LinearGradient>
        <LinearGradient id={`body-${s.id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={s.body[0]} />
          <Stop offset="1" stopColor={s.body[1]} />
        </LinearGradient>
      </Defs>
      <Rect x="100" y="100" width="824" height="824" rx="185" fill={`url(#bg-${s.id})`} />
      <Path d="M 168 742 A 360 92 -12 0 1 856 596" fill="none" stroke={s.ring[0]} strokeWidth={30} strokeLinecap="round" />
      <Line x1="512" y1="300" x2="512" y2="196" stroke={s.body[0]} strokeWidth={30} strokeLinecap="round" />
      <Circle cx="512" cy="172" r="40" fill={s.orb} />
      <Path d="M 512 300 L 768 740 L 256 740 Z" fill={`url(#body-${s.id})`} stroke={`url(#body-${s.id})`} strokeWidth={120} strokeLinejoin="round" />
      <Path d="M 396 520 Q 512 470 628 520 Q 660 600 600 640 Q 512 668 424 640 Q 364 600 396 520 Z" fill={s.visor} />
      <Ellipse cx="462" cy="572" rx="30" ry="38" fill={s.eyes} />
      <Ellipse cx="562" cy="572" rx="30" ry="38" fill={s.eyes} />
      <Circle cx="472" cy="558" r="10" fill="#ffffff" />
      <Circle cx="572" cy="558" r="10" fill="#ffffff" />
      <Path d="M 478 696 Q 512 722 546 696" fill="none" stroke={s.visor} strokeWidth={16} strokeLinecap="round" />
      <Path d="M 856 596 A 360 92 -12 0 1 168 742" fill="none" stroke={s.ring[1]} strokeWidth={34} strokeLinecap="round" />
    </Svg>
  )
}
