import { createDownloadResumable, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync, moveAsync, type DownloadResumable } from 'expo-file-system/legacy'
import { initLlama, type LlamaContext } from 'llama.rn'
import type { Comment, More, Post } from './reddit/types'
import { MODEL, SAMPLING } from './summaryPrompt'
import { runSummary, useSummaries, type Engine } from './summaryStore'

// Summarize Comments (issue #5), on the phone: an open-source model (Qwen2.5 1.5B Instruct, Apache 2.0,
// from Qwen's own Hugging Face page) runs on the device with llama.cpp (llama.rn). Nothing is sent
// anywhere and there's no key or account; the model is a one-time download the first time you ask.
// The desktop's version is summarizer.web.ts; what they share is in summaryPrompt.ts and summaryStore.ts.

export { commentCount, commentsForSummary, MODEL } from './summaryPrompt'
export { stopSummary, toggleFolded, useSummaries } from './summaryStore'
export const WRITTEN_ON_DEVICE = 'phone' as const

export const summariesAvailable = true

const DIR = `${documentDirectory}models/`
const PATH = DIR + MODEL.file

const set = useSummaries.setState

export async function checkModel(): Promise<void> {
  if (useSummaries.getState().model === 'downloading') return
  const info = await getInfoAsync(PATH).catch(() => null)
  set({ model: info?.exists && info.size === MODEL.bytes ? 'ready' : 'missing' })
}

let download: DownloadResumable | null = null

export async function downloadModel(): Promise<void> {
  if (useSummaries.getState().model === 'downloading') return
  set({ model: 'downloading', progress: 0, error: undefined })
  try {
    await makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined)
    download = createDownloadResumable(MODEL.url, `${PATH}.part`, {}, ({ totalBytesWritten }) => set({ progress: totalBytesWritten / MODEL.bytes }))
    const res = await download.downloadAsync()
    download = null
    if (!res) return set({ model: 'missing' }) // cancelled
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    const info = await getInfoAsync(res.uri)
    if (!info.exists || info.size !== MODEL.bytes) throw new Error('the file came down incomplete')
    await deleteAsync(PATH, { idempotent: true })
    await moveAsync({ from: res.uri, to: PATH })
    set({ model: 'ready', progress: 1 })
  } catch (e) {
    download = null
    await deleteAsync(`${PATH}.part`, { idempotent: true }).catch(() => undefined)
    set({ model: 'missing', error: `Couldn't download the model: ${(e as Error).message}` })
  }
}

export async function cancelDownload(): Promise<void> {
  await download?.cancelAsync().catch(() => undefined)
  download = null
  await deleteAsync(`${PATH}.part`, { idempotent: true }).catch(() => undefined)
  set({ model: 'missing', progress: 0 })
}

/** Frees the space the model takes (Settings). */
export async function deleteModel(): Promise<void> {
  await release()
  await deleteAsync(PATH, { idempotent: true })
  set({ model: 'missing', progress: 0 })
}

// The model stays loaded for a while after a summary, so the next one starts at once.
let ctx: Promise<LlamaContext> | null = null
let idle: ReturnType<typeof setTimeout> | null = null
const IDLE_MS = 3 * 60_000

async function release(): Promise<void> {
  if (idle) clearTimeout(idle)
  const c = ctx
  ctx = null
  if (c) await (await c.catch(() => null))?.release().catch(() => undefined)
}

function context(): Promise<LlamaContext> {
  if (idle) clearTimeout(idle)
  ctx ??= initLlama({ model: PATH, n_ctx: 4096, n_threads: 4, use_mlock: false })
  ctx.catch(() => (ctx = null))
  return ctx
}


// llama.rn as the summaries' engine (summaryStore.ts runs the writing, Stop and the loop guard).
async function engine(): Promise<Engine> {
  const llama = await context()
  return {
    async write(messages, onToken) {
      try {
        await llama.completion(
          {
            messages,
            n_predict: SAMPLING.max_tokens,
            temperature: SAMPLING.temperature,
            top_p: SAMPLING.top_p,
            penalty_repeat: SAMPLING.penalty_repeat,
            penalty_last_n: SAMPLING.penalty_last_n,
            // DRY as well (llama.rn has it; the desktop's wllama doesn't).
            dry_multiplier: 0.8,
            dry_base: 1.75,
            dry_allowed_length: 2,
            dry_penalty_last_n: 256,
            dry_sequence_breakers: ['\n', ':', '"', '*', '•'],
            stop: ['<|im_end|>', '<|endoftext|>']
          },
          (data) => onToken(data.token)
        )
      } finally {
        if (idle) clearTimeout(idle)
        idle = setTimeout(() => void release(), IDLE_MS)
      }
    },
    stop: () => void llama.stopCompletion().catch(() => undefined)
  }
}

/** Writes a summary of `post`'s comments, shown as it's written (useSummaries().byPost[post.name]). */
export const summarize = (post: Post, nodes: Array<Comment | More>): Promise<void> => runSummary(post, nodes, engine)
