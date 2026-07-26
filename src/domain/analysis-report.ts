import type { PipelineNode } from './pipeline'
import type { RiskImpactItemKind, RiskImpactOverview } from './risk-impact'
import { parseRiskAssessmentRule, type RiskSeverity } from './risk-assessment'
import { isSoftwareAssetCheckpoint, isSoftwareAssetGraph, isSoftwareAssetNode, isSoftwareAssetText } from './sam-asset'

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
  sensitiveSignals?: number
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
  mode: 'game' | 'legacy'
  scope: string
  summary: string
  inspectedAssets: number
  totalAssets: number
  softwareAssets: number
  profiledSoftwareAssets: number
  softwareEvidenceGaps: number
  risks: AnalysisReportRisk[]
  contextRisks: AnalysisReportRisk[]
  evidence: AnalysisReportEvidence[]
  decisionFacts: { label: string; value: string }[]
  limitations: string[]
  serverCount: number
  agentCount: number
  telemetryGaps: number
}

const severityRank: Record<RiskSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
}

export function humanizeAnalysisValue(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildGameAnalysisReport(nodes: PipelineNode[], overview?: RiskImpactOverview): AnalysisReport {
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
      action: parsed.action || 'Review the evidence and define a bounded operator action.',
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
  const scope = primaryAgent
    ? `${agents[0]!.data.label} private agent evaluation`
    : primaryServer ? `${primaryServer.data.label} server operations` : 'Private game workflow'
  const summary = [
    server ? `${primaryServer!.data.label} is ${server.state} with ${server.playersOnline}/${server.playerCapacity} players, ${server.latencyMs} ms latency and ${server.resourcesFailed} failed resource${server.resourcesFailed === 1 ? '' : 's'}.` : '',
    primaryAgent ? `${agents[0]!.data.label} is ${primaryAgent.state} with ${Math.round(primaryAgent.confidence * 100)}% confidence; its safety boundary is private-server-only.` : '',
    primaryRisk ? `${primaryRisk.title} is ${primaryRisk.severity}${primaryRisk.confidence === undefined ? '' : ` with ${Math.round(primaryRisk.confidence * 100)}% confidence`}. Recommended action: ${primaryRisk.action}.` : 'No material operational or agent-safety risk is recorded.',
    nodes.some((node) => node.data.kind === 'review') ? 'A Human Review checkpoint protects the material action.' : 'No Human Review checkpoint is present.',
    nodes.some((node) => node.data.kind === 'validation') ? 'Post-action validation is represented in the graph.' : 'No post-action validation is represented.',
  ].filter(Boolean).join(' ')
  const evidenceKinds = new Set(['server', 'agent', 'profile', 'analysis', 'impact', 'validation', 'output'])
  const evidence = nodes.filter((node) => evidenceKinds.has(node.data.kind)).map((node): AnalysisReportEvidence => ({
    nodeId: node.id,
    kind: humanizeAnalysisValue(node.data.kind),
    label: node.data.kind === 'server' ? 'live server' : node.data.kind === 'agent' ? 'governed agent' : humanizeAnalysisValue(node.data.kind),
    title: node.data.label,
    detail: node.data.description,
  }))
  const decisionFacts = [
    ...(server ? [
      { label: 'Server state', value: server.state },
      { label: 'Players', value: `${server.playersOnline}/${server.playerCapacity}` },
      { label: 'Latency', value: `${server.latencyMs} ms` },
      { label: 'Resources', value: `${server.resourcesRunning} running · ${server.resourcesFailed} failed` },
    ] : []),
    ...(primaryAgent ? [
      { label: 'Agent mode', value: primaryAgent.mode },
      { label: 'Agent state', value: primaryAgent.state },
      { label: 'Safety boundary', value: 'Private server only' },
    ] : []),
  ]
  const limitations = [
    ...(servers.length === 0 ? ['No authorized Game Server card is present, so GAME LAB cannot assert operational state.'] : []),
    ...(telemetryGaps ? [`${telemetryGaps} server or agent card${telemetryGaps === 1 ? '' : 's'} lack usable telemetry.`] : []),
    ...(!nodes.some((node) => node.data.kind === 'review') ? ['Material server commands and agent policy promotions require Human Review.'] : []),
    'GAME LAB is limited to owned or explicitly authorized private servers; it does not support public-server automation or anti-cheat bypass.',
  ]
  return {
    mode: 'game',
    scope,
    summary,
    inspectedAssets: servers.length + agents.length,
    totalAssets: servers.length + agents.length,
    softwareAssets: servers.length,
    profiledSoftwareAssets: servers.filter((node) => Boolean(node.data.serverTelemetry)).length,
    softwareEvidenceGaps: telemetryGaps,
    risks,
    contextRisks: [],
    evidence,
    decisionFacts,
    limitations,
    serverCount: servers.length,
    agentCount: agents.length,
    telemetryGaps,
  }
}

function firstMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]
}

