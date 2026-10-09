export type ModName = 'block-secrets' | 'commit-lint' | 'sync-drift'
export type Variant = 'pane' | 'band' | 'status' | 'report'
export type ModEvent = { mod: ModName; text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'prototype-mods-ui': {
      variant: Variant
      events: ModEvent[]
      drift: string | null
      isBandHidden: boolean
      isPaneHidden: boolean
      unseen: number
    }
  }
}
