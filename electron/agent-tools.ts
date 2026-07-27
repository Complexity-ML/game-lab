import { gameQueryRuleError, proposalCardCompatibility, riskAssessmentRuleError, validateProposal, workerPolicyError, worldExplorerRuleError, type ProposalCardKind, type ValidatedProposal, type ValidatedProposalAction } from './proposal-contract.js'

type JsonRecord = Record<string, unknown>
type ToolStatus = 'read' | 'accepted' | 'rejected'

export interface AgentToolTrace {
  tool: string
  status: ToolStatus
  summary: string
}

const kinds = ['control', 'explorer', 'worker', 'query', 'server', 'agent', 'source', 'profile', 'analysis', 'impact', 'risk', 'patch', 'monitor', 'parallel', 'diagram', 'split', 'decision', 'transform', 'review', 'validation', 'output'] as const
const nullableText = { type: ['string', 'null'] }
const objectSchema = (properties: JsonRecord) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
})

export const agentToolDefinitions = [
  {
    type: 'function',
    name: 'list_card_kinds',
    description: 'Read every GAME LAB card role, activation condition, definition of done, compatibility and current evidence-driven recommendation before planning.',
    strict: true,
    parameters: objectSchema({}),
  },
  {
    type: 'function',
    name: 'inspect_graph',
    description: 'Read the current private-game graph, Game Bridge runtime and every action already queued in this planning turn. Call before changing an existing graph.',
    strict: true,
    parameters: objectSchema({ node_ids: { type: 'array', items: { type: 'string' }, maxItems: 24 } }),
  },
  {
    type: 'function',
    name: 'inspect_incident_context',
    description: 'Read the current host-owned incident fingerprint, lifecycle state, occurrences and affected branch. This is immutable evidence; incident writes remain owned by Electron.',
    strict: true,
    parameters: objectSchema({ incident_key: nullableText }),
  },
  {
    type: 'function',
    name: 'add_card',
    description: 'Queue one complete GAME LAB card. The host supplies safe defaults for nullable metadata. Human Review becomes a resumable branch checkpoint.',
    strict: true,
    parameters: objectSchema({
      node_id: { type: 'string' },
      kind: { type: 'string', enum: kinds },
      label: nullableText,
      description: nullableText,
      owner: nullableText,
      rule: nullableText,
      reason: { type: 'string' },
    }),
  },
  {
    type: 'function',
    name: 'update_card',
    description: 'Queue a bounded edit to one existing card. At least one nullable patch field must be non-null.',
    strict: true,
    parameters: objectSchema({
      node_id: { type: 'string' },
      kind: { type: ['string', 'null'], enum: [...kinds, null] },
      label: nullableText,
      description: nullableText,
      owner: nullableText,
      rule: nullableText,
      reason: { type: 'string' },
    }),
  },
  {
    type: 'function',
    name: 'queue_game_action',
    description: 'Queue one allowlisted action for an existing Game Agent card against the exact current observation checkpoint. In autonomous-mission mode, one low-risk action may finish without Human Review; combat, entity interaction, routes and vehicles still require review.',
    strict: true,
    parameters: objectSchema({
      node_id: { type: 'string' },
      game_action: { type: 'string', enum: ['move_to', 'follow_route', 'interact', 'enter_vehicle', 'exit_vehicle', 'navigate_to', 'jump', 'mine_block', 'place_block', 'craft_item', 'equip_item', 'attack_entity', 'use_item', 'wait', 'stop'] },
      checkpoint_id: { type: 'string' },
      target_x: { type: ['number', 'null'] },
      target_y: { type: ['number', 'null'] },
      target_z: { type: ['number', 'null'] },
      entity_id: nullableText,
      route_id: nullableText,
      interaction: nullableText,
      duration_ms: { type: ['number', 'null'] },
      item_name: nullableText,
      block_name: nullableText,
      count: { type: ['number', 'null'] },
      face: { type: ['string', 'null'], enum: ['up', 'down', 'north', 'south', 'east', 'west', null] },
      max_distance: { type: ['number', 'null'] },
      reason: { type: 'string' },
    }),
  },
  {
    type: 'function',
    name: 'connect_cards',
    description: 'Queue one connection. Use approved/quarantine only from Split and feedback only from Output to Live Monitor; otherwise use null.',
    strict: true,
    parameters: objectSchema({
      source: { type: 'string' },
      target: { type: 'string' },
      source_handle: { type: ['string', 'null'], enum: ['approved', 'quarantine', 'feedback', null] },
      reason: { type: 'string' },
    }),
  },
  {
    type: 'function',
    name: 'remove_connection',
    description: 'Queue removal of one existing connection by its exact edge id.',
    strict: true,
    parameters: objectSchema({ edge_id: { type: 'string' }, reason: { type: 'string' } }),
  },
  {
    type: 'function',
    name: 'validate_plan',
    description: 'Validate the queued virtual graph diff. Read and repair every rejection before finish_plan.',
    strict: true,
    parameters: objectSchema({}),
  },
  {
    type: 'function',
    name: 'finish_plan',
    description: 'Finish exactly once after validation. The host assembles and validates the final strict proposal; no graph mutation is executed here.',
    strict: true,
    parameters: objectSchema({
      title: { type: 'string' },
      summary: { type: 'string' },
      rationale: { type: 'string' },
      requires_human_review: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      writeback: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    }),
  },
] as const

