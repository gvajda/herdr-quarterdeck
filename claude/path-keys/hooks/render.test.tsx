import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'path-keys',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('a reply naming a file gets a number row and a tag', async ($, on) => {
  on('session.cwd', () => ({ value: '/w' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'docs/a.md\t/w/docs/a.md\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{String((e.props as { text?: string }).text ?? '')}</Text>
  })

  await $.turn.complete({ reason: 'answer', answer: 'Edited docs/a.md and notes.txt.', durationMs: 1, isAborted: false, turnId: 't1' })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const button = await band.find({ key: 'open-1' })
  expect(button?.text).toContain('a.md')
  expect(await band.find({ key: 'open-2' })).toBeUndefined()
  await band.unmount()

  const reply = await $.ui.mount({
    plugin: 'path-keys',
    component: 'AssistantMessage',
    surface: 'terminal',
    props: { text: 'Edited docs/a.md and notes.txt.', isFirstOfReply: true },
  })
  expect((await reply.find({ type: 'Text' }))?.text).toBe('Edited docs/a.md [1] and notes.txt.')
  await reply.unmount()
})
