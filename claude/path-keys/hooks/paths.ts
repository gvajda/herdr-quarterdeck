import type { PathRef } from '../types'

// A path as replies write them: ~/, ./, ../ or / first or not, folders, then a name with a
// letter extension, and maybe :line or :line:col. A bare "name.ext" counts too; what isn't a
// file is dropped later, when the shell looks.
const TOKEN = /(?:~\/|\.{1,2}\/|\/)?(?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*\.[A-Za-z][A-Za-z0-9]*(?::\d+(?::\d+)?)?/g
const URL = /[a-z][a-z0-9+.-]*:\/\/\S+/gi
const LINE = /(?::\d+){1,2}$/

// Each token in the text, in order, with the path it names (no :line).
export function findTokens(text: string): { token: string; path: string }[] {
  const urls = [...text.matchAll(URL)].map(m => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const)
  const inUrl = (at: number) => urls.some(([a, b]) => at >= a && at < b)
  const out: { token: string; path: string }[] = []
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0
    const before = text[at - 1] ?? ''
    if (inUrl(at) || /[\w/.~-]/.test(before)) continue
    const token = m[0].replace(/\.+$/, '')
    out.push({ token, path: token.replace(LINE, '') })
  }
  return out
}

// The found files, first mention first, at most nine, each with every token that named it.
// `resolved` maps a token's path to the absolute file the shell found (absent: not a file).
export function pickRefs(found: { token: string; path: string }[], resolved: Map<string, string>): PathRef[] {
  const byFile = new Map<string, PathRef>()
  for (const { token, path } of found) {
    const file = resolved.get(path)
    if (!file) continue
    const ref = byFile.get(file)
    if (ref) {
      if (!ref.tokens.includes(token)) ref.tokens.push(token)
    } else if (byFile.size < 9) byFile.set(file, { path: file, tokens: [token], label: '' })
  }
  const refs = [...byFile.values()]
  const base = (p: string) => p.split('/').pop() ?? p
  for (const ref of refs) {
    const same = refs.filter(r => base(r.path) === base(ref.path)).length > 1
    ref.label = same ? ref.path.split('/').slice(-2).join('/') : base(ref.path)
  }
  return refs
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The text with " [n]" after each mention of the nth file (after a closing backtick when it's
// in code), left alone inside fenced code blocks.
export function annotate(text: string, refs: PathRef[]): string {
  const number = new Map<string, number>()
  refs.forEach((ref, i) => ref.tokens.forEach(t => number.set(t, i + 1)))
  if (!number.size) return text
  const tokens = [...number.keys()].sort((a, b) => b.length - a.length).map(escape)
  const pattern = new RegExp(`(?<![\\w/.~-])(${tokens.join('|')})(?![\\w/-]|\\.\\w)(\`?)`, 'g')
  return text
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part, i) => (i % 2 ? part : part.replace(pattern, (_m, token: string, tick: string) => `${token}${tick} [${number.get(token)}]`)))
    .join('')
}
