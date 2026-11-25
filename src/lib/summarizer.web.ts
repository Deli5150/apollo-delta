import type { Comment, More, Post } from './reddit/types'
import { desktop } from './storage'
import { MODEL, SAMPLING } from './summaryPrompt'
import { runSummary, useSummaries, type Engine } from './summaryStore'

// Summarize Comments on the desktop: the same model as the phones, run by the desktop app in a
// hidden window (desktop/ai.cjs). The writing, Stop, folding and the loop guard are shared
// (summaryStore.ts). In a plain browser there's no desktop app, so no summaries.

export { commentCount, commentsForSummary, MODEL } from './summaryPrompt'
export { stopSummary, toggleFolded, useSummaries } from './summaryStore'
export const WRITTEN_ON_DEVICE = 'computer' as const

const ai = desktop?.ai
export const summariesAvailable = Boolean(ai)
const set = useSummaries.setState

export async function checkModel(): Promise<void> {
  if (!ai || useSummaries.getState().model === 'downloading') return
  set({ model: await ai.model(MODEL.file, MODEL.bytes).catch(() => 'missing' as const) })
}

export async function downloadModel(): Promise<void> {
  if (!ai || useSummaries.getState().model === 'downloading') return
  set({ model: 'downloading', progress: 0, error: undefined })
  const off = ai.onProgress((progress) => set({ progress }))
  try {
    const done = await ai.download({ url: MODEL.url, file: MODEL.file, bytes: MODEL.bytes })
    set(done ? { model: 'ready', progress: 1 } : { model: 'missing', progress: 0 })
  } catch (e) {
    set({ model: 'missing', error: `Couldn't download the model: ${(e as Error).message}` })
  } finally {
    off()
  }
}

export async function cancelDownload(): Promise<void> {
  await ai?.cancelDownload()
  set({ model: 'missing', progress: 0 })
}

/** Frees the space the model takes (Settings). */
export async function deleteModel(): Promise<void> {
  await ai?.deleteModel(MODEL.file)
  set({ model: 'missing', progress: 0 })
}

let counter = 0

async function engine(): Promise<Engine> {
  if (!ai) throw new Error('Summaries need the desktop app')
  const id = `s${Date.now().toString(36)}${++counter}`
  return {
    async write(messages, onToken) {
      const off = ai.onToken((rid, piece) => rid === id && onToken(piece))
      try {
        await ai.summarize(id, MODEL.file, messages, SAMPLING)
      } finally {
        off()
      }
    },
    stop: () => ai.stop(id)
  }
}

/** Writes a summary of `post`'s comments, shown as it's written (useSummaries().byPost[post.name]). */
export const summarize = (post: Post, nodes: Array<Comment | More>): Promise<void> => runSummary(post, nodes, engine)
