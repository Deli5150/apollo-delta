import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findLoop } from '../src/lib/repetition'

test('a word repeated over and over is a loop (issue #7)', () => {
  const good = '• Most people agree the update fixed the battery drain.\n• A few say'
  assert.equal(findLoop(`${good} and and and and and and and`), '• Most people agree the update fixed the battery drain.')
})

test('a repeated phrase is a loop', () => {
  assert.equal(findLoop(`• One point.\n• Two ${'people say that '.repeat(6)}`), '• One point.')
})

test('a loop on the first line leaves nothing', () => {
  assert.equal(findLoop('and and and and and and'), '')
})

test('normal summaries are not loops', () => {
  assert.equal(findLoop('• Most agree it is good.\n• Some say it is bad.\n• Others say it is fine.'), null)
  assert.equal(findLoop('• Wait for it....'), null)
  assert.equal(findLoop('• It is very very good'), null)
})