interface CardPlanningContract {
  role: string
  activation: string
  completion: string
}

const cardRoles: Record<ProposalCardKind, CardPlanningContract> = {
  control: {
    role: 'Persist the autonomous objective and player resume/monitor policy.',
    activation: 'Use exactly one host-owned controller whenever Player is enabled; never connect it to the action path.',
    completion: 'Objective, on_review and on_idle policies are versioned.',
  },
  explorer: {
    role: 'Inspect the bounded nearby world from structured Game Bridge observations.',
    activation: 'Use when the mission needs nearby blocks, entities or locations from the current checkpoint.',
    completion: 'The relevant world facts are summarized without inventing coordinates or entities.',
  },
  worker: {
    role: 'Process deterministic independent work in bounded branch-only batches.',
    activation: 'Use only for two or more independent mission, incident, risk or action work items.',
    completion: 'Every item completed, failed with evidence or checkpointed before atomic merge.',
  },
  query: {
    role: 'Read one host-registered bounded telemetry or replay contract.',
    activation: 'Use when the graph lacks a required server, resource, aggregate session or replay signal.',
    completion: 'The read yields bounded evidence or an explicit collection failure without private raw player data.',
  },
  server: {
    role: 'Represent one owned or authorized private game server and its bounded operational telemetry.',
    activation: 'Use as the root of a Server Ops or Agent Arena branch after the endpoint is explicitly authorized.',
    completion: 'Platform, endpoint, health, players, latency, resource state and command policy are versioned.',
  },
  agent: {
    role: 'Represent one AI-controlled NPC or test player constrained to an authorized private server.',
    activation: 'Use when a private evaluation needs an observable objective and allowlisted gameplay actions.',
    completion: 'Objective, observation scope, action allowlist, confidence, replay reference and emergency stop are explicit.',
  },
  source: {
    role: 'Resolve logs, metrics, resource manifests, events or replay evidence.',
    activation: 'Use when a private-game branch needs supporting evidence beyond its Game Server snapshot.',
    completion: 'Source identity, authorization, provenance and evidence window are fresh and versioned.',
  },
  profile: {
    role: 'Keep compact server, resource, aggregate session or replay evidence without private raw player data.',
    activation: 'Use when a source or telemetry query produced evidence that later cards must reuse.',
    completion: 'A host-verified snapshot records freshness, coverage, telemetry and safety-relevant signals.',
  },
  analysis: {
    role: 'Diagnose a server incident or score one agent replay.',
    activation: 'Use when bounded server or replay evidence needs classification.',
    completion: 'Each finding names the server or agent, evidence window, confidence and limitation.',
  },
  impact: {
    role: 'Quantify affected players, sessions, resources, missions and recovery time.',
    activation: 'Use when fresh telemetry or replay evidence supports a bounded impact.',
    completion: 'Operational and safety impact is bounded and ranked without inventing player-level facts.',
  },
  risk: {
    role: 'Classify operational, reliability, gameplay-safety or collection risk from versioned evidence.',
    activation: 'Use after Analysis or Impact exposes a material private-game finding or evidence gap.',
    completion: 'Server or agent scope, severity, confidence, evidence, affected players or mission and action are declared.',
  },
  patch: {
    role: 'Describe a reversible graph-only compatibility or protection overlay.',
    activation: 'Use only for a concrete mismatch supported by Analysis, Impact or Risk.',
    completion: 'The exact overlay is versioned and exposes a testable post-condition without source mutation.',
  },
  monitor: {
    role: 'Trigger a bounded iteration only when evidence changes.',
    activation: 'Use after a stable Output should be watched for a new fingerprint or higher severity.',
    completion: 'Fingerprint, cooldown and maximum iterations are armed; unchanged evidence stays idle.',
  },
  parallel: {
    role: 'Release independent branch-only agent work and merge reviewed diffs.',
    activation: 'Use when at least two independent sources, incidents or work groups can progress concurrently.',
    completion: 'Every branch returns a reviewed diff or bounded failure and conflicts remain visible.',
  },
  diagram: {
    role: 'Merge parallel incident branches into one reviewable workstream.',
    activation: 'Use when two or more incident branches must be understood together.',
    completion: 'Every input branch and conflict is represented in the merged diagram.',
  },
  split: {
    role: 'Route through explicit approved and quarantine outcomes.',
    activation: 'Use only for a real mutually exclusive policy decision.',
    completion: 'Both handles lead to explicit valid downstream behavior.',
  },
  decision: {
    role: 'Choose a supported correction or request human review.',
    activation: 'Use for a bounded correction-versus-escalation or uncertainty choice.',
    completion: 'Exactly one evidence-backed correction or one review checkpoint is selected.',
  },
  transform: {
    role: 'Declare deterministic normalization of observations, telemetry units or allowlisted actions.',
    activation: 'Use when evidence or action contracts must be normalized before a game decision.',
    completion: 'Inputs, outputs, invariants and rollback behavior are ready for atomic validation without hidden commands.',
  },
  review: {
    role: 'Pause one affected branch and persist a human decision.',
    activation: 'Use for high/critical risk, sensitive boundaries, external mutation or material uncertainty.',
    completion: 'Decision, rationale and diff identity are persisted for resume or repair.',
  },
  validation: {
    role: 'Run applicable atomic contracts and post-conditions.',
    activation: 'Use after any patch, transform, decision or review and before Game Result.',
    completion: 'All atoms pass or blockers identify the exact repairable contract.',
  },
  output: {
    role: 'Emit a validated mission result, decision or action receipt.',
    activation: 'Use as the terminal result of a useful validated branch.',
    completion: 'Result references its validated inputs, version and review state and may feed a monitor.',
  },
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function text(value: unknown, maximum: number): string | null {
  if (value === null) return null
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result ? result.slice(0, maximum) : null
}

function requiredText(value: unknown, label: string, maximum: number): string {
  const result = text(value, maximum)
  if (!result) throw new Error(`${label} is required`)
  return result
}

function proposalWith(actions: ValidatedProposalAction[], metadata: Partial<ValidatedProposal> = {}) {
  return {
    title: metadata.title ?? 'Validate queued graph tools',
    summary: metadata.summary ?? 'Validate the current virtual graph diff.',
    rationale: metadata.rationale ?? 'Every queued action must satisfy the bounded GAME LAB proposal contract.',
    requires_human_review: metadata.requires_human_review ?? false,
    confidence: metadata.confidence ?? 1,
    writeback: metadata.writeback ?? 'Commit locally only after explicit approval.',
    evidence: metadata.evidence ?? [],
    actions,
  }
}

function graph(payload: unknown) {
  const root = record(payload)
  const value = record(root.graph)
  return {
    nodes: Array.isArray(value.nodes) ? value.nodes.map(record) : [],
    edges: Array.isArray(value.edges) ? value.edges.map(record) : [],
  }
}

export class AgentToolSession {
  readonly trace: AgentToolTrace[] = []
  private readonly actions: ValidatedProposalAction[] = []
  private cardKindsListed = false
  private validatedActionCount?: number
  private finishedProposal?: ValidatedProposal

  constructor(private readonly payload: unknown) {}

  get finished() { return Boolean(this.finishedProposal) }
  get proposal() { return this.finishedProposal }
  private get reviewAssistantMode() { return record(this.payload).mode === 'review-assistant' }

  private result(tool: string, status: ToolStatus, summary: string, detail: JsonRecord = {}) {
    this.trace.push({ tool, status, summary })
    return { ok: status !== 'rejected', status, summary, ...detail }
  }

  private reject(tool: string, error: unknown) {
    const summary = error instanceof Error ? error.message : String(error)
    return this.result(tool, 'rejected', summary)
  }

  private validateCandidate(tool: string, action: ValidatedProposalAction) {
    if (this.reviewAssistantMode) throw new Error('Human Review assistant is read-only; graph actions are unavailable')
    const candidate = [...this.actions, action]
    validateProposal(proposalWith(candidate, { requires_human_review: this.includesReview(candidate) }), this.payload)
    this.actions.push(action)
    this.validatedActionCount = undefined
    return this.result(tool, 'accepted', `${action.type} queued`, { action })
  }

  private includesReview(actions = this.actions) {
    const existingReviews = new Set(graph(this.payload).nodes.filter((node) => node.kind === 'review').map((node) => node.id))
    return actions.some((action) => action.kind === 'review' || (action.type === 'update_card' && Boolean(action.node_id && existingReviews.has(action.node_id))))
  }

  private kindOf(nodeId: string): ProposalCardKind | undefined {
    const queued = [...this.actions].reverse().find((action) =>
      (action.type === 'add_card' || action.type === 'update_card') && action.node_id === nodeId && action.kind)
    if (queued?.kind) return queued.kind
    const node = graph(this.payload).nodes.find((candidate) => candidate.id === nodeId)
    return kinds.includes(node?.kind as ProposalCardKind) ? node?.kind as ProposalCardKind : undefined
  }

  private normalizedRule(kind: ProposalCardKind, value: unknown): string | null {
    const supplied = text(value, 2_000)
    if (kind === 'control') return supplied ?? 'objective=operate authorized private game | mode=autonomous_mission | loop=observe_act_verify | action_budget=96 | on_review=sensitive_only | on_idle=continue | emergency_stop=required'
    if (kind === 'review') return supplied ?? 'checkpoint=branch | on_approve=resume_next_iteration | on_reject=repair_loop'
    if (kind === 'parallel') return supplied ?? 'max_concurrency=3 | context=branch_only | merge=atomic'
    if (kind === 'explorer') return supplied ?? 'scope=nearby_world | checkpoint=versioned | resume=true'
    if (kind === 'worker') return supplied ?? 'role=generic | batch_size=4 | max_concurrency=4 | retry=checkpoint | context=branch_only | merge=atomic'
    if (kind === 'query') return supplied ?? 'source=game_bridge | operation=observation.read | mode=read_only | timeout_ms=8000'
    if (kind === 'risk') return supplied ?? 'scope=private_game | risk_domain=general | risk_type=none | severity=unknown | confidence=0 | evidence=unavailable | affected_assets=0 | action=read_fresh_game_observation'
    if (kind === 'monitor') {
      let rule = supplied ?? ''
      const seen = new Set<string>()
      rule = rule.split(/\s*\|\s*/).filter(Boolean).filter((clause) => {
        const key = /^cooldown\s*=/i.test(clause)
          ? 'cooldown'
          : /^max_iterations\s*=/i.test(clause)
            ? 'max_iterations'
            : /^on_change[=(](?:game_checkpoint|game_checkpoint\))/i.test(clause)
              ? 'on_change'
              : clause
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).join(' | ')
      const clauses: string[] = []
      if (!/on_change[=(](?:game_checkpoint|game_checkpoint\))/i.test(rule)) clauses.push('on_change=game_checkpoint')
      if (!/cooldown\s*=\s*\d+\s*(?:s|m|h)?\b/i.test(rule)) clauses.push('cooldown=60s')
      if (!/max_iterations=\d+/i.test(rule)) clauses.push('max_iterations=10')
      if (clauses.length) rule = [rule, ...clauses].filter(Boolean).join(' | ')
      return rule
    }
    return supplied
  }

  execute(tool: string, rawArguments: unknown): JsonRecord {
    if (this.finished) return this.result(tool, 'rejected', 'The plan is already finished')
    const args = record(rawArguments)
    try {
      if (tool === 'list_card_kinds') {
        this.cardKindsListed = true
        const activationPlan = new Map(
          (Array.isArray(record(this.payload).cardActivationPlan)
            ? record(this.payload).cardActivationPlan as unknown[]
            : []).map(record).flatMap((item) =>
            typeof item.kind === 'string' ? [[item.kind, item] as const] : []),
        )
        return this.result(tool, 'read', `${kinds.length} card kinds available`, {
          cards: kinds.map((kind) => ({
            kind,
            role: cardRoles[kind].role,
            activation: cardRoles[kind].activation,
            completion: cardRoles[kind].completion,
            current_state: activationPlan.get(kind)?.state ?? 'available',
            current_reason: activationPlan.get(kind)?.reason ?? 'No host activation recommendation was supplied.',
            accepts_from: kinds.filter((source) => proposalCardCompatibility[source].includes(kind)),
            connects_to: proposalCardCompatibility[kind],
            source_handles: kind === 'split' ? ['approved', 'quarantine'] : kind === 'output' ? ['feedback'] : [],
          })),
          connection_policy: {
            sidecars: ['control', 'explorer'],
            evidence_start: 'server, agent or source',
            feedback: 'output.feedback -> monitor',
          },
          game_policy: {
            checkpoint_bound_actions: true,
            gameplay_mode: record(record(this.payload).autonomyPolicy).gameplay ?? 'review-each-action',
            one_action_per_autonomous_checkpoint: true,
            sensitive_actions_require_review: true,
            private_servers_only: true,
          },
        })
      }
      if (tool === 'inspect_graph') {
        const requested = Array.isArray(args.node_ids) ? new Set(args.node_ids.filter((id): id is string => typeof id === 'string')) : new Set<string>()
        const current = graph(this.payload)
        return this.result(tool, 'read', `${current.nodes.length} cards and ${current.edges.length} edges inspected`, {
          graph: {
            nodes: requested.size ? current.nodes.filter((node) => requested.has(String(node.id))) : current.nodes,
            edges: current.edges,
          },
          source_scope: record(record(this.payload).sourceScope),
          autonomy_policy: record(record(this.payload).autonomyPolicy),
          game_runtime: record(record(this.payload).gameRuntime),
          queued_actions: this.actions,
        })
      }
      if (tool === 'inspect_incident_context') {
        const root = record(this.payload)
        const incidents = Array.isArray(root.incidentContext) ? root.incidentContext.map(record) : []
        const incidentKey = text(args.incident_key, 180)
        const selected = incidentKey ? incidents.filter((incident) => incident.incidentKey === incidentKey) : incidents
        return this.result(tool, 'read', `${selected.length} host-owned incident record(s) inspected`, {
          incidents: selected.slice(0, 24),
          policy: 'Read-only evidence. Electron fingerprints, deduplicates and records transitions; agent tools may only queue a graph diff.',
        })
      }
      if (tool === 'add_card') {
        const kind = requiredText(args.kind, 'kind', 32) as ProposalCardKind
        if (!kinds.includes(kind)) throw new Error('Unknown GAME LAB card kind')
        const rule = this.normalizedRule(kind, args.rule)
        if (kind === 'patch' && !rule?.startsWith('graph_only:')) throw new Error('Compatibility Patch rule must begin with graph_only:')
        if (kind === 'risk') {
          const error = riskAssessmentRuleError(rule)
          if (error) throw new Error(error)
        }
        if (kind === 'worker') {
          const error = workerPolicyError(rule)
          if (error) throw new Error(error)
        }
        if (kind === 'query') {
          const error = gameQueryRuleError(rule)
          if (error) throw new Error(error)
        }
        if (kind === 'explorer') {
          const error = worldExplorerRuleError(rule)
          if (error) throw new Error(error)
        }
        if (kind === 'monitor' && (!rule?.includes('on_change=game_checkpoint') || !rule.includes('cooldown=') || !rule.includes('max_iterations='))) {
          throw new Error('Live Monitor requires on_change=game_checkpoint, cooldown and max_iterations')
        }
        if (kind === 'parallel' && (!rule?.includes('context=branch_only') || !rule.includes('merge=atomic'))) {
          throw new Error('Parallel Agents requires context=branch_only and merge=atomic')
        }
        if (kind === 'control' && (!rule?.includes('objective=') || !rule.includes('on_review=') || !rule.includes('on_idle='))) {
          throw new Error('GAME LAB Control requires objective, on_review and on_idle policies')
        }
        return this.validateCandidate(tool, {
          type: 'add_card',
          node_id: requiredText(args.node_id, 'node_id', 120),
          kind,
          label: text(args.label, 120),
          description: text(args.description, 500),
          owner: text(args.owner, 120),
          rule,
          source: null,
          target: null,
          source_handle: null,
          game_action: null,
          game_action_args: null,
          checkpoint_id: null,
          reason: requiredText(args.reason, 'reason', 500),
        })
      }
      if (tool === 'update_card') {
        const kind = text(args.kind, 32) as ProposalCardKind | null
        if (kind && !kinds.includes(kind)) throw new Error('Unknown GAME LAB card kind')
        const nodeId = requiredText(args.node_id, 'node_id', 120)
        const label = text(args.label, 120)
        const description = text(args.description, 500)
        const owner = text(args.owner, 120)
        const effectiveKind = kind ?? this.kindOf(nodeId)
        const suppliedRule = text(args.rule, 2_000)
        const rule = effectiveKind === 'monitor'
          ? suppliedRule ? this.normalizedRule('monitor', suppliedRule) : null
          : kind ? this.normalizedRule(kind, args.rule) : suppliedRule
        if (effectiveKind === 'risk' && suppliedRule) {
          const error = riskAssessmentRuleError(rule)
          if (error) throw new Error(error)
        }
        if (effectiveKind === 'worker' && suppliedRule) {
          const error = workerPolicyError(rule)
          if (error) throw new Error(error)
        }
        if (effectiveKind === 'query' && suppliedRule) {
          const error = gameQueryRuleError(rule)
          if (error) throw new Error(error)
        }
        if (effectiveKind === 'explorer' && suppliedRule) {
          const error = worldExplorerRuleError(rule)
          if (error) throw new Error(error)
        }
        if (!kind && !label && !description && !owner && !rule) throw new Error('update_card requires at least one changed field')
        return this.validateCandidate(tool, {
          type: 'update_card',
          node_id: nodeId,
          kind,
          label,
          description,
          owner,
          rule,
          source: null,
          target: null,
          source_handle: null,
          game_action: null,
          game_action_args: null,
          checkpoint_id: null,
          reason: requiredText(args.reason, 'reason', 500),
        })
      }
      if (tool === 'queue_game_action') {
        const nodeId = requiredText(args.node_id, 'node_id', 120)
        if (this.kindOf(nodeId) !== 'agent') throw new Error('queue_game_action requires an existing Game Agent card')
        const gameAction = requiredText(args.game_action, 'game_action', 40) as ValidatedProposalAction['game_action']
        if (!['move_to', 'follow_route', 'interact', 'enter_vehicle', 'exit_vehicle', 'navigate_to', 'jump', 'mine_block', 'place_block', 'craft_item', 'equip_item', 'attack_entity', 'use_item', 'wait', 'stop'].includes(gameAction ?? '')) throw new Error('Unknown or unsafe game action')
        return this.validateCandidate(tool, {
          type: 'game_action',
          node_id: nodeId,
          kind: null,
          label: null,
          description: null,
          owner: null,
          rule: null,
          source: null,
          target: null,
          source_handle: null,
          game_action: gameAction,
          game_action_args: {
            target_x: typeof args.target_x === 'number' ? args.target_x : null,
            target_y: typeof args.target_y === 'number' ? args.target_y : null,
            target_z: typeof args.target_z === 'number' ? args.target_z : null,
            entity_id: text(args.entity_id, 120),
            route_id: text(args.route_id, 120),
            interaction: text(args.interaction, 120),
            duration_ms: typeof args.duration_ms === 'number' ? args.duration_ms : null,
            item_name: text(args.item_name, 120),
            block_name: text(args.block_name, 120),
            count: typeof args.count === 'number' ? args.count : null,
            face: text(args.face, 12) as NonNullable<ValidatedProposalAction['game_action_args']>['face'],
            max_distance: typeof args.max_distance === 'number' ? args.max_distance : null,
          },
          checkpoint_id: requiredText(args.checkpoint_id, 'checkpoint_id', 120),
          reason: requiredText(args.reason, 'reason', 500),
        })
      }
      if (tool === 'connect_cards') {
        const source = requiredText(args.source, 'source', 120)
        const target = requiredText(args.target, 'target', 120)
        const sourceHandle = text(args.source_handle, 24)
        if (sourceHandle && !['approved', 'quarantine', 'feedback'].includes(sourceHandle)) throw new Error('Unknown connection handle')
        if ((sourceHandle === 'approved' || sourceHandle === 'quarantine') && this.kindOf(source) !== 'split') {
          throw new Error(`${sourceHandle} is valid only on an edge leaving a Split card`)
        }
        if (sourceHandle === 'feedback' && (this.kindOf(source) !== 'output' || this.kindOf(target) !== 'monitor')) {
          throw new Error('feedback is valid only from Output to Live Monitor')
        }
        return this.validateCandidate(tool, {
          type: 'add_edge',
          node_id: null,
          kind: null,
          label: null,
          description: null,
          owner: null,
          rule: null,
          source,
          target,
          source_handle: sourceHandle,
          game_action: null,
          game_action_args: null,
          checkpoint_id: null,
          reason: requiredText(args.reason, 'reason', 500),
        })
      }
      if (tool === 'remove_connection') {
        return this.validateCandidate(tool, {
          type: 'remove_edge',
          node_id: requiredText(args.edge_id, 'edge_id', 120),
          kind: null,
          label: null,
          description: null,
          owner: null,
          rule: null,
          source: null,
          target: null,
          source_handle: null,
          game_action: null,
          game_action_args: null,
          checkpoint_id: null,
          reason: requiredText(args.reason, 'reason', 500),
        })
      }
      if (tool === 'validate_plan') {
        const proposal = validateProposal(proposalWith(this.actions, { requires_human_review: this.includesReview() }), this.payload)
        this.validatedActionCount = proposal.actions.length
        return this.result(tool, 'read', `${proposal.actions.length} queued action(s) satisfy the proposal contract`, {
          action_count: proposal.actions.length,
          game_checkpoint_policy: record(record(this.payload).autonomyPolicy).gameplay === 'autonomous-mission'
            ? 'One low-risk gameplay action may execute per fresh checkpoint; sensitive actions remain behind Human Review.'
            : 'Every gameplay action must match the fresh Game Bridge checkpoint and remain behind Human Review.',
        })
      }
      if (tool === 'finish_plan') {
        if (this.reviewAssistantMode && this.actions.length) throw new Error('Human Review assistant must finish with zero graph actions')
        if (!this.reviewAssistantMode && !this.cardKindsListed) throw new Error('Call list_card_kinds before finishing the plan')
        if (!this.reviewAssistantMode && this.validatedActionCount !== this.actions.length) throw new Error('Call validate_plan after the last queued change before finishing the plan')
        const proposal = validateProposal(proposalWith(this.actions, {
          title: requiredText(args.title, 'title', 160),
          summary: requiredText(args.summary, 'summary', 800),
          rationale: requiredText(args.rationale, 'rationale', 1_600),
          requires_human_review: args.requires_human_review === true,
          confidence: typeof args.confidence === 'number' ? args.confidence : Number.NaN,
          writeback: requiredText(args.writeback, 'writeback', 800),
          evidence: Array.isArray(args.evidence) ? args.evidence.map((item) => requiredText(item, 'evidence', 500)) : [],
        }), this.payload)
        this.finishedProposal = proposal
        return this.result(tool, 'accepted', `Plan finished with ${proposal.actions.length} validated action(s)`)
      }
      return this.result(tool, 'rejected', `Unknown agent tool: ${tool}`)
    } catch (error) {
      return this.reject(tool, error)
    }
  }
}