function softwareDecisionFacts(nodes: PipelineNode[]) {
  if (!isSoftwareAssetGraph(nodes)) return []
  const text = nodes
    .filter((node) => isSoftwareAssetText(`${node.data.label} ${node.data.description} ${node.data.rule ?? ''} ${node.data.datahubUrn ?? ''} ${node.data.datahubDomain ?? ''} ${(node.data.datahubTags ?? []).join(' ')} ${node.data.schema.map((field) => field.name).join(' ')}`))
    .map((node) => `${node.data.label}. ${node.data.description}. ${node.data.rule ?? ''}`)
    .join(' ')
  const source = nodes.find((node) => node.data.kind === 'source' && isSoftwareAssetNode(node))
  const purchased = firstMatch(text, /\b([\d,.]+)\s+purchased(?:\s+seats?)?/i)
  const assigned = firstMatch(text, /\b([\d,.]+)\s+assigned(?:\s+seats?)?/i)
  const active = firstMatch(text, /\b([\d,.]+)\s+active(?:\s+seats?)?/i)
  const candidates = firstMatch(text, /\b(?:identifies?|found|flags?)\s+([\d,.]+)\s+(?:seats?\s+)?(?:inactive|reclaim|candidates?)/i)
    ?? firstMatch(text, /\b([\d,.]+)\s+(?:reclaim\s+)?candidates?\b/i)
  const eligible = firstMatch(text, /\b(?:values?|identifies?)\s+([\d,.]+)\s+eligible\s+seats?/i)
    ?? firstMatch(text, /\b([\d,.]+)\s+eligible\s+reclaims?\b/i)
  const savingsMatch = text.match(/\b(USD|EUR|GBP)\s*([\d,.]+)\s+(?:in\s+)?annual(?:ized)?\s+savings?/i)
    ?? text.match(/\bannual(?:ized)?\s+savings?(?:\s+(?:target|opportunity))?(?:\s+of)?\s+(USD|EUR|GBP)\s*([\d,.]+)/i)

  return [
    ...(source ? [{ label: 'Software product', value: source.data.label }] : []),
    ...(purchased ? [{ label: 'Purchased seats', value: purchased }] : []),
    ...(assigned ? [{ label: 'Assigned seats', value: assigned }] : []),
    ...(active ? [{ label: 'Active seats', value: active }] : []),
    ...(candidates ? [{ label: 'Review candidates', value: candidates }] : []),
    ...(eligible ? [{ label: 'Eligible reclamations', value: eligible }] : []),
    ...(savingsMatch ? [{ label: 'Annual savings', value: `${savingsMatch[1]} ${savingsMatch[2]}` }] : []),
  ]
}

