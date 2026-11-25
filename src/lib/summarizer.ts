import { createDownloadResumable, deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync, moveAsync, type DownloadResumable } from 'expo-file-system/legacy'
import { initLlama, type LlamaContext } from 'llama.rn'
import { create } from 'zustand'
import type { Comment, More, Post } from './reddit/types'
import { findLoop } from './repetition'

// Summarize Comments (issue #5), on the phone: an open-source model (Qwen2.5 1.5B Instruct, Apache 2.0,
// from Qwen's own Hugging Face page) runs on the device with llama.cpp (llama.rn). Nothing is sent
// anywhere and there's no key or account; the model is a one-time download the first time you ask.
// Desktop has its own file (summarizer.web.ts) without it for now.

export const MODEL = {
  name: 'Qwen2.5 1.5B',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  bytes: 1_117_320_736
}

export const summariesAvailable = true

const DIR = `${documentDirectory}models/`
const PATH = DIR + MODEL.file

type ModelState = 'unknown' | 'missing' | 'downloading' | 'ready'
interface Summary {
  text: string
  state: 'reading' | 'writing' | 'done' | 'error'
  error?: string
  /** Folded away to just its title (tap the title to show it again). */
  folded?: boolean
}

export const useSummaries = create<{ model: ModelState; progress: number; error?: string; byPost: Record<string, Summary> }>(() => ({ model: 'unknown', progress: 0, byPost: {} }))
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

const MAX_CHARS = 6500
const PER_COMMENT = 420

const clean = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/&gt;|&lt;|&amp;/g, ' ').replace(/\s+/g, ' ').trim()

/** The comments the model reads: the thread's top comments in its sort, with their best replies. */
export function commentsForSummary(nodes: Array<Comment | More>): string {
  const lines: string[] = []
  let used = 0
  const add = (c: Comment, reply: boolean): boolean => {
    if (c.stickied || c.author === 'AutoModerator' || /^\[(deleted|removed)\]$/.test(c.body)) return true
    const text = clean(c.body).slice(0, PER_COMMENT)
    const line = `${reply ? '  ↳ ' : '- '}[${c.score}] ${text}`
    if (used + line.length > MAX_CHARS) return false
    lines.push(line)
    used += line.length
    return true
  }
  for (const n of nodes) {
    if (n.kind !== 't1') continue
    if (!add(n, false)) break
    const replies = n.replies.filter((r): r is Comment => r.kind === 't1').slice(0, 2)
    for (const r of replies) if (!add(r, true)) break
  }
  return lines.join('\n')
}

export const commentCount = (nodes: Array<Comment | More>) => nodes.filter((n) => n.kind === 't1' && !n.stickied).length

// The model writing right now, so Stop can interrupt it.
let writing: LlamaContext | null = null
let stopped = false

/** Stops the summary being written; what it wrote so far stays. */
export function stopSummary(): void {
  stopped = true
  void writing?.stopCompletion().catch(() => undefined)
}

/** Folds a summary away to its title, or shows it again. */
export function toggleFolded(postName: string): void {
  set((st) => {
    const s = st.byPost[postName]
    return s ? { byPost: { ...st.byPost, [postName]: { ...s, folded: !s.folded } } } : st
  })
}

/** Writes a summary of `post`'s comments, shown as it's written (useSummaries().byPost[post.name]). */
export async function summarize(post: Post, nodes: Array<Comment | More>): Promise<void> {
  const key = post.name
  const put = (s: Summary) => set((st) => ({ byPost: { ...st.byPost, [key]: s } }))
  const drop = () => set((st) => ({ byPost: Object.fromEntries(Object.entries(st.byPost).filter(([k]) => k !== key)) }))
  put({ text: '', state: 'reading' })
  stopped = false
  try {
    const llama = await context()
    writing = llama
    // Stopped while the model was still loading.
    if (stopped) return drop()
    const body = clean(post.selftext ?? '').slice(0, 600)
    let text = ''
    let looped: string | null = null
    await llama.completion(
      {
        messages: [
          {
            role: 'system',
            content:
              'You summarize Reddit comment sections. Write 2 to 5 short bullet points, each starting with "• ", about what people are saying overall: group similar comments into one point, say whether most people agree, and include any useful information or notable disagreement. Upvotes are in brackets and show how many people agree; use them to judge what matters, but never quote the numbers, and never describe comments one by one. Only use what the comments say. No introduction or conclusion.'
          },
          { role: 'user', content: `Post in r/${post.subreddit}: ${post.title}${body ? `\n${body}` : ''}\n\nComments:\n${commentsForSummary(nodes)}` }
        ],
        n_predict: 320,
        temperature: 0.3,
        top_p: 0.9,
        // llama.rn leaves repetition penalties off by default, and a small model at a low
        // temperature can then get stuck saying one word forever (issue #7).
        penalty_repeat: 1.12,
        penalty_last_n: 96,
        dry_multiplier: 0.8,
        dry_base: 1.75,
        dry_allowed_length: 2,
        dry_penalty_last_n: 256,
        dry_sequence_breakers: ['\n', ':', '"', '*', '•'],
        stop: ['<|im_end|>', '<|endoftext|>']
      },
      (data) => {
        if (looped !== null) return
        text += data.token
        // If it loops anyway, stop it and keep what it wrote before the loop.
        looped = findLoop(text)
        if (looped !== null) void llama.stopCompletion().catch(() => undefined)
        put({ text: looped ?? text, state: 'writing' })
      }
    )
    const final = (looped ?? text).trim()
    if (!final && stopped) drop()
    else if (!final) put({ text: '', state: 'error', error: "the model didn't manage a summary of these comments" })
    else put({ text: final, state: 'done' })
  } catch (e) {
    put({ text: '', state: 'error', error: (e as Error).message || 'Something went wrong' })
  } finally {
    writing = null
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => void release(), IDLE_MS)
  }
}
