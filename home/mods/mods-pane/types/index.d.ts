export type Timestamp = number

export type ModName = 'sync-drift' | 'block-secrets' | 'commit-lint' | 'agent-links'

export type ResetRequest = { mods: ModName[]; at: Timestamp }

export type DismissRequest = { mod: ModName; entry: string; at: Timestamp }

declare module 'claude-code' {
  interface PluginState {
    'mods-pane': {
      isHidden: boolean
      hiddenAt: Timestamp
      removed: ModName[]
      order: ModName[]
      recent: number
      resetRequest: ResetRequest | null
      dismissRequest: DismissRequest | null
    }
  }
}
