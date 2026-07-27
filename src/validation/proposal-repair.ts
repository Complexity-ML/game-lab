import type { Edge } from '@xyflow/react'
import { canConnectCardKinds } from '../domain/card-compatibility'
import { applyProposal, type AgentProposal, type PipelineNode } from '../domain/pipeline'

function uniqueId(base: string, used: Set<string>) {
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

export function repairMonitorWorkBranches(
  proposal: AgentProposal,
  currentNodes: PipelineNode[],
  currentEdges: Edge[],
): { repairedMonitors: string[] } {
  const preview = applyProposal(currentNodes, currentEdges, proposal)
  const edgeIds = new Set(preview.edges.map((edge) => edge.id))
  const priority = new Map([['query', 0], ['source', 1], ['profile', 2], ['analysis', 3], ['impact', 4], ['risk', 5], ['validation', 6]])
  const repairedMonitors: string[] = []

  for (const monitor of preview.nodes.filter((node) => node.data.kind === 'monitor')) {
    if (preview.edges.some((edge) => edge.source === monitor.id && edge.sourceHandle !== 'feedback')) continue
    const feedback = preview.edges.find((edge) => edge.target === monitor.id && edge.sourceHandle === 'feedback')
    if (!feedback) continue
    const candidate = preview.nodes
      .filter((node) => node.id !== monitor.id && canConnectCardKinds('monitor', node.data.kind))
      .sort((left, right) => (priority.get(left.data.kind) ?? 100) - (priority.get(right.data.kind) ?? 100))[0]
    if (!candidate) continue
    proposal.addedEdges.push({ id: uniqueId(`e-${monitor.id}-${candidate.id}`, edgeIds), source: monitor.id, target: candidate.id, type: 'elastic' })
    repairedMonitors.push(monitor.id)
  }

  if (repairedMonitors.length) {
    proposal.summary = `${proposal.summary} GAME LAB connected ${repairedMonitors.length} Live Monitor${repairedMonitors.length === 1 ? '' : 's'} to the next bounded game-evidence step.`
  }
  return { repairedMonitors }
}