export function buildAnalysisReport(nodes: PipelineNode[], overview?: RiskImpactOverview): AnalysisReport {
  if (nodes.some((node) => node.data.kind === 'server' || node.data.kind === 'agent')) return buildGameAnalysisReport(nodes, overview)
  const sources = nodes.filter((node) => node.data.kind === 'source')
  const softwareAssetReport = isSoftwareAssetGraph(nodes)
  const decisionFacts = softwareDecisionFacts(nodes)
  const exploration = nodes
    .filter((node) => node.data.kind === 'explorer' && node.data.exploration)
    .map((node) => node.data.exploration!)
    .sort((left, right) => right.inspected - left.inspected || right.total - left.total)[0]
  const inspectedAssets = exploration?.inspected ?? sources.length
  const totalAssets = exploration?.total ?? sources.length
  const softwareCheckpoints = exploration?.datasets.filter(isSoftwareAssetCheckpoint) ?? []
  const softwareSources = sources.filter(isSoftwareAssetNode)
  const softwareAssets = softwareCheckpoints.length || softwareSources.length
  const profiledSoftwareAssets = softwareCheckpoints.length
    ? softwareCheckpoints.filter((dataset) => dataset.dataAuditStatus === 'complete').length
    : Math.max(
      nodes.filter((node) => node.data.kind === 'profile' && isSoftwareAssetNode(node) && node.data.profile?.aggregateAudit.status === 'complete').length,
      softwareAssetReport && softwareSources.some((node) => node.data.schema.some((field) => /\b(?:purchased|assigned|active|usage|utilization|cost|spend|renewal|entitlement)\b/i.test(field.name.replaceAll('_', ' ')))) ? 1 : 0,
    )
  const softwareEvidenceGaps = softwareCheckpoints.filter((dataset) =>
    dataset.status === 'unavailable'
    || dataset.dataAuditStatus !== 'complete'
    || dataset.issues.some((issue) => issue === 'owner missing' || issue === 'tags missing')).length

  const riskItems = overview?.items ?? nodes
    .filter((node) => node.data.kind === 'risk')
    .map((node) => {
      const parsed = parseRiskAssessmentRule(node.data.rule)
      return {
        id: `risk-${node.id}`,
        nodeId: node.id,
        kind: 'risk' as const,
        domain: parsed.domain,
        severity: parsed.severity ?? 'unknown',
        title: node.data.label,
        detail: node.data.description,
        action: parsed.action || 'Review the evidence and define a governed next action.',
        evidence: parsed.evidence,
        affectedAssets: parsed.affectedAssets,
      }
    })
  const allRisks = riskItems
    .map((item): AnalysisReportRisk => {
      const node = nodes.find((candidate) => candidate.id === item.nodeId)
      const parsed = node?.data.kind === 'risk' ? parseRiskAssessmentRule(node.data.rule) : undefined
      const sensitiveSignals = Number(item.detail.match(/\b(\d+)\s+sensitive (?:field\/tag signals?|fields?|signals?)(?:\(s\))?/i)?.[1])
      return {
        id: item.id,
        nodeId: item.nodeId,
        title: /^host risk\b/i.test(item.title)
          ? `${parsed?.scope || 'Dataset'} ${humanizeAnalysisValue(item.domain)} risk`
          : item.title,
        detail: item.detail
          .replace(/^Evidence-backed risk preserved before mitigation\.\s*/i, '')
          .replace(/^HIGH host risk score/i, 'Host risk score'),
        domain: item.domain,
        kind: item.kind,
        severity: item.severity,
        confidence: parsed?.confidence,
        evidence: item.evidence ? humanizeAnalysisValue(item.evidence.replaceAll(':', ' · ')) : undefined,
        affectedAssets: item.affectedAssets,
        sensitiveSignals: Number.isFinite(sensitiveSignals) ? sensitiveSignals : undefined,
        scope: parsed?.scope || undefined,
        action: humanizeAnalysisValue(item.action),
      }
    })
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || (left.kind === 'risk' ? -1 : 1))
  const isSamMaterialFinding = (risk: AnalysisReportRisk) => {
    if (risk.domain === 'privacy') return false
    const node = nodes.find((candidate) => candidate.id === risk.nodeId)
    return Boolean(node && isSoftwareAssetNode(node))
      || isSoftwareAssetText(`${risk.title} ${risk.detail} ${risk.scope ?? ''} ${risk.action}`)
  }
  const risks = allRisks.filter(isSamMaterialFinding)
  const contextRisks = allRisks.filter((risk) => !isSamMaterialFinding(risk))
  const primaryRisk = risks.find((risk) => risk.kind === 'risk') ?? risks[0]

  const sourceScope = softwareSources.map((node) => node.data.label).slice(0, 3).join(', ')
  const riskScope = primaryRisk?.scope
  const profileScope = nodes.find((node) => node.data.kind === 'profile' && isSoftwareAssetNode(node))?.data.label.replace(/\s+profile$/i, '')
  const scopeBase = sourceScope || riskScope || profileScope || 'Connected catalog'
  const scope = softwareAssetReport
    ? `${scopeBase} software asset analysis`
    : 'Software asset evidence not established'

  const evidenceKinds = new Set(['profile', 'analysis', 'impact', 'validation', 'output'])
  const evidence = nodes
    .filter((node) => evidenceKinds.has(node.data.kind) && isSoftwareAssetText(`${node.data.label} ${node.data.description} ${node.data.rule ?? ''} ${node.data.datahubUrn ?? ''}`))
    .map((node): AnalysisReportEvidence => ({
      nodeId: node.id,
      kind: humanizeAnalysisValue(node.data.kind),
      label: node.data.kind === 'profile'
        ? node.data.profile?.aggregateAudit.status === 'complete' ? 'aggregate profile' : 'metadata profile'
        : humanizeAnalysisValue(node.data.kind),
      title: node.data.label,
      detail: node.data.description,
    }))

  const limitations = [
    ...(!softwareAssetReport ? ['No qualified software inventory, license, subscription, entitlement, contract, utilization, cost or renewal evidence is present. No license, compliance or optimization decision is asserted.'] : []),
    ...(softwareEvidenceGaps > 0 ? [`${softwareEvidenceGaps} qualified software asset${softwareEvidenceGaps === 1 ? '' : 's'} lack complete ownership, classification or aggregate license evidence. No optimization or compliance conclusion is asserted for that uncovered SAM evidence.`] : []),
    ...nodes
      .filter((node) => node.data.kind === 'profile' && isSoftwareAssetNode(node) && node.data.profile?.aggregateAudit.status !== 'complete')
      .map((node) => `${node.data.label} contains software-asset metadata only; aggregate assignment, utilization and cost evidence is ${humanizeAnalysisValue(node.data.profile?.aggregateAudit.status ?? 'unavailable')}.`),
    ...(contextRisks.length ? [`${contextRisks.length} data-governance or non-SAM finding${contextRisks.length === 1 ? ' is' : 's are'} shown separately as context and excluded from the license decision.`] : []),
  ].filter((value, index, all) => all.indexOf(value) === index)

  const severityLabel = primaryRisk ? primaryRisk.severity.charAt(0).toUpperCase() + primaryRisk.severity.slice(1) : ''
  const decisionFact = (label: string) => decisionFacts.find((fact) => fact.label === label)?.value
  const seatSummary = softwareAssetReport && decisionFact('Purchased seats')
    ? `${decisionFact('Software product') ?? scopeBase}: ${decisionFact('Purchased seats')} purchased seats, ${decisionFact('Assigned seats') ?? 'an unreported number'} assigned and ${decisionFact('Active seats') ?? 'an unreported number'} active.`
    : ''
  const opportunitySummary = softwareAssetReport && (decisionFact('Review candidates') || decisionFact('Eligible reclamations') || decisionFact('Annual savings'))
    ? `${decisionFact('Review candidates') ? `${decisionFact('Review candidates')} seats require review` : 'Reclamation candidates require review'}${decisionFact('Eligible reclamations') ? `; ${decisionFact('Eligible reclamations')} are eligible for reclamation` : ''}${decisionFact('Annual savings') ? `, representing ${decisionFact('Annual savings')} in annual savings` : ''}.`
    : ''
  const summaryParts = primaryRisk
    ? [
        seatSummary,
        opportunitySummary,
        !softwareAssetReport && primaryRisk.sensitiveSignals !== undefined
          ? `${scopeBase} contains ${primaryRisk.sensitiveSignals} sensitive field or tag signal${primaryRisk.sensitiveSignals === 1 ? '' : 's'}.`
          : `${scopeBase} has a ${severityLabel} ${softwareAssetReport ? 'software asset' : humanizeAnalysisValue(primaryRisk.domain)} risk.`,
        `The decision is rated ${severityLabel}${primaryRisk.confidence !== undefined ? ` with ${Math.round(primaryRisk.confidence * 100)}% confidence` : ''}${primaryRisk.affectedAssets !== undefined ? ` and covers ${primaryRisk.affectedAssets} affected software record${primaryRisk.affectedAssets === 1 ? '' : 's'}` : ''}.`,
        softwareAssets > 0 && profiledSoftwareAssets === 0
          ? 'Aggregate assignment, utilization or cost evidence is unavailable; therefore, no license optimization or compliance conclusion is claimed.'
          : softwareEvidenceGaps > 0
            ? `${profiledSoftwareAssets}/${softwareAssets} qualified software assets have aggregate evidence; ${softwareEvidenceGaps} still have ownership, classification or evidence gaps.`
            : softwareAssets > 0 ? `${profiledSoftwareAssets}/${softwareAssets} qualified software assets have aggregate evidence.` : '',
        /human review|review|verify|verification/i.test(primaryRisk.action)
          ? 'Human review and post-mitigation verification are required.'
          : `Recommended next action: ${primaryRisk.action}.`,
        totalAssets > 0 ? `Catalog scan: ${inspectedAssets}/${totalAssets} assets checked; ${softwareAssets} qualified as software-asset evidence.` : '',
      ]
    : [
        seatSummary,
        opportunitySummary,
        softwareAssetReport
          ? 'No material SAM risk is supported by the current software evidence.'
          : 'No qualified software inventory, license, subscription, entitlement, contract, utilization, cost or renewal evidence is established, so SAM makes no license decision.',
        contextRisks.length ? `${contextRisks.length} data-governance or non-SAM finding${contextRisks.length === 1 ? ' is' : 's are'} retained separately as context.` : '',
        totalAssets > 0 ? `Catalog scan: ${inspectedAssets}/${totalAssets} assets checked; ${softwareAssets} qualified as software-asset evidence.` : 'No connected-catalog coverage checkpoint is present.',
      ]

  return {
    mode: 'legacy',
    scope,
    summary: summaryParts.filter(Boolean).join(' '),
    inspectedAssets,
    totalAssets,
    softwareAssets,
    profiledSoftwareAssets,
    softwareEvidenceGaps,
    risks,
    contextRisks,
    evidence,
    decisionFacts,
    limitations,
    serverCount: 0,
    agentCount: 0,
    telemetryGaps: 0,
  }
}
