import { canConnectCardKinds } from '../domain/card-compatibility'
import type { PipelineNode } from '../domain/pipeline'
import type { ValidationAtom, ValidationIssue } from './types'

function issue(atomId: string, value: Omit<ValidationIssue, 'atomId'>): ValidationIssue {
  return { atomId, ...value }
}

function nodeMap(nodes: PipelineNode[]) {
  return new Map(nodes.map((node) => [node.id, node]))
}

export const pipelinePresenceAtom: ValidationAtom = {
  id: 'pipeline-presence',
  label: 'Pipeline presence',
  run: ({ nodes }) => nodes.length ? [] : [issue('pipeline-presence', {
    id: 'pipeline-empty',
    severity: 'error',
    title: 'No game workflow',
    detail: 'Add a private game server or start the autonomous player.',
  })],
}

export const pipelineTerminalsAtom: ValidationAtom = {
  id: 'pipeline-terminals',
  label: 'Pipeline terminals',
  run: ({ nodes, edges }) => {
    if (!nodes.length) return []
    const incoming = new Set(edges.filter((edge) => edge.sourceHandle !== 'feedback').map((edge) => edge.target))
    const outgoing = new Set(edges.filter((edge) => edge.sourceHandle !== 'feedback').map((edge) => edge.source))
    const roots = nodes.filter((node) => !incoming.has(node.id) && !['control', 'explorer', 'worker'].includes(node.data.kind))
    const terminals = nodes.filter((node) => !outgoing.has(node.id) && !['control', 'explorer', 'worker'].includes(node.data.kind))
    const findings: ValidationIssue[] = []
    if (!roots.length) findings.push(issue('pipeline-terminals', { id: 'missing-root', severity: 'error', title: 'Missing game workflow root', detail: 'Start from a Game Server, Game Agent or game evidence card.' }))
    if (!terminals.length) findings.push(issue('pipeline-terminals', { id: 'missing-terminal', severity: 'error', title: 'Missing workflow result', detail: 'End the bounded branch at Human Review, Safety Check or Game Result.' }))
    return findings
  },
}

export const edgeIntegrityAtom: ValidationAtom = {
  id: 'edge-integrity',
  label: 'Edge integrity',
  run: ({ nodes, edges }) => {
    const byId = nodeMap(nodes)
    const seen = new Set<string>()
    return edges.flatMap((edge) => {
      if (seen.has(edge.id)) return [issue('edge-integrity', { id: `duplicate-edge-${edge.id}`, severity: 'error', title: 'Duplicate connection ID', detail: `Connection ${edge.id} is duplicated.` })]
      seen.add(edge.id)
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) return [issue('edge-integrity', { id: `dangling-edge-${edge.id}`, severity: 'error', title: 'Dangling connection', detail: `Connection ${edge.id} references a missing card.` })]
      if (source.id === target.id) return [issue('edge-integrity', { id: `self-edge-${edge.id}`, severity: 'error', nodeId: source.id, title: 'Self connection', detail: 'A card cannot connect to itself.' })]
      if (!canConnectCardKinds(source.data.kind, target.data.kind, edge.sourceHandle)) return [issue('edge-integrity', { id: `incompatible-edge-${edge.id}`, severity: 'error', nodeId: target.id, title: 'Invalid game workflow connection', detail: `${source.data.kind} cannot connect to ${target.data.kind} through this handle.` })]
      return []
    })
  },
}

export const acyclicFlowAtom: ValidationAtom = {
  id: 'acyclic-flow',
  label: 'Acyclic flow',
  run: ({ nodes, edges }) => {
    const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
    for (const edge of edges) if (edge.sourceHandle !== 'feedback' && adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source)!.push(edge.target)
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true
      if (visited.has(id)) return false
      visiting.add(id)
      if (adjacency.get(id)?.some(visit)) return true
      visiting.delete(id)
      visited.add(id)
      return false
    }
    return nodes.some((node) => visit(node.id))
      ? [issue('acyclic-flow', { id: 'workflow-cycle', severity: 'error', title: 'Unbounded workflow cycle', detail: 'Only an Output → Live Monitor feedback edge may start a new bounded iteration.' })]
      : []
  },
}

export const cardContractsAtom: ValidationAtom = {
  id: 'card-contracts',
  label: 'Card contracts',
  run: ({ nodes }) => nodes.flatMap((node) => {
    const findings: ValidationIssue[] = []
    if (!node.data.label.trim()) findings.push(issue('card-contracts', { id: `label-${node.id}`, severity: 'error', nodeId: node.id, title: 'Missing card name', detail: 'Every game card needs a readable name.' }))
    if (node.data.kind === 'server' && node.data.serverTelemetry && !/private|local|127\.0\.0\.1|localhost/i.test(`${node.data.description} ${node.data.rule ?? ''} ${node.data.serverTelemetry.endpoint}`)) {
      findings.push(issue('card-contracts', { id: `server-scope-${node.id}`, severity: 'error', nodeId: node.id, title: 'Private-server scope missing', detail: 'GAME LAB controls only owned or explicitly authorized private servers.' }))
    }
    if (node.data.kind === 'agent' && node.data.agentTelemetry?.safetyMode !== 'private-server-only') {
      findings.push(issue('card-contracts', { id: `agent-safety-${node.id}`, severity: 'error', nodeId: node.id, title: 'Unsafe agent scope', detail: 'Game agents must remain private-server-only.' }))
    }
    return findings
  }),
}

export const gameActionSafetyAtom: ValidationAtom = {
  id: 'game-action-safety',
  label: 'Game action safety',
  run: ({ nodes, edges }) => {
    const byId = nodeMap(nodes)
    const incoming = (id: string) => edges.filter((edge) => edge.target === id && edge.sourceHandle !== 'feedback').map((edge) => byId.get(edge.source)).filter(Boolean) as PipelineNode[]
    return nodes.flatMap((node) => {
      if (!['patch', 'transform', 'validation', 'output'].includes(node.data.kind)) return []
      const parents = incoming(node.id)
      if ((node.data.kind === 'patch' || node.data.kind === 'transform') && !parents.some((parent) => parent.data.kind === 'review')) {
        return [issue('game-action-safety', { id: `review-before-action-${node.id}`, severity: 'error', nodeId: node.id, title: 'Human Review required before action', detail: 'A material Game Bridge action must follow a Human Review card.' })]
      }
      return []
    })
  },
}

export const gameBridgeAtom: ValidationAtom = {
  id: 'game-bridge',
  label: 'Game Bridge evidence',
  run: ({ nodes }) => nodes.flatMap((node) => {
    if (node.data.kind === 'query' && !/game_bridge|observation/i.test(node.data.rule ?? '')) {
      return [issue('game-bridge', { id: `query-bridge-${node.id}`, severity: 'error', nodeId: node.id, title: 'Unsupported telemetry query', detail: 'Telemetry Query reads only structured Game Bridge observations.' })]
    }
    if (node.data.kind === 'explorer' && node.data.explorerMode !== 'world-scan') {
      return [issue('game-bridge', { id: `explorer-mode-${node.id}`, severity: 'error', nodeId: node.id, title: 'Invalid explorer mode', detail: 'World Explorer must use the bounded world-scan mode.' })]
    }
    return []
  }),
}
