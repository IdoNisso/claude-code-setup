export type Timestamp = number

declare module 'claude-code' {
  interface PluginState {
    'mods-pane': { isHidden: boolean; hiddenAt: Timestamp }
  }
}
