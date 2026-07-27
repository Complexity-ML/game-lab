import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'
import { parseRiskAssessmentRule, riskDomainFromText, type RiskDomain, type RiskSeverity } from './risk-assessment'

export type RiskImpactItemKind = 'risk' | 'impact' | 'verification' | 'coverage-gap'

export interface RiskImpactItem {
  id: string
  nodeId: string
  kind: RiskImpactItemKind
  domain: RiskDomain
  severity: RiskSeverity
  title: string
  detail: string
  action: string
  evidence?: string
  affectedAssets?: number
  affectedModels?: number
  sourceRef?: string
}

export interface RiskImpactOverview {
  items: RiskImpactItem[]
  actionable: number
  needsVerification: number
  critical: number
  high: number
  coverageGaps: number
}

function hasDownstreamRisk(nodeId: string, nodes: PipelineNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const queue = edges.filter((edge) => edge.source === nodeId && edge.sourceHandle !== 'feedback').map((edge) => edge.target)
  const visited = new Set<string>()
  while (queue.length) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    const current = byId.get(currentId)
    if (!current) continue
    if (current.data.kind === 'risk') return true
    queue.push(...edges.filter((edge) => edge.source === currentId && edge.sourceHandle !== 'feedback').map((edge) => edge.target))
  }
  return false
}

export function collectRiskImpactOverview(nodes: PipelineNode[], edges: Edge[]): RiskImpactOverview {
  const items: RiskImpactItem[] = nodes.flatMap((node) => {
    if (node.data.kind === 'risk') {
      const risk = parseRiskAssessmentRule(node.data.rule)
      return [{
        id: `risk-${node.id}`,
        nodeId: node.id,
        kind: 'risk' as const,
        domain: risk.domain,
        severity: risk.severity ?? 'unknown',
        title: node.data.label,
        detail: node.data.description,
        action: risk.action || 'Review fresh game evidence and define a bounded action.',
        evidence: risk.evidence,
        affectedAssets: risk.affectedAssets,
        affectedModels: risk.affectedModels,
        sourceRef: node.data.evidenceRef,
      }]
    }
    if (node.data.kind !== 'impact') return []
    const domain = riskDomainFromText(`${node.data.label} ${node.data.description} ${node.data.rule ?? ''}`)
    const impact: RiskImpactItem = {
      id: `impact-${node.id}`,
      nodeId: node.id,
      kind: 'impact',
      domain,
      severity: 'unknown',
      title: node.data.label,
      detail: node.data.description,
      action: 'Trace this player, world or server impact through a fresh Risk Assessment.',
      sourceRef: node.data.evidenceRef,
    }
    return hasDownstreamRisk(node.id, nodes, edges) ? [impact] : [impact, {
      id: `coverage-${node.id}`,
      nodeId: node.id,
      kind: 'coverage-gap' as const,
      domain,
      severity: 'medium' as const,
      title: `Risk coverage missing · ${node.data.label}`,
      detail: 'This Game Impact has no downstream Risk Assessment.',
      action: 'Add an evidence-backed Risk Assessment and a reviewed mitigation path.',
      sourceRef: node.data.evidenceRef,
    }]
  })
  const actionable = items.filter((item) => item.kind === 'risk' && !['low', 'unknown'].includes(item.severity))
  return {
    items,
    actionable: actionable.length,
    needsVerification: items.filter((item) => item.kind === 'verification').length,
    critical: items.filter((item) => item.kind === 'risk' && item.severity === 'critical').length,
    high: items.filter((item) => item.kind === 'risk' && item.severity === 'high').length,
    coverageGaps: items.filter((item) => item.kind === 'coverage-gap').length,
  }
}

export function riskItemsForDomain(overview: RiskImpactOverview, domain: 'all' | RiskDomain) {
  return domain === 'all' ? overview.items : overview.items.filter((item) => item.domain === domain)
}
