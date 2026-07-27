import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { Activity, Binoculars, Bot, Braces, BrainCircuit, ChartNetwork, CheckCircle2, CirclePause, CircleStop, CircleX, Cpu, Dices, FileDiff, FileSearch, Gamepad2, GitBranch, LayoutDashboard, LoaderCircle, Network, Radar, SearchCheck, Send, Server, ShieldAlert, Sparkles, UserCheck, WandSparkles } from 'lucide-react'
import { useEffect } from 'react'
import type { PipelineNode } from '../domain/pipeline'
import { parseRiskAssessmentRule } from '../domain/risk-assessment'
import { parseWorkerPolicy } from '../domain/worker-policy'

const icons = {
  control: Bot,
  explorer: Binoculars,
  worker: Cpu,
  query: Braces,
  server: Server,
  agent: Gamepad2,
  source: FileSearch,
  profile: Activity,
  analysis: BrainCircuit,
  impact: ChartNetwork,
  risk: ShieldAlert,
  patch: FileDiff,
  monitor: Radar,
  parallel: Network,
  diagram: LayoutDashboard,
  split: GitBranch,
  decision: Dices,
  transform: WandSparkles,
  review: UserCheck,
  validation: SearchCheck,
  output: Send,
}

function cardTextPreview(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function PipelineCard({ data, id, selected }: NodeProps<PipelineNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const Icon = icons[data.kind]
  const isSplit = data.kind === 'split'
  const isOutput = data.kind === 'output'
  const isSource = data.kind === 'source' || data.kind === 'server'
  const workerPolicy = data.kind === 'worker' ? parseWorkerPolicy(data.rule) : undefined
  const isSystem = data.kind === 'control' || data.kind === 'explorer' || workerPolicy?.role === 'exploration'
  const risk = data.kind === 'risk' ? parseRiskAssessmentRule(data.rule) : undefined
  const descriptionPreview = cardTextPreview(data.description)

  useEffect(() => {
    updateNodeInternals(id)
  }, [data.kind, id, updateNodeInternals])

  return <article className={`pipeline-card card-${data.kind} status-${data.status} run-${data.runState ?? 'idle'} ${selected ? 'is-selected' : ''}`}>
    {!isSource && !isSystem && <Handle className="pipeline-handle" position={Position.Left} type="target" />}
    <header>
      <span className="card-icon"><Icon size={16} /></span>
      <span className="card-kind">{data.kind}</span>
      {data.agentAdded && <span className="agent-badge"><Sparkles size={11} /> Agent</span>}
      {data.kind === 'patch' && <span className="patch-scope-badge">Graph only</span>}
      {data.kind === 'monitor' && <span className="monitor-mode-badge">Live loop</span>}
      {data.kind === 'parallel' && <span className="parallel-mode-badge">Fan out</span>}
      {data.kind === 'diagram' && <span className="diagram-mode-badge">Subgraph</span>}
      {data.kind === 'control' && <span className="control-mode-badge">Player</span>}
      {data.kind === 'server' && <span className="server-mode-badge">{data.serverTelemetry?.platform ?? 'Server'}</span>}
      {data.kind === 'agent' && <span className="agent-mode-badge">{data.agentTelemetry?.mode ?? 'Agent'}</span>}
      {data.kind === 'explorer' && <span className="explorer-mode-badge">World</span>}
      {workerPolicy && <span className="worker-mode-badge">{workerPolicy.role} · {workerPolicy.concurrency}×</span>}
      {data.kind === 'query' && <span className="query-mode-badge">Game read</span>}
      {risk && <span className={`risk-mode-badge severity-${risk.severity ?? 'unknown'}`}>{risk.domain} · {risk.severity ?? 'unscored'}</span>}
      {data.runState === 'running' && <span className="run-badge is-running"><LoaderCircle size={10} /> Running</span>}
      {data.runState === 'completed' && <span className="run-badge is-complete">#{data.runSequence}</span>}
      {data.runState === 'waiting' && <span className="run-badge is-waiting"><CirclePause size={10} /> Review</span>}
      {data.runState === 'failed' && <span className="run-badge is-failed"><CircleX size={10} /> Failed</span>}
      {data.runState === 'stopped' && <span className="run-badge is-stopped"><CircleStop size={10} /> Stopped</span>}
      {data.status === 'healthy' && <CheckCircle2 className="healthy-icon" size={14} />}
    </header>
    <strong>{data.label}</strong>
    <p>{descriptionPreview}</p>
    {data.serverTelemetry && <div className="server-summary" aria-label="Game server telemetry">
      <span><strong>{data.serverTelemetry.playersOnline}/{data.serverTelemetry.playerCapacity}</strong> players</span>
      <span><strong>{data.serverTelemetry.latencyMs}</strong> ms</span>
      <span><strong>{data.serverTelemetry.cpuPercent}%</strong> CPU</span>
      <span><strong>{data.serverTelemetry.resourcesFailed}</strong> failed</span>
      <small>{data.serverTelemetry.state} · {data.serverTelemetry.resourcesRunning} resources · {data.serverTelemetry.endpoint}</small>
    </div>}
    {data.agentTelemetry && <div className="agent-summary" aria-label="Game agent telemetry">
      <span><strong>{data.agentTelemetry.state}</strong> state</span>
      <span><strong>{Math.round(data.agentTelemetry.confidence * 100)}%</strong> confidence</span>
      <small>{data.agentTelemetry.objective}</small>
      <small>Safety: private server only{data.agentTelemetry.lastAction ? ` · last: ${data.agentTelemetry.lastAction}` : ''}</small>
    </div>}
    {risk && <div className="risk-summary" aria-label="Evidence-backed risk context">
      <span><strong>{risk.affectedAssets ?? '—'}</strong> affected</span>
      <span><strong>{risk.confidence === undefined ? '—' : `${Math.round(risk.confidence * 100)}%`}</strong> confidence</span>
      <span><strong>{risk.evidence ?? '—'}</strong> evidence</span>
      <span><strong>{risk.scope || '—'}</strong> scope</span>
    </div>}
    {workerPolicy && <div className="worker-summary" aria-label="Bounded worker policy">
      <span><strong>{workerPolicy.batchSize}</strong> batch</span>
      <span><strong>{workerPolicy.concurrency}</strong> concurrent</span>
      <small>{workerPolicy.context.replace('_', ' ')} · {workerPolicy.merge} merge · {workerPolicy.retry} recovery</small>
    </div>}
    {data.rule && <code>{data.rule}</code>}
    <footer>
      <span>{data.owner}</span>
      {data.evidenceRef && <span className="evidence-badge">Game Bridge</span>}
    </footer>
    {!isOutput && !isSplit && !isSystem && <Handle className="pipeline-handle" position={Position.Right} type="source" />}
    {isOutput && <>
      <Handle className="pipeline-handle output-feedback" id="feedback" position={Position.Right} type="source" />
      <span className="feedback-label">feedback</span>
    </>}
    {isSplit && <>
      <Handle className="pipeline-handle split-approved" id="approved" position={Position.Right} type="source" />
      <Handle className="pipeline-handle split-quarantine" id="quarantine" position={Position.Right} type="source" />
      <span className="split-label approved-label">approved</span>
      <span className="split-label quarantine-label">quarantine</span>
    </>}
  </article>
}
