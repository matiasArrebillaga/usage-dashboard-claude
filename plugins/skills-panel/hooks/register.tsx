import type { Register } from 'claude-code'

const PANE = 'skills-panel'
const open = ($: any) => $.ui.open({ id: PANE, title: 'Skills y agentes' })

// Agentes built-in: no hay API que los liste, así que van a mano.
const BUILTIN_AGENTS: [string, string][] = [
  ['general-purpose', 'Investiga preguntas complejas y hace tareas de varios pasos'],
  ['Explore', 'Busca en muchos archivos y te devuelve solo la conclusión'],
  ['Plan', 'Diseña un plan de implementación paso a paso'],
  ['claude-code-guide', 'Responde dudas sobre Claude Code, la API y el SDK'],
  ['haiku-helper', 'Tareas rápidas: buscar, leer, renombrar, ediciones chicas'],
]

// Agentes propios: ~/.claude/agents/*.md (name/description del frontmatter).
async function userAgents($: any): Promise<[string, string][]> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const dir = `${home}/.claude/agents`
  if (!(await $.fs.exists(dir))) return []
  const files = (await $.fs.list(dir)).filter((f: any) => f.name.endsWith('.md'))
  return Promise.all(files.map(async (f: any) => {
    const md: string = await $.fs.read(`${dir}/${f.name}`)
    const get = (k: string) => md.match(new RegExp(`^${k}:\s*(.+)$`, 'm'))?.[1].trim() ?? ''
    return [get('name') || f.name.slice(0, -3), get('description')] as [string, string]
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'skills-panel', description: 'Abre el panel de skills y agentes' })
    return next(e)
  })

  on('command.run', { command: 'skills-panel' }, async $ => {
    await open($)
    return { text: 'Panel de skills abierto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const skills = (await $.command.list()).filter(c => c.source !== 'builtin')
    const agents = [...BUILTIN_AGENTS, ...(await userAgents($).catch(() => []))]

    return (
      <Box flexDirection="column">
        <Text bold>Skills ({skills.length})</Text>
        {skills.map(s => (
          <Box key={`row-s-${s.name}`} flexDirection="column" marginBottom={1}>
            <Button key={`s-${s.name}`} onPress={() => void $.command.run({ command: s.name })}>/{s.name}</Button>
            <Text dimColor>{s.description}</Text>
          </Box>
        ))}
        <Text bold>Agentes ({agents.length})</Text>
        {agents.map(([name, desc]) => (
          <Box key={`row-a-${name}`} flexDirection="column" marginBottom={1}>
            <Button key={`a-${name}`} onPress={() => void $.prompt.fill({ text: `Usá el agente ${name} para: ` })}>{name}</Button>
            <Text dimColor>{desc}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
