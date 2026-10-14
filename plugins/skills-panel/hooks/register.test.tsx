import { test, expect } from 'claude-code/testing'

test('el panel lista skills (no built-in) y agentes con botón', async ($, on) => {
  on('command.list', () => ({ value: [
    { name: 'commit', description: 'Crea un commit', source: 'plugin' },
    { name: 'help', description: 'Ayuda', source: 'builtin' },
  ] }))
  const ui = await $.ui.mount({ plugin: 'skills-panel', surface: 'terminal', component: 'Pane', props: {}, requestId: 'skills-panel', viewport: { columns: 80, rows: 40 } })
  expect(await ui.find({ key: 's-commit' })).toBeDefined()
  expect(await ui.find({ key: 's-help' })).toBeUndefined()
  expect(await ui.find({ key: 'a-Explore' })).toBeDefined()
  await ui.unmount()
})
