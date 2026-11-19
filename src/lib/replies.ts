import { create } from 'zustand'
import type { Comment } from './reddit/types'

// Comments you've just posted, handed from the composer to the open thread so they show at once.

export const useNewReplies = create<{ byPost: Record<string, Array<{ parent: string; comment: Comment }>> }>(() => ({ byPost: {} }))

export function addReply(postId: string, parent: string, comment: Comment): void {
  useNewReplies.setState((s) => ({ byPost: { ...s.byPost, [postId]: [...(s.byPost[postId] ?? []), { parent, comment }] } }))
}
