// Small on-device models can get stuck repeating themselves ("and and and and…", issue #7). The
// summarizer checks what it has written so far with `findLoop` and stops the model when it loops,
// keeping the text from before the loop started.

/** How many times in a row a piece of text has to repeat before it counts as a loop. */
const TIMES = 5

/**
 * If `text` ends in the same short piece (a word, a few words, a phrase up to 60 characters)
 * repeated at least five times in a row, returns the text from before that run, trimmed.
 */
export function findLoop(text: string): string | null {
  const tail = text.slice(-600)
  for (let len = 1; len <= 60; len++) {
    if (len * TIMES > tail.length) break
    const unit = tail.slice(-len)
    if (!/\S/.test(unit)) continue
    let n = 1
    while ((n + 1) * len <= tail.length && tail.slice(-(n + 1) * len, -n * len) === unit) n++
    // "...." or "----" are real punctuation runs, not a model loop: count only units with a letter or digit.
    if (n >= TIMES && /[\p{L}\p{N}]/u.test(unit)) {
      // The run's first copy may be missing its leading space ("and and and…" is "and" + " and" × n).
      let before = text.slice(0, text.length - n * len)
      const bare = unit.trim()
      while (bare && before.trimEnd().endsWith(bare)) before = before.trimEnd().slice(0, -bare.length)
      return clip(before)
    }
  }
  return null
}

/** The text before a loop: drop the half-written line or word the loop started in. */
function clip(before: string): string {
  const line = before.lastIndexOf('\n')
  const kept = line >= 0 ? before.slice(0, line) : before
  return kept.trim()
}
