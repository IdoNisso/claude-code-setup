export type Drift = { summary: string; isError: boolean; since: number }

declare module 'claude-code' {
  interface PluginState {
    'sync-drift': { drift: Drift | null }
  }
}
