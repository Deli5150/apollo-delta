import { create } from 'zustand'
import { desktop } from './storage'

// In-place translation of posts and comments (Settings → Translation picks the language). Results
// are kept for the session; tapping Translate again shows the original.

interface Translated {
  text: string
  from?: string
}

export const useTranslations = create<{ byName: Record<string, Translated | 'loading' | undefined>; shown: Record<string, boolean> }>(() => ({ byName: {}, shown: {} }))

async function translateText(text: string, target: string): Promise<Translated> {
  if (desktop) return desktop.web.translate(text, target)
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text.slice(0, 4800))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`translation failed (${res.status})`)
  const j = await res.json()
  return { text: (j[0] ?? []).map((p: [string]) => p[0]).join(''), from: j[2] }
}

/** Translates (or switches back to the original). */
export async function toggleTranslation(name: string, text: string, target: string): Promise<void> {
  const s = useTranslations.getState()
  if (s.byName[name] && s.byName[name] !== 'loading') {
    useTranslations.setState({ shown: { ...s.shown, [name]: !s.shown[name] } })
    return
  }
  useTranslations.setState({ byName: { ...s.byName, [name]: 'loading' } })
  try {
    const t = await translateText(text, target)
    useTranslations.setState((x) => ({ byName: { ...x.byName, [name]: t }, shown: { ...x.shown, [name]: true } }))
  } catch (e) {
    useTranslations.setState((x) => ({ byName: { ...x.byName, [name]: undefined } }))
    throw e
  }
}

export const LANGUAGES: Array<[string, string]> = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['sv', 'Swedish'],
  ['pl', 'Polish'],
  ['ru', 'Russian'],
  ['uk', 'Ukrainian'],
  ['tr', 'Turkish'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'],
  ['vi', 'Vietnamese'],
  ['id', 'Indonesian']
]
