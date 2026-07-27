import type { Edge, Node } from '@xyflow/react'
import type { GameActionCommand } from './game-bridge'
import type { GameEvidence } from './game-evidence'
import { scenarioPresets } from './presets'
import { defaultRiskAssessmentRule } from './risk-assessment'
import { defaultWorkerPolicy, workerPolicyRule } from './worker-policy'

export type CardKind = 'control' | 'explorer' | 'worker' | 'query' | 'server' | 'agent' | 'source' | 'profile' | 'analysis' | 'impact' | 'risk' | 'patch' | 'monitor' | 'parallel' | 'diagram' | 'split' | 'decision' | 'transform' | 'review' | 'validation' | 'output'
export type PipelineStatus = 'healthy' | 'warning' | 'blocked' | 'draft'

export interface GameServerTelemetry {
  platform: 'Minecraft' | 'FiveM' | 'RedM' | 'Generic'
  state: 'online' | 'degraded' | 'offline' | 'maintenance'
  endpoint: string
  playersOnline: number
  playerCapacity: number
  latencyMs: number
  cpuPercent: number
  memoryMb: number
  resourcesRunning: number
  resourcesFailed: number
}

export interface GameAgentTelemetry {
  mode: 'npc' | 'test-player' | 'operator'
  state: 'idle' | 'observing' | 'planning' | 'acting' | 'blocked'
  objective: string
  safetyMode: 'private-server-only'
  confidence: number
  lastAction?: string
}

export interface SchemaField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'timestamp'
  tags?: string[]
}

export interface PipelineNodeData extends Record<string, unknown> {
  kind: CardKind
  label: string
  description: string
  owner: string
  status: PipelineStatus
  schema: SchemaField[]
  evidenceRef?: string
  patchScope?: 'graph-only'
  monitorMode?: 'event-loop'
  parallelMode?: 'branch-fanout'
  diagramMode?: 'incident-workstream'
  controlMode?: 'autonomous-player'
  explorerMode?: 'world-scan'
  workerMode?: 'bounded-execution'
  serverTelemetry?: GameServerTelemetry
  agentTelemetry?: GameAgentTelemetry
  rule?: string
  agentAdded?: boolean
  pinned?: boolean
  runState?: 'idle' | 'running' | 'completed' | 'waiting' | 'failed' | 'stopped'
  runSequence?: number
  runFingerprint?: string
}

export type PipelineNode = Node<PipelineNodeData, 'pipeline'>

export interface AgentRunTraceStep {
  nodeId: string
  label: string
  role: string
  state: 'completed' | 'waiting' | 'failed' | 'stopped'
  summary: string
}

export interface AgentProposal {
  id: string
  incidentKey?: string
  title: string
  summary: string
  rationale: string
  addedNodes: PipelineNode[]
  updatedNodes: { nodeId: string; patch: Partial<PipelineNodeData>; reason: string }[]
  addedEdges: Edge[]
  removedEdgeIds: string[]
  gameActions?: Array<GameActionCommand & { agentNodeId: string; reason: string }>
  evidenceReads: string[]
  evidence?: GameEvidence[]
  writeback: string
  requiresHumanReview?: boolean
  confidence?: number
  model?: string
  runTrace?: AgentRunTraceStep[]
  toolTrace?: { tool: string; status: 'read' | 'accepted' | 'rejected'; summary: string }[]
}

export const cardLabels: Record<CardKind, string> = {
  control: 'GAME Controller',
  explorer: 'World Explorer',
  worker: 'Mission Worker',
  query: 'Telemetry Query',
  server: 'Game Server',
  agent: 'Game Agent',
  source: 'Game Evidence',
  profile: 'Telemetry Snapshot',
  analysis: 'Game Analysis',
  impact: 'Player Impact',
  risk: 'Operational Risk',
  patch: 'Server Action',
  monitor: 'Live Monitor',
  parallel: 'Parallel Agents',
  diagram: 'Incident Diagram',
  split: 'Decision Split',
  decision: 'Agent Decision',
  transform: 'Action Transform',
  review: 'Human Review',
  validation: 'Safety Check',
  output: 'Game Result',
}

export const initialNodes: PipelineNode[] = []
export const initialEdges: Edge[] = []

export type PipelinePresetId = 'empty' | 'server-ops' | 'agent-arena'

export function loadPipelinePreset(preset: PipelinePresetId): { title: string; nodes: PipelineNode[]; edges: Edge[] } {
  if (preset === 'empty') return { title: 'Untitled pipeline', nodes: [], edges: [] }
  const selected = scenarioPresets[preset]
  return {
    title: selected.title,
    nodes: selected.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        schema: node.data.schema.map((field) => ({ ...field, tags: field.tags ? [...field.tags] : undefined })),
        serverTelemetry: node.data.serverTelemetry ? { ...node.data.serverTelemetry } : undefined,
        agentTelemetry: node.data.agentTelemetry ? { ...node.data.agentTelemetry } : undefined,
      },
    })),
    edges: selected.edges.map((edge) => ({ ...edge })),
  }
}

export function applyProposal(nodes: PipelineNode[], edges: Edge[], proposal: AgentProposal): { nodes: PipelineNode[]; edges: Edge[] } {
  const removed = new Set(proposal.removedEdgeIds)
  const updates = new Map(proposal.updatedNodes.map((update) => [update.nodeId, update.patch]))
  const updated = nodes.map((node) => {
    const patch = updates.get(node.id)
    return patch ? { ...node, data: { ...node.data, ...patch, status: 'healthy' as const, agentAdded: false } } : node
  })
  const nextEdges = [...edges.filter((edge) => !removed.has(edge.id) && !proposal.addedEdges.some((added) => added.id === edge.id)), ...proposal.addedEdges]
  const nextNodes = [...updated.filter((node) => !proposal.addedNodes.some((added) => added.id === node.id)), ...proposal.addedNodes.map((node) => ({ ...node, data: { ...node.data, status: 'healthy' as const, agentAdded: false } }))]
  return prunePipelineGraph(nextNodes, nextEdges, proposal.addedNodes.map((node) => node.id))
}

