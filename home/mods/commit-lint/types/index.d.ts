export type CommitBlock = { subject: string; problems: string[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'commit-lint': { blocks: CommitBlock[] }
  }
}
