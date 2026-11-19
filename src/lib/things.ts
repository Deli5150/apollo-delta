import { create } from 'zustand'
import * as api from './reddit/api'
import type { Comment, Post, Vote } from './reddit/types'
import { useStore } from './store'

// What you've done to posts and comments since they loaded (votes, saves, hides), shared by every
// screen showing them, so a vote in the comments shows in the feed too. Applied optimistically and
// rolled back if Reddit refuses.

export interface Patch {
  likes?: Vote
  score?: number
  saved?: boolean
  hidden?: boolean
  deleted?: boolean
  body?: string
  bodyHtml?: string
}

export const useThings = create<{ patches: Record<string, Patch> }>(() => ({ patches: {} }))

const patch = (name: string, p: Patch) => useThings.setState((s) => ({ patches: { ...s.patches, [name]: { ...s.patches[name], ...p } } }))

export function usePatched<T extends Post | Comment>(thing: T): T {
  const p = useThings((s) => s.patches[thing.name])
  return p ? ({ ...thing, ...p } as T) : thing
}

export const patched = <T extends Post | Comment>(thing: T): T => {
  const p = useThings.getState().patches[thing.name]
  return p ? ({ ...thing, ...p } as T) : thing
}

export async function vote(thing: Post | Comment, dir: Vote): Promise<void> {
  const cur = patched(thing)
  const next: Vote = cur.likes === dir ? 0 : dir
  const score = cur.score - cur.likes + next
  patch(thing.name, { likes: next, score })
  try {
    await api.vote(thing.name, next)
  } catch (e) {
    patch(thing.name, { likes: cur.likes, score: cur.score })
    throw e
  }
}

export async function toggleSave(thing: Post | Comment, category?: string): Promise<boolean> {
  const cur = patched(thing)
  const on = category !== undefined ? true : !cur.saved
  patch(thing.name, { saved: on })
  try {
    if (on) await api.save(thing.name)
    else await api.unsave(thing.name)
    useStore.getState().update((d) => {
      const itemCategories = { ...d.itemCategories }
      if (on && category) itemCategories[thing.name] = category
      else if (!on) delete itemCategories[thing.name]
      return { itemCategories }
    })
    return on
  } catch (e) {
    patch(thing.name, { saved: cur.saved })
    throw e
  }
}

export async function toggleHide(p: Post): Promise<boolean> {
  const cur = patched(p)
  const on = !cur.hidden
  patch(p.name, { hidden: on })
  try {
    if (on) await api.hide(p.name)
    else await api.unhide(p.name)
    return on
  } catch (e) {
    patch(p.name, { hidden: cur.hidden })
    throw e
  }
}

export async function remove(thing: Post | Comment): Promise<void> {
  await api.del(thing.name)
  patch(thing.name, { deleted: true })
}

export function setEdited(name: string, body: string, bodyHtml: string): void {
  patch(name, { body, bodyHtml })
}
