import type { Edge } from '@xyflow/react'
import type { AgentRunTraceStep, CardKind, PipelineNode } from './pipeline'

export interface CardRoleContract {
  role: string
  mission: string
  activation: string
  completion: string
  input: string
  output: string
  allowedTools: string[]
}

export const cardRoleContracts: Record<CardKind, CardRoleContract> = {
  control: {
    role: 'GAME LAB autonomous controller',
    mission: 'Persist the operator objective, resume approved play and monitor an idle game.',
    activation: 'Host-owned whenever the autonomous player exists; keep exactly one controller outside the action path.',
    completion: 'The objective, review-resume policy and idle-monitor policy are versioned.',
    input: 'OperatorPolicy + VersionMemory + PlayerState',
    output: 'BoundedGameObjective',
    allowedTools: [],
  },
  explorer: {
    role: 'Private world exploration coordinator',
    mission: 'Inspect the bounded nearby world from the current structured observation.',
    activation: 'Use when a mission needs nearby blocks, entities or locations.',
    completion: 'Relevant world facts are captured with a resumable checkpoint.',
    input: 'AuthorizedWorld + PreviousCheckpoint',
    output: 'WorldCoverage + EvidenceGaps',
    allowedTools: ['world.observe'],
  },
  worker: {
    role: 'Bounded mission worker',
    mission: 'Process deterministic game work in branch-only batches.',
    activation: 'Use for at least two independent mission, incident or recovery tasks.',
    completion: 'Every item completes, fails with evidence or checkpoints before atomic merge.',
    input: 'MissionWorkItems + PreviousCheckpoint',
    output: 'CompletedItems + FailedItems + WorkerCheckpoint',
    allowedTools: [],
  },
  query: {
    role: 'Game telemetry query',
    mission: 'Read one bounded observation, telemetry or replay signal.',
    activation: 'Use when the current graph needs a signal absent from its latest snapshot.',
    completion: 'The read returns bounded evidence or an explicit bridge failure.',
    input: 'GameBridge + ObservationScope + Timeout',
    output: 'BoundedGameEvidence | BridgeFailure',
    allowedTools: ['observation.read'],
  },
  server: {
    role: 'Private game server',
    mission: 'Anchor an owned or authorized private server and its operational telemetry.',
    activation: 'Use as the root of a Server Ops or Agent Arena path.',
    completion: 'Platform, endpoint, health, players, latency and action policy are versioned.',
    input: 'AuthorizedServerEndpoint',
    output: 'ServerState + GameCheckpoint',
    allowedTools: ['server.health', 'server.resources', 'server.players.aggregate'],
  },
  agent: {
    role: 'Reviewed game agent',
    mission: 'Observe the game, plan one bounded step and issue only allowlisted actions.',
    activation: 'Use for a test player on an owned or authorized private server.',
    completion: 'Objective, action trace, confidence, safety state and emergency stop are explicit.',
    input: 'GameObservation + Objective + ActionAllowlist',
    output: 'ActionTrace + ActionReceipt + SafetyState',
    allowedTools: ['world.observe', 'agent.act.allowlisted', 'agent.stop'],
  },
  source: {
    role: 'Game evidence source',
    mission: 'Bind an observation, log, metric, event or replay to its provenance.',
    activation: 'Use when a game path needs supporting evidence beyond the server snapshot.',
    completion: 'Identity, authorization, evidence window and freshness are versioned.',
    input: 'Observation | Log | Metric | Event | Replay',
    output: 'GameEvidenceSource',
    allowedTools: ['observation.read', 'telemetry.read', 'replay.read'],
  },
  profile: {
    role: 'Telemetry snapshot memory',
    mission: 'Keep a compact reusable game-state snapshot.',
    activation: 'Use after a source or query produces evidence later cards must reuse.',
    completion: 'Scope, coverage, freshness and safety signals are versioned.',
    input: 'GameEvidenceSource[]',
    output: 'VersionedTelemetrySnapshot',
    allowedTools: ['observation.read'],
  },
  analysis: {
    role: 'Game analysis',
    mission: 'Diagnose a server incident or score one agent replay.',
    activation: 'Use when fresh structured evidence supports a bounded finding.',
    completion: 'Each finding names its evidence window, confidence and limitation.',
    input: 'TelemetrySnapshot | ReplayEvidence',
    output: 'GameFindings + CoverageGaps',
    allowedTools: ['observation.read', 'replay.read'],
  },
  impact: {
    role: 'Player and mission impact analyst',
    mission: 'Bound effects on players, missions, world state and server resources.',
    activation: 'Use after analysis produces a material game finding.',
    completion: 'Every impact is reproducible and unknown effects remain explicit.',
    input: 'GameFindings',
    output: 'GameImpactReport + RecoveryPriorities',
    allowedTools: ['observation.read'],
  },
  risk: {
    role: 'Operational and game-safety risk assessor',
    mission: 'Separate confirmed risk from stale or unavailable observations.',
    activation: 'Use after analysis or impact exposes a material finding.',
    completion: 'Scope, severity, confidence, freshness, affected targets and action are declared.',
    input: 'GameEvidence + GameFindings + GameImpactReport',
    output: 'GameRiskContext + RecommendedAction',
    allowedTools: ['observation.read', 'replay.read'],
  },
  patch: {
    role: 'Server recovery planner',
    mission: 'Describe one reversible recovery or protection overlay without executing it.',
    activation: 'Use only when fresh analysis supports a concrete private-server action.',
    completion: 'Expected result, rollback and approval are explicit.',
    input: 'GameRiskContext + GameImpactReport',
    output: 'VersionedRecoveryPlan',
    allowedTools: [],
  },
  monitor: {
    role: 'Game checkpoint monitor',
    mission: 'Start one bounded iteration only when the game checkpoint changes.',
    activation: 'Use after a stable result should be watched for a new observation.',
    completion: 'Checkpoint fingerprint, cooldown and iteration limit are armed.',
    input: 'CurrentCheckpoint + PreviousCheckpoint',
    output: 'NoChange | BoundedIterationTrigger | HumanAlert',
    allowedTools: ['observation.read'],
  },
  parallel: {
    role: 'Parallel mission orchestrator',
    mission: 'Run independent game branches with isolated context.',
    activation: 'Use when two or more independent incidents or mission tasks can progress concurrently.',
    completion: 'Every branch returns a reviewed diff or bounded failure.',
    input: 'CompletedPredecessor + ImmutableGameEvidence',
    output: 'ReviewedBranchDiff[]',
    allowedTools: [],
  },
  diagram: {
    role: 'Incident branch merger',
    mission: 'Relate parallel game-incident paths on one canvas.',
    activation: 'Use when at least two incident paths must be understood together.',
    completion: 'Every input path and conflict is visible.',
    input: 'ReviewedBranchDiff[] + IncidentTimeline',
    output: 'IncidentWorkstreamDiagram',
    allowedTools: [],
  },
  split: {
    role: 'Action outcome router',
    mission: 'Route an explicit approved or quarantine outcome.',
    activation: 'Use for a real mutually exclusive game-safety decision.',
    completion: 'Both handles lead to explicit valid behavior.',
    input: 'GameFindings',
    output: 'ApprovedBranch | QuarantineBranch',
    allowedTools: [],
  },
  decision: {
    role: 'Agent decision',
    mission: 'Choose the smallest supported action or request a human.',
    activation: 'Use when evidence supports multiple bounded gameplay choices.',
    completion: 'One supported action or one review checkpoint is selected.',
    input: 'ApprovedBranch + GameFindings',
    output: 'ReviewedActionProposal',
    allowedTools: ['observation.read'],
  },
  transform: {
    role: 'Action transformer',
    mission: 'Normalize observation units or allowlisted action arguments.',
    activation: 'Use when a game contract needs a deterministic conversion before action.',
    completion: 'Inputs, outputs, invariants and rollback are versioned.',
    input: 'VersionedGameInput + ApprovedTransformRule',
    output: 'VersionedGameContract',
    allowedTools: [],
  },
  review: {
    role: 'Human approval gate',
    mission: 'Pause execution until a human approves the complete action diff.',
    activation: 'Use for material gameplay actions, high risk or uncertainty.',
    completion: 'Decision, rationale and diff identity are persisted.',
    input: 'ReviewedActionProposal',
    output: 'ApprovedChange | RejectedChange',
    allowedTools: [],
  },
  validation: {
    role: 'Atomic game-safety validator',
    mission: 'Run every game contract and stop on a blocking finding.',
    activation: 'Use after a patch, transform, decision or review and before Game Result.',
    completion: 'All checks pass or identify the exact repair.',
    input: 'VersionedGameState + SafetyPolicy + ExpectedPostConditions',
    output: 'ValidationResult',
    allowedTools: [],
  },
  output: {
    role: 'Game result',
    mission: 'Emit only a validated mission result, decision or action receipt.',
    activation: 'Use as the terminal card of a reviewed game path.',
    completion: 'The result references its inputs, checkpoint and review state.',
    input: 'ValidatedGameResult',
    output: 'MissionResult | DecisionRecord | ActionReceipt',
    allowedTools: [],
  },
}