const hostStarterKinds = new Set<CardKind>(['control', 'explorer', 'worker'])
const floatingEvidenceKinds = new Set<CardKind>(['source', 'profile'])

function orphanIdentity(node: PipelineNode) {
  const evidenceRef = node.data.evidenceRef?.trim().toLowerCase()
  return evidenceRef ? `${node.data.kind}:${evidenceRef}` : `${node.data.kind}:${node.data.label.trim().toLowerCase()}`
}

export function pruneOrphanedCards(nodes: PipelineNode[], edges: Edge[], strictNodeIds: Iterable<string> = []): PipelineNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  const connected = new Set(validEdges.flatMap((edge) => [edge.source, edge.target]))
  const strict = new Set(strictNodeIds)
  const connectedNodes = nodes.filter((node) => connected.has(node.id))
  const connectedIdentities = new Set(connectedNodes.map(orphanIdentity))
  const overlapsConnectedCard = (node: PipelineNode) => connectedNodes.some((candidate) => (
    candidate.id !== node.id
    && Math.abs(candidate.position.x - node.position.x) <= 4
    && Math.abs(candidate.position.y - node.position.y) <= 4
  ))
  return nodes.filter((node) => {
    if (hostStarterKinds.has(node.data.kind) || connected.has(node.id)) return true
    if (connectedIdentities.has(orphanIdentity(node))) return false
    if (floatingEvidenceKinds.has(node.data.kind) && overlapsConnectedCard(node)) return false
    if (floatingEvidenceKinds.has(node.data.kind)) return true
    return !strict.has(node.id)
  })
}

export function prunePipelineGraph(nodes: PipelineNode[], edges: Edge[], strictNodeIds: Iterable<string> = []): { nodes: PipelineNode[]; edges: Edge[] } {
  const prunedNodes = pruneOrphanedCards(nodes, edges, strictNodeIds)
  const keptNodeIds = new Set(prunedNodes.map((node) => node.id))
  return {
    nodes: prunedNodes,
    edges: edges.filter((edge) => keptNodeIds.has(edge.source) && keptNodeIds.has(edge.target)),
  }
}

export function newCard(kind: CardKind, index: number): PipelineNode {
  const id = `${kind}-${Date.now()}-${index}`
  return {
    id,
    type: 'pipeline',
    position: { x: 120 + (index % 3) * 290, y: 120 + Math.floor(index / 3) * 190 },
    data: {
      kind,
      label: `New ${cardLabels[kind]}`,
      description: kind === 'server'
        ? 'Connect a private game server and expose bounded operational telemetry.'
        : kind === 'agent'
          ? 'Configure an AI-controlled NPC or test player for a private server.'
          : 'Configure this game card in the inspector.',
      owner: 'Unassigned',
      status: 'draft',
      schema: [],
      rule: kind === 'split'
        ? 'condition = true'
        : kind === 'impact'
          ? 'scope=mission | rank=players,world,server | action=review'
          : kind === 'risk'
            ? defaultRiskAssessmentRule
            : kind === 'patch'
              ? 'graph_only: action=allowlisted | rollback=required'
              : kind === 'monitor'
                ? 'on_change=game_checkpoint | cooldown=60s | max_iterations=10'
                : kind === 'parallel'
                  ? 'max_concurrency=3 | context=branch_only | merge=atomic'
                  : kind === 'diagram'
                    ? 'group=incident | inputs=parallel_diffs | merge=atomic'
                    : kind === 'control'
                      ? 'objective=play safely | mode=autonomous | on_review=checkpoint_and_resume'
                      : kind === 'explorer'
                        ? 'scope=nearby_world | checkpoint=versioned | resume=true'
                        : kind === 'worker'
                          ? workerPolicyRule(defaultWorkerPolicy)
                          : kind === 'query'
                            ? 'source=game_bridge | operation=observation.read | mode=read_only'
                            : kind === 'server'
                              ? 'transport=read_only | scope=private_server | health=required | commands=reviewed'
                              : kind === 'agent'
                                ? 'environment=private_server | observe=telemetry | act=allowlist | emergency_stop=required'
                                : undefined,
      patchScope: kind === 'patch' ? 'graph-only' : undefined,
      monitorMode: kind === 'monitor' ? 'event-loop' : undefined,
      parallelMode: kind === 'parallel' ? 'branch-fanout' : undefined,
      diagramMode: kind === 'diagram' ? 'incident-workstream' : undefined,
      controlMode: kind === 'control' ? 'autonomous-player' : undefined,
      explorerMode: kind === 'explorer' ? 'world-scan' : undefined,
      workerMode: kind === 'worker' ? 'bounded-execution' : undefined,
      serverTelemetry: kind === 'server' ? {
        platform: 'Minecraft',
        state: 'maintenance',
        endpoint: '127.0.0.1:25565',
        playersOnline: 0,
        playerCapacity: 8,
        latencyMs: 0,
        cpuPercent: 0,
        memoryMb: 0,
        resourcesRunning: 0,
        resourcesFailed: 0,
      } : undefined,
      agentTelemetry: kind === 'agent' ? {
        mode: 'test-player',
        state: 'idle',
        objective: 'Complete one bounded Minecraft mission',
        safetyMode: 'private-server-only',
        confidence: 0,
      } : undefined,
    },
  }
}
