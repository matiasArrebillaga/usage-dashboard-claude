import { test, expect } from 'claude-code/testing'

import { bar, counter, modelName, resetsIn, stillValid, tokens } from './register'

test('tokens abbreviates', () => {
  expect(tokens(950)).toBe('950')
  expect(tokens(12345)).toBe('12K')
  expect(tokens(200000)).toBe('200K')
  expect(tokens(1000000)).toBe('1M')
})

test('bar fills proportionally and clamps', () => {
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(bar(0, 4)).toBe('░░░░')
  expect(bar(150, 4)).toBe('████')
})

test('resetsIn formats the countdown', () => {
  const now = Date.parse('2026-01-01T00:00:00Z')
  expect(resetsIn('2026-01-01T02:13:00Z', now)).toBe('reinicia en 2h 13m')
  expect(resetsIn('2026-01-03T05:00:00Z', now)).toBe('reinicia en 2d 5h')
  expect(resetsIn(undefined, now)).toBe('')
})

test('counter reads used / total', () => {
  expect(counter(84000, 200000)).toBe('84K / 200K')
  expect(counter(353210, 1000000)).toBe('353K / 1M')
})

test('modelName spells out the version', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(modelName('claude-opus-4-6[1m]')).toBe('Opus 4.6 (1M)')
  expect(modelName('opus')).toBe('opus')
})

test('stillValid drops windows that already reset', () => {
  const now = Date.parse('2026-01-01T00:00:00Z')
  const limits = [
    { kind: 'five_hour', percentUsed: 40, resetsAt: '2025-12-31T23:00:00Z' },
    { kind: 'seven_day', percentUsed: 10, resetsAt: '2026-01-03T00:00:00Z' },
  ]
  expect(stillValid(limits, now).map(l => l.kind)).toEqual(['seven_day'])
})

// After /clear there's no session.start and the state is empty: the pane loads it itself.
test('pane loads usage when drawn with empty state', async ($, on) => {
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', async () => ({
    value: { rateLimits: [{ kind: 'five_hour', percentUsed: 30 }], context: { tokens: 1000, window: 200000, percent: 1 } },
  }) as never)
  const ui = await $.ui.mount({
    plugin: 'usage-dashboard',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'usage-dashboard',
    props: { title: 'Uso', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } },
  } as never)
  expect(await ui.find({ type: 'Text', text: /Límite 5 horas/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cargando/ })).toBeUndefined()
})
