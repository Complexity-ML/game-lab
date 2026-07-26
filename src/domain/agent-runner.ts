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
    mission: 'Persist the operator objective, start the governed route, resume after approved reviews, and enter monitoring when the graph is stable.',
    activation: 'Host-owned whenever the autonomous player exists; keep exactly one controller outside dataset lineage.',
    completion: 'The objective, review-resume policy and idle-monitor policy are versioned and inspectable.',
    input: 'OperatorPolicy + VersionMemory + PlayerState',
    output: 'BoundedAgentObjective',
    allowedTools: [],
  },
  explorer: {
    role: 'Private world exploration coordinator',
    mission: 'Discover authorized servers, resources and gameplay surfaces in bounded batches and preserve a resumable checkpoint.',
    activation: 'Use when no private server is bound or the operator explicitly requests authorized environment discovery.',
    completion: 'Each discovered surface has stable identity and provenance, or a checkpoint records the exact coverage gap.',
    input: 'AuthorizedEnvironment + PreviousWorldCheckpoint',
    output: 'WorldCoverage + ResourceFingerprints + EvidenceGaps',
    allowedTools: ['server.search', 'server.resources'],
  },
  worker: {
    role: 'Bounded execution worker',
    mission: 'Process one deterministic batch with branch-only context, preserve a replayable checkpoint, and return an atomically mergeable result for exploration, risk, incident or patch workflows.',
    activation: 'Use when at least two independent deterministic work items can execute without sharing mutable branch state.',
    completion: 'Every work item is completed, failed with evidence, or checkpointed for bounded retry before one atomic merge.',
    input: 'TypedWorkItems + PreviousWorkerCheckpoint',
    output: 'CompletedItems + FailedItems + WorkerCheckpoint',
    allowedTools: [],
  },
  query: {
    role: 'Registered telemetry query',
    mission: 'Read a bounded server, resource, player-aggregate or replay signal through an inspectable read-only contract.',
    activation: 'Use when the current graph needs telemetry that is not already present in a versioned snapshot.',
    completion: 'The query returns bounded evidence or an explicit collection failure without raw private player data.',
    input: 'RegisteredConnector + QueryScope + Timeout',
    output: 'BoundedTelemetry | CollectionFailure',
    allowedTools: ['telemetry.read', 'replay.read'],
  },
  server: {
    role: 'Private game server',
    mission: 'Anchor an authorized FiveM, RedM or generic server with bounded health, player and resource telemetry.',
    activation: 'Use as the root of a Server Ops or Agent Arena branch after the operator authorizes the endpoint.',
    completion: 'Platform, endpoint, health, player capacity, latency, resources and command policy are versioned.',
    input: 'AuthorizedServerEndpoint',
    output: 'ServerState + TelemetryFingerprint',
    allowedTools: ['server.health', 'server.resources', 'server.players.aggregate'],
  },
  agent: {
    role: 'Governed game agent',
    mission: 'Observe a private game world, plan one bounded objective and issue only allowlisted actions with an immediate emergency stop.',
    activation: 'Use for an NPC or test-player evaluation on an owned or explicitly authorized private server.',
    completion: 'Objective, observation window, action trace, confidence, safety state and replay reference are recorded.',
    input: 'PrivateWorldObservation + Objective + ActionAllowlist',
    output: 'ActionTrace + ReplayEvidence + SafetyState',
    allowedTools: ['world.observe', 'agent.act.allowlisted', 'agent.stop'],
  },
  source: {
    role: 'Game evidence loader',
    mission: 'Bind logs, metrics, resource manifests, aggregate session events or replay evidence and preserve provenance.',
    activation: 'Use when the private-game branch needs supporting evidence beyond its Game Server snapshot.',
    completion: 'Source identity, authorization, evidence type, freshness and bounded contract are versioned.',
    input: 'Log | Metric | Resource | AggregateSession | Replay evidence',
    output: 'GameEvidenceSource',
    allowedTools: ['telemetry.read', 'replay.read'],
  },
  profile: {
    role: 'Telemetry snapshot memory',
    mission: 'Normalize server, resource, aggregate session and replay signals into a compact replayable snapshot.',
    activation: 'Use after one or more evidence sources produce signals that later stages should reuse.',
    completion: 'A versioned snapshot records scope, coverage, freshness and gaps without private raw player data.',
    input: 'GameEvidenceSource[] + TelemetryPolicy',
    output: 'VersionedTelemetrySnapshot',
    allowedTools: ['telemetry.read', 'replay.read'],
  },
  analysis: {
    role: 'Game incident and replay analyst',
    mission: 'Diagnose server health, resource failures and session regressions or score one agent replay.',
    activation: 'Use when bounded telemetry or replay evidence supports a defensible finding.',
    completion: 'Each finding names the server or agent, evidence window, severity and limitation.',
    input: 'VersionedTelemetrySnapshot | ReplayEvidence',
    output: 'GameFindings + CoverageGaps',
    allowedTools: ['telemetry.read', 'replay.read'],
  },
  impact: {
    role: 'Player and mission impact analyst',
    mission: 'Quantify affected players, sessions, resources, mission outcomes and recovery time.',
    activation: 'Use after analysis produces a bounded population and fresh evidence.',
    completion: 'Every impact is reproducible and unknown player-level effects remain explicitly unknown.',
    input: 'GameFindings + AggregateSessionEvidence',
    output: 'PlayerImpactReport + RecoveryPriorities',
    allowedTools: ['telemetry.read'],
  },
  risk: {
    role: 'Operational and agent-safety risk assessor',
    mission: 'Classify reliability, operational, gameplay-safety and collection risk while separating missing telemetry from confirmed impact.',
    activation: 'Use after analysis or impact exposes a material finding or evidence gap.',
    completion: 'Scope, severity, confidence, evidence freshness, affected players or mission and action are declared.',
    input: 'TelemetrySnapshot + GameFindings + PlayerImpactReport',
    output: 'GameRiskContext + Severity + Confidence + RecommendedAction',
    allowedTools: ['telemetry.read', 'replay.read'],
  },
  patch: {
    role: 'Server recovery planner',
    mission: 'Create one deterministic, reversible, allowlisted server recovery without silently executing it.',
    activation: 'Use only when Analysis, Impact or Risk supports a concrete and reviewable private-server action.',
    completion: 'The proposal names the affected resource or policy, expected result, rollback and approval.',
    input: 'GameRiskContext + PlayerImpactReport',
    output: 'VersionedRecoveryPlan',
    allowedTools: [],
  },
  monitor: {
    role: 'Evidence change monitor',
    mission: 'Start a new bounded atomic iteration only when a versioned connector evidence fingerprint changes or severity increases.',
    activation: 'Use after a stable validated branch has an Output whose evidence should be watched for later change.',
    completion: 'The monitor is armed with a fingerprint, cooldown and maximum iterations; unchanged evidence remains idle.',
    input: 'CurrentEvidence + PreviousEvidenceFingerprint',
    output: 'NoChange | BoundedIterationTrigger | HumanAlert',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  parallel: {
    role: 'Parallel branch orchestrator',
    mission: 'Delegate independent graph branches with branch-only context, observe usage, and merge proposal diffs only after atomic validation.',
    activation: 'Use when two or more sources, incidents or independent work groups can progress without waiting on the same branch state.',
    completion: 'Every branch returns a reviewed diff or bounded failure and the merge preserves conflicts instead of silently choosing one result.',
    input: 'CompletedPredecessor + ImmutableSharedEvidence',
    output: 'ReviewedBranchDiff[]',
    allowedTools: [],
  },
  diagram: {
    role: 'Incident branch merger',
    mission: 'Relate parallel incident subgraphs, surface conflicts, and expose one atomically reviewable merged diagram.',
    activation: 'Use when at least two incident or parallel-agent branches must be understood together on the same canvas.',
    completion: 'The diagram names every input branch, preserves conflicts and exposes one reviewable merged workstream.',
    input: 'ReviewedBranchDiff[] + IncidentTimeline',
    output: 'IncidentWorkstreamDiagram',
    allowedTools: [],
  },
  split: {
    role: 'Policy router',
    mission: 'Choose the governed branch from an explicit, inspectable rule.',
    activation: 'Use when one evidence result must follow mutually exclusive approved and quarantine outcomes.',
    completion: 'Both approved and quarantine handles are connected to explicit, valid downstream behavior.',
    input: 'AnalysisFindings',
    output: 'ApprovedBranch | QuarantineBranch',
    allowedTools: [],
  },
  decision: {
    role: 'Decision agent',
    mission: 'Choose the smallest supported correction or request a human when confidence is insufficient.',
    activation: 'Use when evidence supports multiple bounded actions, a correction-vs-escalation choice, or an uncertainty threshold.',
    completion: 'Exactly one supported correction path or one Human Review checkpoint is selected with its evidence.',
    input: 'ApprovedBranch + AnalysisFindings',
    output: 'ReviewedChangeProposal',
    allowedTools: ['entity.read', 'schema.read', 'lineage.read'],
  },
  transform: {
    role: 'Versioned deterministic transformer',
    mission: 'Declare a deterministic derived-data or metadata transformation while preserving source identity and never mutating the governed source implicitly.',
    activation: 'Use when the correction genuinely requires a new derived contract such as cast, normalization, mask, tokenization or aggregation beyond a graph-only alias patch.',
    completion: 'Inputs, outputs, invariants and rollback behavior are versioned and ready for atomic post-condition validation.',
    input: 'VersionedInputContract + ApprovedTransformRule',
    output: 'VersionedDerivedContract',
    allowedTools: [],
  },
  review: {
    role: 'Human approval gate',
    mission: 'Pause autonomous execution until a named human approves the complete diff.',
    activation: 'Use for high/critical risk, sensitive-data boundary changes, external mutations or material uncertainty; block only the affected branch.',
    completion: 'The human decision, rationale and approved diff identity are persisted so approval resumes and rejection repairs the same branch.',
    input: 'ReviewedChangeProposal',
    output: 'ApprovedChange | RejectedChange',
    allowedTools: [],
  },
  validation: {
    role: 'Atomic validator',
    mission: 'Run every independent contract and stop on any blocking finding.',
    activation: 'Use after any patch, transform, decision or review and before an Output can claim a governed result.',
    completion: 'Every applicable atomic invariant passes, or blockers identify the exact card and repairable contract.',
    input: 'VersionedBranchState + GovernancePolicy + ExpectedPostConditions',
    output: 'ValidationResult',
    allowedTools: [],
  },
  output: {
    role: 'Governed publisher',
    mission: 'Emit only a fully validated governed result and its version lineage without implying that source data was changed.',
    activation: 'Use as the terminal card for a validated report, decision, query receipt, derived contract or other governed branch result.',
    completion: 'The emitted result references its validated inputs, version and review state and is eligible for monitoring feedback.',
    input: 'ValidatedGovernedResult',
    output: 'VersionedArtifact | DecisionRecord | QueryReceipt',
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
    const currentId: string = current.id
    const nextEdge: Edge | undefined = iterationEdges
      .filter((edge) => edge.source === currentId && byId.has(edge.target))
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
