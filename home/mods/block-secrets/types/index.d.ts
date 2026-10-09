export type SecretBlock = { tool: string; reason: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'block-secrets': { blocks: SecretBlock[] }
  }
}
