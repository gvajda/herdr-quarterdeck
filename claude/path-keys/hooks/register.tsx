import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Refs } from '../types'
import { annotate, findTokens, pickRefs } from './paths'

// The files the last reply named. Cleared when a new prompt goes in.
const refs = atom({ plugin: 'path-keys', key: 'refs' } as const, null as Refs | null)

// $1 the folder relative paths start from, then paths: prints "path<TAB>absolute file" for each
// that is a file.
const RESOLVE = `cd "$1" 2>/dev/null || exit 0; shift
for p; do q=$p; case $q in "~/"*) q="$HOME/\${q#??}";; esac
  [ -f "$q" ] || continue; case $q in /*) ;; *) q="$PWD/$q";; esac
  printf '%s\\t%s\\n' "$p" "$q"; done`

// $1 the request, {"path","root","at"}: labels this terminal herdr.open with herdr-core's hc, on
// whichever machine this session runs. Herdr's Better Files sees the label and opens the file
// from there. Exit 4: not in a Herdr terminal.
const OPEN = `[ -n "$HC_TERMINAL_ID" ] || exit 4
hc=$(command -v hc || echo "$HOME/.local/bin/hc"); [ -x "$hc" ] || exit 4
"$hc" label "$HC_TERMINAL_ID" "herdr.open=$1" >/dev/null`

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    // Never in the prompt's way: a failed clear still sends it.
    await update($, refs, () => null).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // The main loop's answers only: a subagent's report isn't on screen as a reply.
    if (e.reason !== 'answer' || e.agentId || !e.answer) return result
    const found = findTokens(e.answer)
    if (!found.length) return result
    const paths = [...new Set(found.map(f => f.path))]
    const { stdout } = await $.process.run(['sh', '-c', RESOLVE, 'resolve', await $.session.cwd(), ...paths])
    const resolved = new Map(
      stdout.split('\n').filter(Boolean).map(line => line.split('\t') as [string, string]),
    )
    const items = pickRefs(found, resolved)
    await update($, refs, () => (items.length ? { reply: e.answer, items } : null))
    return result
  })

  // On screen only: the stored reply keeps its text.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const last = await read($, refs)
    const text = e.props.text.trim()
    if (!last || e.props.isSummary || !text || !last.reply.includes(text.slice(0, 200))) return next(e)
    return next({ ...e, props: { ...e.props, text: annotate(e.props.text, last.items) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const last = await read($, refs)
    if (!last || e.props.hasSurvey || e.props.isWorking) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const open = async (path: string) => {
      // The root is the file's Git checkout, else its folder: what Better Files' viewer is shown under.
      const folder = path.slice(0, path.lastIndexOf('/')) || '/'
      const git = await $.process.run(['git', '-C', folder, 'rev-parse', '--show-toplevel']).catch(() => null)
      const root = git?.exitCode === 0 ? git.stdout.trim() : folder
      // `at` makes the label change even when the same file is asked for again.
      const request = JSON.stringify({ path, root, at: await $.clock.now() })
      const { exitCode } = await $.process.run(['sh', '-c', OPEN, 'open', request])
      if (exitCode === 4) $.ui.toast('This session is not in a Herdr terminal, so the file cannot open there.')
      else if (exitCode !== 0) $.ui.toast(`Could not open ${path}`)
    }
    return (
      <Box>
        <Text dimColor>Open </Text>
        {last.items.map((item, i) => (
          <Button
            key={`open-${i + 1}`}
            hotkey={String(i + 1)}
            plain
            label={`${item.label}  `}
            onPress={() => open(item.path)}
          />
        ))}
      </Box>
    )
  })
}
