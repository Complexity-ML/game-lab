import type { Edge } from '@xyflow/react'
import type { AgentProposal, CardKind, PipelineNode, PipelineNodeData } from './pipeline'
import type { GameActionType } from './game-bridge'

export type ApiProvider = 'openai' | 'anthropic' | 'moonshot'
export type ActiveAiSource = 'chatgpt' | ApiProvider
export type AiModel = string
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Verbosity = 'low' | 'medium' | 'high'
export type ServiceTier = 'auto' | 'priority'
export interface ModelCapabilities { reasoning: boolean; verbosity: boolean; serviceTier: boolean; deprecated: boolean }
export interface ProviderModelOption { id: string; label: string; capabilities: ModelCapabilities }

export interface AiSettings {
  provider: ApiProvider
  model: AiModel
  reasoningEffort: ReasoningEffort
  verbosity: Verbosity
  serviceTier: ServiceTier
}

export interface AiStatus {
  connected: boolean
  credentialSource: 'environment' | 'encrypted' | 'none'
  selectedProvider: ApiProvider
  providers: Record<ApiProvider, { connected: boolean; credentialSource: 'environment' | 'encrypted' | 'none'; model: string; catalog: ProviderModelOption[]; catalogRefreshedAt?: string; capabilities: ModelCapabilities; modelUnavailable: boolean }>
  encryptionAvailable: boolean
  settings: AiSettings
}

export interface ChatGPTModelOption { id: string; label: string; description?: string; efforts: string[]; defaultEffort?: string; isDefault: boolean }
export interface ChatGPTSessionStatus { available: boolean; connected: boolean; email?: string; planType?: string; models?: ChatGPTModelOption[]; selectedModel?: string; selectedEffort?: string; error?: string }

interface AiAction {
  type: 'add_card' | 'update_card' | 'add_edge' | 'remove_edge' | 'game_action'
  node_id: string | null
  kind: CardKind | null
  label: string | null
  description: string | null
  owner: string | null
  rule: string | null
  source: string | null
  target: string | null
  source_handle: string | null
  game_action?: GameActionType | null
  game_action_args?: {
    target_x: number | null
    target_y: number | null
    target_z: number | null
    entity_id: string | null
    route_id: string | null
    interaction: string | null
    duration_ms: number | null
    item_name: string | null
    block_name: string | null
    count: number | null
    face: 'up' | 'down' | 'north' | 'south' | 'east' | 'west' | null
    max_distance: number | null
  } | null
  checkpoint_id?: string | null
  reason: string
}

interface AiProposalContract {
  title: string
  summary: string
  rationale: string
  requires_human_review: boolean
  confidence: number
  writeback: string
  evidence: string[]
  actions: AiAction[]
}

export interface AiProposalResponse {
  proposal: AiProposalContract
  model: string
  usage?: unknown
  toolTrace?: { tool: string; status: 'read' | 'accepted' | 'rejected'; summary: string }[]
}

const kinds = new Set<CardKind>(['control', 'explorer', 'worker', 'query', 'server', 'agent', 'source', 'profile', 'analysis', 'impact', 'risk', 'patch', 'monitor', 'parallel', 'diagram', 'split', 'decision', 'transform', 'review', 'validation', 'output'])

function identifier(value: string, fallback: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return clean || fallback
}

function text(value: unknown, fallback = '', limit = 800) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : fallback
}

