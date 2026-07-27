import type { PipelineNode } from './pipeline'
import type { RiskImpactItemKind, RiskImpactOverview } from './risk-impact'
import { parseRiskAssessmentRule, type RiskSeverity } from './risk-assessment'

export interface AnalysisReportRisk {
  id: string
  nodeId: string
  title: string
  detail: string
  domain: string
  kind: RiskImpactItemKind
  severity: RiskSeverity
  confidence?: number
  evidence?: string
  affectedAssets?: number
  scope?: string
  action: string
}

export interface AnalysisReportEvidence {
  nodeId: string
  kind: string
  label: string
  title: string
  detail: string
}

export interface AnalysisReport {
  mode: 'game'
  scope: string
  summary: string
  risks: AnalysisReportRisk[]
  evidence: AnalysisReportEvidence[]
  decisionFacts: { label: string; value: string }[]
  limitations: string[]
  serverCount: number
  agentCount: number
  telemetryGaps: number
}

const severityRank: Record<RiskSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, unknown: 1 }

export function humanizeAnalysisValue(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildAnalysisReport(nodes: PipelineNode[], overview?: RiskImpactOverview): AnalysisReport {
  const servers = nodes.filter((node) => node.data.kind === 'server')
  const agents = nodes.filter((node) => node.data.kind === 'agent')
  const telemetryGaps = servers.filter((node) => !node.data.serverTelemetry || node.data.serverTelemetry.state === 'offline').length
    + agents.filter((node) => !node.data.agentTelemetry).length
  const riskItems = overview?.items ?? nodes.filter((node) => node.data.kind === 'risk').map((node) => {
    const parsed = parseRiskAssessmentRule(node.data.rule)
    return {
      id: `risk-${node.id}`,
      nodeId: node.id,
      kind: 'risk' as const,
      domain: parsed.domain,
      severity: parsed.severity ?? 'unknown',
      title: node.data.label,
      detail: node.data.description,
      action: parsed.action || 'Review fresh evidence and define a bounded action.',
      evidence: parsed.evidence,
      affectedAssets: parsed.affectedAssets,
    }
  })
  const risks = riskItems.map((item): AnalysisReportRisk => {
    const node = nodes.find((candidate) => candidate.id === item.nodeId)
    const parsed = node?.data.kind === 'risk' ? parseRiskAssessmentRule(node.data.rule) : undefined
    return {
      id: item.id,
      nodeId: item.nodeId,
      title: item.title,
      detail: item.detail,
      domain: item.domain,
      kind: item.kind,
      severity: item.severity,
      confidence: parsed?.confidence,
      evidence: item.evidence ? humanizeAnalysisValue(item.evidence.replaceAll(':', ' · ')) : undefined,
      affectedAssets: item.affectedAssets,
      scope: parsed?.scope || undefined,
      action: humanizeAnalysisValue(item.action),
    }
  }).sort((left, right) => severityRank[right.severity] - severityRank[left.severity])

  const primaryServer = servers[0]
  const server = primaryServer?.data.serverTelemetry
  const primaryAgent = agents[0]?.data.agentTelemetry
  const primaryRisk = risks[0]
  const scope = primaryAgent ? `${agents[0]!.data.label} private agent evaluation` : primaryServer ? `${primaryServer.data.label} server operations` : 'Private game workflow'
  const summary = [
    server ? `${primaryServer!.data.label} is ${server.state} with ${server.playersOnline}/${server.playerCapacity} players and ${server.latencyMs} ms latency.` : '',
    primaryAgent ? `${agents[0]!.data.label} is ${primaryAgent.state} with ${Math.round(primaryAgent.confidence * 100)}% confidence.` : '',
    primaryRisk ? `${primaryRisk.title} is ${primaryRisk.severity}. Recommended action: ${primaryRisk.action}.` : 'No material operational or agent-safety risk is recorded.',
    nodes.some((node) => node.data.kind === 'review') ? 'A Human Review checkpoint protects the material action.' : 'No Human Review checkpoint is present.',
    nodes.some((node) => node.data.kind === 'validation') ? 'Post-action validation is represented.' : 'No post-action validation is represented.',
  ].filter(Boolean).join(' ')

  const evidenceKinds = new Set(['server', 'agent', 'source', 'profile', 'analysis', 'impact', 'validation', 'output'])
  const evidence = nodes.filter((node) => evidenceKinds.has(node.data.kind)).map((node): AnalysisReportEvidence => ({
    nodeId: node.id,
    kind: node.data.kind,
    label: node.data.kind === 'server' ? 'live server' : node.data.kind === 'agent' ? 'governed agent' : humanizeAnalysisValue(node.data.kind),
    title: node.data.label,
    detail: node.data.description,
  }))
  const decisionFacts = [
    ...(server ? [
      { label: 'Server state', value: server.state },
      { label: 'Players', value: `${server.playersOnline}/${server.playerCapacity}` },
      { label: 'Latency', value: `${server.latencyMs} ms` },
    ] : []),
    ...(primaryAgent ? [
      { label: 'Agent state', value: primaryAgent.state },
      { label: 'Safety boundary', value: 'Private server only' },
    ] : []),
  ]
  const limitations = [
    ...(servers.length === 0 ? ['No authorized Game Server card is present, so GAME LAB cannot assert operational state.'] : []),
    ...(telemetryGaps ? [`${telemetryGaps} server or agent card${telemetryGaps === 1 ? '' : 's'} lack usable telemetry.`] : []),
    ...(!nodes.some((node) => node.data.kind === 'review') ? ['Sensitive gameplay actions and material server commands require Human Review.'] : []),
    'GAME LAB is limited to owned or explicitly authorized private servers.',
  ]
  return { mode: 'game', scope, summary, risks, evidence, decisionFacts, limitations, serverCount: servers.length, agentCount: agents.length, telemetryGaps }
}
