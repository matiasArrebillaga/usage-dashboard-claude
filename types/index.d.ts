export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  rateLimits: Limit[]
  context: { tokens?: number; window: number; percent?: number }
  cost?: { usd: number }
  isStale?: boolean
}
export type Settings = { model?: string; effort?: string; mode?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-dashboard': { usage: Snapshot | null; settings: Settings }
  }
}
