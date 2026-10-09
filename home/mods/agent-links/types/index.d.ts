export type LinkState = 'waiting-on-them' | 'waiting-on-me' | 'watching' | 'settled'

export type PeerStatus = 'busy' | 'idle' | 'gone'

export type Link = {
  peer: string
  place: string
  state: LinkState
  since: number
  isOverdue: boolean
  peerStatus: PeerStatus
}

declare module 'claude-code' {
  interface PluginState {
    'agent-links': { links: Link[] }
  }
}
