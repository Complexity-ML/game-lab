export type DiagnosticCategory = 'bridge' | 'provider' | 'validation' | 'revision' | 'renderer' | 'workspace'
export type DiagnosticStatus = 'info' | 'success' | 'warning' | 'error'
export type DiagnosticLevel = 'all' | 'warnings' | 'errors'

export interface DiagnosticSettings {
  enabled: boolean
  level: DiagnosticLevel
  maximumEvents: number
  retentionDays: number
}

export interface DiagnosticInput {
  action: string
  category: DiagnosticCategory
  detail?: unknown
  status: DiagnosticStatus
}

export interface DiagnosticBundle {
  events: Array<DiagnosticInput & { id: string; timestamp: string }>
  generatedAt: string
  settings: DiagnosticSettings
  schemaVersion: 1
  telemetryEnabled: false
}

export function recordDiagnostic(event: DiagnosticInput) {
  if (!window.gameLab?.recordDiagnostic) return
  void window.gameLab.recordDiagnostic(event).catch(() => undefined)
}
