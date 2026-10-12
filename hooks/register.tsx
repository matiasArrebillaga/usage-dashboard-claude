import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Settings, Snapshot } from '../types'

const PANE = 'usage-dashboard'
const TITLE = 'Uso'
const COLUMNS = 40
const LABELS: Record<string, string> = { five_hour: 'Límite 5 horas', seven_day: 'Límite semanal' }
const MODELS = ['opus', 'sonnet', 'haiku']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const MODES = ['default', 'acceptEdits', 'plan', 'auto']
const MODE_LABELS: Record<string, string> = { acceptEdits: 'edits', bypassPermissions: 'bypass' }
const LAST_LIMITS = 'lastLimits'
const usage = atom({ plugin: 'usage-dashboard', key: 'usage' } as const, null as Snapshot | null)
const settings = atom({ plugin: 'usage-dashboard', key: 'settings' } as const, {} as Settings)

export const bar = (percent: number, width: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const resetsIn = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return 'reinicia en ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`)
}

export const tokens = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`

export const counter = (used: number, total: number) => `${tokens(used)} / ${tokens(total)}`

// `claude-opus-5-5` → `Opus 5.5`; anything else (an alias, a display name) as given.
export const modelName = (model: string) => {
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(model)
  if (!m) return model
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  return `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}${model.includes('[1m]') ? ' (1M)' : ''}`
}

// Limits saved from an earlier session, minus the windows that already reset.
export const stillValid = (limits: Limit[], now: number) =>
  limits.filter(l => !l.resetsAt || Date.parse(l.resetsAt) > now)

// Theme keys, so the pane follows the person's Claude Code theme.
const color = (p: number) => (p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success')
const MODE_COLORS: Record<string, string> = {
  default: 'text', acceptEdits: 'autoAccept', plan: 'planMode', auto: 'warning', bypassPermissions: 'error',
}

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS })
const remember = ($: EngineInterface, patch: Settings) =>
  update($, settings, s => ({ ...s, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v)) }))

const load = async ($: EngineInterface) => {
  const { rateLimits, context, cost } = await $.session.usage()
  // Limits only arrive with the first response: until then show the last ones seen.
  const saved = rateLimits.length ? [] : stillValid(((await $.store.get(LAST_LIMITS)) ?? []) as Limit[], Date.now())
  await update($, usage, () => ({ rateLimits: rateLimits.length ? rateLimits : saved, context, cost, isStale: saved.length > 0 }))
  await remember($, { model: await $.session.model() })
}
let loading = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void open($)
    await load($)

    return next(e)
  })

  // `/usage` is the built-in's name (it can't be registered); this hook answers it.
  on('command.run', { command: 'usage' }, async $ => {
    await open($)

    return { text: 'Dashboard de uso abierto.' }
  })

  // Reopen on each prompt if it was closed or never placed: a prompt counts as
  // the person asking, so it docks at any width (right side in fullscreen).
  on('prompt.submit', async ($, e, next) => {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    if (!pane?.isPlaced) void open($)

    return next(e)
  })

  // Keep model/effort in sync whether they were changed from the pane or typed.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const ran = await next(e)
    await remember($, { model: await $.session.model() })

    return ran
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const ran = await next(e)
    const level = e.args.trim()
    if (EFFORTS.includes(level)) await remember($, { effort: level })

    return ran
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await remember($, { mode: e.permission_mode })

    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    await remember($, { mode: e.permission_mode, effort: e.effort?.level })

    return next(e)
  })

  // Each main-loop request names the exact model id and effort in use.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) await remember($, { model: e.model, effort: typeof e.effort === 'string' ? e.effort : undefined })

    return yield* next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length) void $.store.set(LAST_LIMITS, e.rateLimits)
    await update($, usage, prev => ({
      rateLimits: e.rateLimits.length ? e.rateLimits : prev?.rateLimits ?? [],
      context: e.context,
      cost: e.cost,
      isStale: !e.rateLimits.length && !!prev?.isStale,
    }))

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, usage)
    const cfg: Settings = await read($, settings)
    const cols = e.props.bodyColumns || COLUMNS
    const now = Date.now()
    const meter = (label: string, percent: number, detail: string, count?: string) => {
      const suffix = `${percent}%`
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text>
            <Text bold>{label}</Text>
            {count && <Text color="subtle"> {count}</Text>}
          </Text>
          <Text>
            <Text color={color(percent)}>{bar(percent, Math.max(4, cols - suffix.length - 1))}</Text> {suffix}
          </Text>
          {detail && <Text color="subtle">{detail}</Text>}
        </Box>
      )
    }
    const button = (key: string, label: string, isOn: boolean, onPress: () => void, hotkey?: string) => (
      <Button key={key} label={label} hotkey={hotkey} variant={isOn ? 'primary' : undefined} dimColor={!isOn} onPress={onPress} />
    )
    const picker = (cmd: string, options: string[], isOn: (opt: string) => boolean, hotkeys: string[]) => (
      <Box flexWrap="wrap" columnGap={1}>
        {options.map((opt, i) =>
          button(`${cmd}-${opt}`, opt, isOn(opt), () => void $.command.run({ command: cmd, args: opt }), hotkeys[i]))}
      </Box>
    )
    const model = cfg.model ? modelName(cfg.model) : '—'
    const modes = cfg.mode && !MODES.includes(cfg.mode) ? [...MODES, cfg.mode] : MODES

    const controls = (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>Modelo</Text> <Text color="claude">{model}</Text>
          {cfg.model && model !== cfg.model && <Text color="subtle"> {cfg.model}</Text>}
        </Text>
        {picker('model', MODELS, opt => !!cfg.model?.toLowerCase().includes(opt), ['o', 's', 'k'])}
        <Text>
          <Text bold>Effort</Text> <Text color="claude">{cfg.effort ?? '—'}</Text>
        </Text>
        {picker('effort', EFFORTS, opt => cfg.effort === opt, ['1', '2', '3', '4', '5'])}
        <Text>
          <Text bold>Modo</Text>{' '}
          <Text color={MODE_COLORS[cfg.mode ?? ''] ?? 'claude'}>{cfg.mode ? MODE_LABELS[cfg.mode] ?? cfg.mode : '—'}</Text>{' '}
          <Text color="subtle">(shift+tab)</Text>
        </Text>
        {/* Mods can't switch the permission mode: these show it, a press points to shift+tab. */}
        <Box flexWrap="wrap" columnGap={1}>
          {modes.map(m =>
            button(`mode-${m}`, MODE_LABELS[m] ?? m, cfg.mode === m, () => void $.ui.toast('El modo se cambia con shift+tab')))}
        </Box>
      </Box>
    )

    // A /clear starts a new session with empty state and no session.start: load it here.
    if (!snap && !loading) {
      loading = true
      void load($).finally(() => { loading = false })
    }
    if (!snap) return <Box flexDirection="column">{controls}<Text color="subtle">Cargando…</Text></Box>
    const { context: ctx } = snap

    return (
      <Box flexDirection="column">
        {controls}
        {snap.rateLimits.length === 0 && (
          <Text color="subtle">Límites: sin datos todavía (aparecen tras la primera respuesta).</Text>
        )}
        {snap.isStale && <Text color="subtle">Límites: último dato guardado, se actualiza con la próxima respuesta.</Text>}
        {snap.rateLimits.map(l => meter(LABELS[l.kind] ?? l.kind, l.percentUsed, resetsIn(l.resetsAt, now)))}
        {ctx.percent === undefined
          ? <Text color="subtle">Contexto: — / {tokens(ctx.window)} tokens</Text>
          : meter('Contexto', ctx.percent, '', counter(ctx.tokens ?? 0, ctx.window))}
        {snap.cost && (
          <Text>
            <Text bold>Costo de la sesión</Text> ${snap.cost.usd.toFixed(2)}
          </Text>
        )}
      </Box>
    )
  })
}
