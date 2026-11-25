import type { Comment, More, Post } from './reddit/types'

// What Summarize Comments asks the model, on phones (summarizer.ts, llama.rn) and the desktop
// (summarizer.web.ts, wllama in a hidden window): the same model, prompt and sampling everywhere.

/** An open-source model (Apache 2.0) from Qwen's own Hugging Face page, a one-time download. */
export const MODEL = {
  name: 'Qwen2.5 1.5B',
  url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  bytes: 1_117_320_736
}

/** Shown under a summary: where it was written. */
export const WRITTEN_ON = (device: 'phone' | 'computer') => `Written on your ${device} by ${MODEL.name}, from the top comments. It can get things wrong.`

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
    // No scores: a small model quotes them ("[412] agrees…") however it's told not to. The order says it.
    const line = `${reply ? '  ↳ ' : '- '}${text}`
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

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** The conversation that asks for a summary of `post`'s comments. */
export function summaryMessages(post: Post, nodes: Array<Comment | More>): ChatMessage[] {
  const body = clean(post.selftext ?? '').slice(0, 600)
  return [
    {
      role: 'system',
      content:
        'You summarize Reddit comment sections. Write 2 to 5 short bullet points, each starting with "• ", about what people are saying overall: group similar comments into one point, say whether most people agree, and include any useful information or notable disagreement. The comments are listed with the most upvoted first (replies under the comment they answer), so the first ones matter most; never describe comments one by one. Only use what the comments say. No introduction or conclusion.'
    },
    { role: 'user', content: `Post in r/${post.subreddit}: ${post.title}${body ? `\n${body}` : ''}\n\nComments:\n${commentsForSummary(nodes)}` }
  ]
}

/** Sampling: low temperature, and repetition penalties on (llama.cpp leaves them off, and a small model can then loop: issue #7). */
export const SAMPLING = { max_tokens: 320, temperature: 0.3, top_p: 0.9, penalty_repeat: 1.12, penalty_last_n: 96 }
