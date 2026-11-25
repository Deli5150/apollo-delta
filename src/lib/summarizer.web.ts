import { create } from 'zustand'
import type { Comment, More, Post } from './reddit/types'

// Desktop: Summarize Comments is phone-only for now (see summarizer.ts).

export const MODEL = { name: 'Qwen2.5 1.5B', url: '', file: '', bytes: 0 }
export const summariesAvailable = false
interface Summary {
  text: string
  state: 'reading' | 'writing' | 'done' | 'error'
  error?: string
  folded?: boolean
}
export const useSummaries = create<{ model: 'unknown' | 'missing' | 'downloading' | 'ready'; progress: number; error?: string; byPost: Record<string, Summary> }>(() => ({ model: 'missing', progress: 0, byPost: {} }))
export const checkModel = async (): Promise<void> => undefined
export const downloadModel = async (): Promise<void> => undefined
export const cancelDownload = async (): Promise<void> => undefined
export const deleteModel = async (): Promise<void> => undefined
export const commentsForSummary = (_nodes: Array<Comment | More>): string => ''
export const commentCount = (nodes: Array<Comment | More>) => nodes.length
export const summarize = async (_post: Post, _nodes: Array<Comment | More>): Promise<void> => undefined
export const stopSummary = (): void => undefined
export const toggleFolded = (_postName: string): void => undefined
