import { create } from 'zustand'
import type { Comment, More, Post } from './reddit/types'
import { findLoop } from './repetition'
import { summaryMessages, type ChatMessage } from './summaryPrompt'

// Summarize Comments' state and its writing loop, the same on phones and the desktop. Each platform
// gives an Engine (summarizer.ts: llama.rn on the phone; summarizer.web.ts: wllama in a hidden
// window of the desktop app) and looks after its own copy of the model file.

export type ModelState = 'unknown' | 'missing' | 'downloading' | 'ready'

export interface Summary {
  text: string
  state: 'reading' | 'writing' | 'done' | 'error'
  error?: string
  /** Folded away to just its title (tap the title to show it again). */
  folded?: boolean
}

export const useSummaries = create<{ model: ModelState; progress: number; error?: string; byPost: Record<string, Summary> }>(() => ({ model: 'unknown', progress: 0, byPost: {} }))

export interface Engine {
  /** Writes a reply to `messages`, calling `onToken` with each piece. Resolves when it's done or stopped. */
  write(messages: ChatMessage[], onToken: (piece: string) => void): Promise<void>
  /** Stops the reply being written. */
  stop(): void
}

let current: Engine | null = null
let stopped = false

/** Stops the summary being written; what it wrote so far stays. */
export function stopSummary(): void {
  stopped = true
  current?.stop()
}

/** Folds a summary away to its title, or shows it again. */
export function toggleFolded(postName: string): void {
  useSummaries.setState((st) => {
    const s = st.byPost[postName]
    return s ? { byPost: { ...st.byPost, [postName]: { ...s, folded: !s.folded } } } : st
  })
}

/** Writes a summary of `post`'s comments with `engine`, shown as it's written (useSummaries().byPost[post.name]). */
export async function runSummary(post: Post, nodes: Array<Comment | More>, engine: () => Promise<Engine>): Promise<void> {
  const key = post.name
  const set = useSummaries.setState
  const put = (s: Summary) => set((st) => ({ byPost: { ...st.byPost, [key]: s } }))
  const drop = () => set((st) => ({ byPost: Object.fromEntries(Object.entries(st.byPost).filter(([k]) => k !== key)) }))
  put({ text: '', state: 'reading' })
  stopped = false
  try {
    const e = await engine()
    current = e
    // Stopped while the model was still loading.
    if (stopped) return drop()
    let text = ''
    let looped: string | null = null
    await e.write(summaryMessages(post, nodes), (piece) => {
      if (looped !== null) return
      text += piece
      // If it loops anyway, stop it and keep what it wrote before the loop (issue #7).
      looped = findLoop(text)
      if (looped !== null) e.stop()
      put({ text: looped ?? text, state: 'writing' })
    })
    const final = (looped ?? text).trim()
    if (!final && stopped) drop()
    else if (!final) put({ text: '', state: 'error', error: "the model didn't manage a summary of these comments" })
    else put({ text: final, state: 'done' })
  } catch (err) {
    if (stopped) drop()
    else put({ text: '', state: 'error', error: (err as Error).message || 'Something went wrong' })
  } finally {
    current = null
  }
}