function edgePriority(edge: Edge) {
  if (edge.sourceHandle === 'feedback') return 3
  if (edge.sourceHandle === 'approved') return 0
  if (edge.sourceHandle === 'quarantine') return 2
  return 1
}

export function planPrimaryAgentRoute(nodes: PipelineNode[], edges: Edge[]): PipelineNode[] {
  const executableNodes = nodes.filter((node) => node.data.kind !== 'profile' && node.data.kind !== 'control')
  const iterationEdges = edges.filter((edge) => edge.sourceHandle !== 'feedback')
  const byId = new Map(executableNodes.map((node) => [node.id, node]))
  const incoming = new Set(iterationEdges.map((edge) => edge.target))
  const sources = executableNodes
    .filter((node) => node.data.kind === 'source' || node.data.kind === 'server' || !incoming.has(node.id))
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y)
  const route: PipelineNode[] = []
  const visited = new Set<string>()
  let current: PipelineNode | undefined = sources[0]

  while (current && !visited.has(current.id)) {
    route.push(current)
    visited.add(current.id)
    const nextEdge = iterationEdges
      .filter((edge) => edge.source === current!.id && byId.has(edge.target))
      .sort((left, right) => edgePriority(left) - edgePriority(right)
        || (byId.get(left.target)?.position.x ?? 0) - (byId.get(right.target)?.position.x ?? 0)
        || (byId.get(left.target)?.position.y ?? 0) - (byId.get(right.target)?.position.y ?? 0))[0]
    current = nextEdge ? byId.get(nextEdge.target) : undefined
  }

  return route
}

export function traceStep(node: PipelineNode, state: AgentRunTraceStep['state'], summary: string): AgentRunTraceStep {
  return { nodeId: node.id, label: node.data.label, role: cardRoleContracts[node.data.kind].role, state, summary }
}
