import { expect, test } from 'claude-code/testing'

import { annotate, findTokens, pickRefs } from './paths'

const reply = [
  'Changed `mods/better-files/views/viewer.js:188` and docs/decisions.md.',
  'See https://github.com/x/y/README.md and ~/notes/todo.md, also viewer.js.',
  '```',
  'cat docs/decisions.md',
  '```',
].join('\n')

test('finds paths, not URLs, and keeps the :line on the token only', () => {
  const found = findTokens(reply)
  expect(found.map(f => f.token)).toEqual([
    'mods/better-files/views/viewer.js:188',
    'docs/decisions.md',
    '~/notes/todo.md',
    'viewer.js',
    'docs/decisions.md',
  ])
  expect(found[0]?.path).toBe('mods/better-files/views/viewer.js')
})

test('numbers files by first mention and labels each mention outside code', () => {
  const resolved = new Map([
    ['mods/better-files/views/viewer.js', '/w/mods/better-files/views/viewer.js'],
    ['docs/decisions.md', '/w/docs/decisions.md'],
  ])
  const refs = pickRefs(findTokens(reply), resolved)
  expect(refs.map(r => [r.path, r.label])).toEqual([
    ['/w/mods/better-files/views/viewer.js', 'viewer.js'],
    ['/w/docs/decisions.md', 'decisions.md'],
  ])
  const shown = annotate(reply, refs)
  expect(shown).toContain('`mods/better-files/views/viewer.js:188` [1]')
  expect(shown).toContain('docs/decisions.md [2].')
  expect(shown).toContain('cat docs/decisions.md\n')
  expect(shown).not.toContain('todo.md [')
})

test('two files with one name are told apart, and nine at most', () => {
  const text = Array.from({ length: 11 }, (_, i) => `d${i}/a.md`).join(' ')
  const resolved = new Map(Array.from({ length: 11 }, (_, i) => [`d${i}/a.md`, `/w/d${i}/a.md`] as [string, string]))
  const refs = pickRefs(findTokens(text), resolved)
  expect(refs.length).toBe(9)
  expect(refs[0]?.label).toBe('d0/a.md')
})