function completeMonitorRule(value: unknown, fallback?: unknown) {
  let rule = text(value, text(fallback, '', 2_000), 2_000)
  const seen = new Set<string>()
  rule = rule.split(/\s*\|\s*/).filter(Boolean).filter((clause) => {
    const key = /^cooldown\s*=/i.test(clause)
      ? 'cooldown'
      : /^max_iterations\s*=/i.test(clause)
        ? 'max_iterations'
        : /^on_change\(metadata_fingerprint\)/i.test(clause)
          ? 'on_change'
          : clause
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(' | ')
  const clauses: string[] = []
  if (!/on_change\(metadata_fingerprint\)/i.test(rule)) clauses.push('on_change(metadata_fingerprint)')
  if (!/cooldown\s*=\s*\d+\s*(?:s|m|h)?\b/i.test(rule)) clauses.push('cooldown=60s')
  if (!/max_iterations=\d+/i.test(rule)) clauses.push('max_iterations=10')
  if (clauses.length) rule = [rule, ...clauses].filter(Boolean).join(' | ')
  return rule
}

function nodePatch(action: AiAction, current?: PipelineNodeData): Partial<PipelineNodeData> {
  const patch: Partial<PipelineNodeData> = { status: 'draft', agentAdded: true }
  const actionKind = action.kind && kinds.has(action.kind) ? action.kind : undefined
  const effectiveKind = actionKind ?? current?.kind
  if (actionKind) patch.kind = actionKind
  if (effectiveKind === 'patch') patch.patchScope = 'graph-only'
  if (effectiveKind === 'monitor') patch.monitorMode = 'event-loop'
  if (effectiveKind === 'parallel') patch.parallelMode = 'branch-fanout'
  if (effectiveKind === 'diagram') patch.diagramMode = 'incident-workstream'
  if (effectiveKind === 'control') patch.controlMode = 'autonomous-player'
  if (effectiveKind === 'explorer') patch.explorerMode = 'world-scan'
  if (effectiveKind === 'worker') patch.workerMode = 'bounded-execution'
  if (text(action.label)) patch.label = text(action.label, '', 120)
  if (text(action.description)) patch.description = text(action.description, '', 500)
  if (text(action.owner)) patch.owner = text(action.owner, '', 120)
  if (effectiveKind === 'monitor') patch.rule = completeMonitorRule(action.rule, current?.kind === 'monitor' ? current.rule : undefined)
  else if (effectiveKind === 'explorer') patch.rule = text(action.rule, current?.kind === 'explorer' ? current.rule : 'scope=nearby_world | checkpoint=versioned | resume=true', 2_000)
  else if (effectiveKind === 'worker') patch.rule = text(action.rule, current?.kind === 'worker' ? current.rule : 'role=generic | batch_size=4 | max_concurrency=4 | retry=checkpoint | context=branch_only | merge=atomic', 2_000)
  else if (effectiveKind === 'query') patch.rule = text(action.rule, current?.kind === 'query' ? current.rule : 'source=game_bridge | operation=observation.read | mode=read_only | timeout_ms=8000', 2_000)
  else if (text(action.rule)) patch.rule = text(action.rule, '', 2_000)
  return patch
}

export function materializeAiProposal(response: AiProposalResponse, nodes: PipelineNode[], edges: Edge[]): AgentProposal {
  const contract = response.proposal
  if (!contract || !Array.isArray(contract.actions)) throw new Error('The AI response does not match the GAME LAB proposal contract')

  const knownNodeIds = new Set(nodes.map((node) => node.id))
  const knownNodeKinds = new Map(nodes.map((node) => [node.id, node.data.kind]))
  const knownEdgeIds = new Set(edges.map((edge) => edge.id))
  const idAliases = new Map<string, string>()
  const addedNodes: PipelineNode[] = []
  const updatedNodes: AgentProposal['updatedNodes'] = []
  const addedEdges: Edge[] = []
  const removedEdgeIds: string[] = []
  const gameActions: NonNullable<AgentProposal['gameActions']> = []
  const rightmost = nodes.reduce((maximum, node) => Math.max(maximum, node.position.x), 0)

  for (const [index, action] of contract.actions.slice(0, 20).entries()) {
    if (action.type !== 'add_card') continue
    if (!action.kind || !kinds.has(action.kind)) continue
    const alias = text(action.node_id, `agent-card-${index + 1}`, 80)
    let id = identifier(alias, `agent-card-${index + 1}`)
    while (knownNodeIds.has(id)) id = `${id}-${index + 1}`
    knownNodeIds.add(id)
    idAliases.set(alias, id)
    addedNodes.push({
      id,
      type: 'pipeline',
      position: { x: rightmost + 300 + (index % 3) * 285, y: 90 + Math.floor(index / 3) * 190 },
      data: {
        kind: action.kind,
        label: text(action.label, `Agent ${action.kind}`, 120),
        description: text(action.description, 'Agent-proposed card awaiting human review.', 500),
        owner: text(action.owner, 'GAME LAB Agent', 120),
        rule: action.kind === 'monitor'
          ? completeMonitorRule(action.rule)
          : action.kind === 'explorer'
            ? text(action.rule, 'scope=nearby_world | checkpoint=versioned | resume=true', 2_000)
            : action.kind === 'worker'
              ? text(action.rule, 'role=generic | batch_size=4 | max_concurrency=4 | retry=checkpoint | context=branch_only | merge=atomic', 2_000)
              : action.kind === 'query'
                ? text(action.rule, 'source=game_bridge | operation=observation.read | mode=read_only | timeout_ms=8000', 2_000)
            : text(action.rule, undefined, 2_000) || undefined,
        status: 'draft',
        schema: [],
        agentAdded: true,
        patchScope: action.kind === 'patch' ? 'graph-only' : undefined,
        monitorMode: action.kind === 'monitor' ? 'event-loop' : undefined,
        parallelMode: action.kind === 'parallel' ? 'branch-fanout' : undefined,
        diagramMode: action.kind === 'diagram' ? 'incident-workstream' : undefined,
        controlMode: action.kind === 'control' ? 'autonomous-player' : undefined,
        explorerMode: action.kind === 'explorer' ? 'world-scan' : undefined,
        workerMode: action.kind === 'worker' ? 'bounded-execution' : undefined,
      },
    })
  }

  const resolveNode = (value: string | null) => {
    const candidate = text(value, '', 80)
    return idAliases.get(candidate) ?? (knownNodeIds.has(candidate) ? candidate : undefined)
  }

  for (const [index, action] of contract.actions.slice(0, 20).entries()) {
    if (action.type === 'update_card') {
      const nodeId = resolveNode(action.node_id)
      const current = nodes.find((node) => node.id === nodeId)
      if (nodeId && current) {
        updatedNodes.push({ nodeId, patch: nodePatch(action, current.data), reason: text(action.reason, 'AI-proposed card revision.', 500) })
      }
    }
    if (action.type === 'add_edge') {
      const source = resolveNode(action.source)
      const target = resolveNode(action.target)
      if (source && target && source !== target) {
        const base = `e-${identifier(source, 'source')}-${identifier(target, 'target')}`
        let id = base
        let suffix = index + 1
        while (knownEdgeIds.has(id)) id = `${base}-${suffix++}`
        knownEdgeIds.add(id)
        const sourceHandle = text(action.source_handle) || undefined
        addedEdges.push({ id, source, target, sourceHandle, type: 'elastic', label: sourceHandle === 'feedback' ? 'next iteration' : undefined })
      }
    }
    if (action.type === 'remove_edge') {
      const edgeId = text(action.node_id, '', 120)
      if (knownEdgeIds.has(edgeId)) removedEdgeIds.push(edgeId)
    }
    if (action.type === 'game_action' && action.node_id && action.game_action && action.game_action_args && action.checkpoint_id) {
      const nodeId = resolveNode(action.node_id)
      if (nodeId && knownNodeKinds.get(nodeId) === 'agent') {
        gameActions.push({
          agentNodeId: nodeId,
          commandId: `game-action-${Date.now()}-${index + 1}`,
          checkpointId: action.checkpoint_id,
          action: action.game_action,
          arguments: {
            ...(action.game_action_args.target_x !== null ? { targetX: action.game_action_args.target_x } : {}),
            ...(action.game_action_args.target_y !== null ? { targetY: action.game_action_args.target_y } : {}),
            ...(action.game_action_args.target_z !== null ? { targetZ: action.game_action_args.target_z } : {}),
            ...(action.game_action_args.entity_id ? { entityId: action.game_action_args.entity_id } : {}),
            ...(action.game_action_args.route_id ? { routeId: action.game_action_args.route_id } : {}),
            ...(action.game_action_args.interaction ? { interaction: action.game_action_args.interaction } : {}),
            ...(action.game_action_args.duration_ms !== null ? { durationMs: action.game_action_args.duration_ms } : {}),
            ...(action.game_action_args.item_name ? { itemName: action.game_action_args.item_name } : {}),
            ...(action.game_action_args.block_name ? { blockName: action.game_action_args.block_name } : {}),
            ...(action.game_action_args.count !== null ? { count: action.game_action_args.count } : {}),
            ...(action.game_action_args.face ? { face: action.game_action_args.face } : {}),
            ...(action.game_action_args.max_distance !== null ? { maxDistance: action.game_action_args.max_distance } : {}),
          },
          requestedAt: new Date().toISOString(),
          reason: text(action.reason, 'GPT queued an allowlisted game action.', 500),
        })
      }
    }
  }

  const includesHumanReviewCard = addedNodes.some((node) => node.data.kind === 'review')
    || updatedNodes.some((update) => update.patch.kind === 'review' || knownNodeKinds.get(update.nodeId) === 'review')
  if (contract.requires_human_review && !includesHumanReviewCard) {
    throw new Error('The agent requested Human Review without adding the required Human Review card. The graph was left unchanged.')
  }

  return {
    id: `ai-proposal-${Date.now()}`,
    title: text(contract.title, 'AI graph proposal', 160),
    summary: text(contract.summary, 'The connected model proposed a reviewed graph change.', 800),
    rationale: text(contract.rationale, 'Review the complete diff before applying it.', 1_600),
    requiresHumanReview: Boolean(contract.requires_human_review),
    confidence: typeof contract.confidence === 'number' ? Math.max(0, Math.min(1, contract.confidence)) : undefined,
    model: response.model,
    evidenceReads: Array.isArray(contract.evidence) ? contract.evidence.map((item) => text(item, '', 500)).filter(Boolean).slice(0, 12) : [],
    writeback: text(contract.writeback, 'Record the approved game decision and execution receipt locally.', 800),
    toolTrace: response.toolTrace?.slice(0, 96),
    addedNodes,
    updatedNodes,
    addedEdges,
    removedEdgeIds,
    gameActions,
  }
}

export function compactGraph(nodes: PipelineNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      description: node.data.description,
      owner: node.data.owner,
      rule: node.data.rule,
      evidenceRef: node.data.evidenceRef,
      schema: node.data.schema,
      serverTelemetry: node.data.serverTelemetry,
      agentTelemetry: node.data.agentTelemetry,
      execution: node.data.runState ? {
        state: node.data.runState,
        sequence: node.data.runSequence,
        checkpoint: node.data.runFingerprint,
      } : undefined,
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle })),
  }
}
