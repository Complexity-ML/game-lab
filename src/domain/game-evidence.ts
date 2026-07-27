export interface GameEvidence {
  tool: string
  source: string
  capturedAt: string
  expiresAt: string
  status: 'ok' | 'unavailable' | 'error'
  summary: string
  cached: boolean
  stale: boolean
}
