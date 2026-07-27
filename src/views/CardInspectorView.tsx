import { AlertCircle, ArrowLeft, CheckCircle2, Focus, PanelRightClose } from 'lucide-react'
import { PanelFooterActions, PanelHeader } from '../components/shared/PanelHeader'
import { PanelScrollArea } from '../components/shared/PanelScrollArea'
import { WorkerNodeSettings } from '../components/shared/WorkerNodeSettings'
import { cardLabels, type PipelineNode } from '../domain/pipeline'
import { cardRoleContracts } from '../domain/agent-runner'
import { parseRiskAssessmentRule } from '../domain/risk-assessment'
import type { ValidationIssue } from '../validation'

interface CardInspectorViewProps {
  selected?: PipelineNode
  issues: ValidationIssue[]
  errorCount: number
  onBack?(): void
  onClose(): void
  onFocusDiagram(nodeId: string): void
  onSelectNode(nodeId: string): void
  onUpdate(patch: Partial<PipelineNode['data']>): void
  returnLabel?: string
}

export function CardInspectorView({ errorCount, issues, onBack, onClose, onFocusDiagram, onSelectNode, onUpdate, returnLabel, selected }: CardInspectorViewProps) {
  const role = selected ? cardRoleContracts[selected.data.kind] : undefined
  const risk = selected?.data.kind === 'risk' ? parseRiskAssessmentRule(selected.data.rule) : undefined
  return <>
    <PanelHeader
      action={<button aria-label="Close inspector" className="panel-toggle" onClick={onClose} title="Close inspector" type="button"><PanelRightClose size={16} /></button>}
      eyebrow="INSPECT"
      title={selected ? cardLabels[selected.data.kind] : 'Pipeline'}
    />
    <PanelScrollArea className="inspector-panel-content" label="Inspector content">
      {selected ? <div className="inspector-form">
      {selected.data.kind === 'diagram' && <section className="diagram-focus"><div><Focus size={15} /><span><strong>Incident workstream</strong><small>Frame the parallel incident branches merged by this diagram.</small></span></div><button onClick={() => onFocusDiagram(selected.id)} type="button">Focus subgraph</button></section>}
      {role && <section className="role-contract"><div><small>AGENT ROLE</small><strong>{role.role}</strong><p>{role.mission}</p></div><dl><div><dt>Starts when</dt><dd>{role.activation}</dd></div><div><dt>Done when</dt><dd>{role.completion}</dd></div><div><dt>Input</dt><dd>{role.input}</dd></div><div><dt>Output</dt><dd>{role.output}</dd></div><div><dt>Tools</dt><dd>{role.allowedTools.length ? role.allowedTools.join(' · ') : 'No external tools'}</dd></div></dl></section>}
      {selected.data.serverTelemetry && <section className="risk-context severity-low"><h3>Live server snapshot</h3><dl><div><dt>Platform</dt><dd>{selected.data.serverTelemetry.platform}</dd></div><div><dt>State</dt><dd>{selected.data.serverTelemetry.state}</dd></div><div><dt>Players</dt><dd>{selected.data.serverTelemetry.playersOnline}/{selected.data.serverTelemetry.playerCapacity}</dd></div><div><dt>Latency</dt><dd>{selected.data.serverTelemetry.latencyMs} ms</dd></div><div><dt>CPU</dt><dd>{selected.data.serverTelemetry.cpuPercent}%</dd></div><div><dt>Resources</dt><dd>{selected.data.serverTelemetry.resourcesRunning} running · {selected.data.serverTelemetry.resourcesFailed} failed</dd></div></dl><p>{selected.data.serverTelemetry.endpoint} · reviewed commands only</p></section>}
      {selected.data.agentTelemetry && <section className="risk-context severity-medium"><h3>Governed agent state</h3><dl><div><dt>Mode</dt><dd>{selected.data.agentTelemetry.mode}</dd></div><div><dt>State</dt><dd>{selected.data.agentTelemetry.state}</dd></div><div><dt>Confidence</dt><dd>{Math.round(selected.data.agentTelemetry.confidence * 100)}%</dd></div><div><dt>Safety</dt><dd>private server only</dd></div></dl><p>{selected.data.agentTelemetry.objective}{selected.data.agentTelemetry.lastAction ? ` · Last action: ${selected.data.agentTelemetry.lastAction}` : ''}</p></section>}
      {risk && <section className={`risk-context severity-${risk.severity ?? 'unknown'}`}><h3>Evidence-backed risk context</h3><dl><div><dt>Domain</dt><dd>{risk.domain}</dd></div><div><dt>Type</dt><dd>{risk.riskType ?? 'Incomplete'}</dd></div><div><dt>Severity</dt><dd>{risk.severity ?? 'Incomplete'}</dd></div><div><dt>Confidence</dt><dd>{risk.confidence === undefined ? 'Incomplete' : `${Math.round(risk.confidence * 100)}%`}</dd></div><div><dt>Evidence</dt><dd>{risk.evidence ?? 'Incomplete'}</dd></div><div><dt>Affected players/assets</dt><dd>{risk.affectedAssets ?? 'Incomplete'}</dd></div><div><dt>Scope</dt><dd>{risk.scope || 'Incomplete'}</dd></div></dl><p>{risk.riskType === 'observation' ? 'Observation reliability issue only · no game-state change is asserted.' : risk.action ? `Recommended action: ${risk.action}` : 'Recommended action is missing.'}</p></section>}
      {selected.data.kind === 'worker' && <WorkerNodeSettings node={selected} onUpdate={onUpdate} />}
      <label>Card name<input value={selected.data.label} onChange={(event) => onUpdate({ label: event.target.value })} /></label>
      <label>Description<textarea rows={3} value={selected.data.description} onChange={(event) => onUpdate({ description: event.target.value })} /></label>
      <label>Owner<input value={selected.data.owner} onChange={(event) => onUpdate({ owner: event.target.value })} /></label>
      <label className="inspector-check"><input checked={Boolean(selected.data.pinned)} onChange={(event) => onUpdate({ pinned: event.target.checked })} type="checkbox" /><span><strong>Pin manual position</strong><small>Auto-layout will route around this card without moving it.</small></span></label>
      {selected.data.rule !== undefined && selected.data.kind !== 'worker' && <label>Rule<textarea className="code-input" rows={3} value={selected.data.rule} onChange={(event) => onUpdate({ rule: event.target.value })} /></label>}
      {selected.data.schema.length > 0 && <section className="schema-list"><h3>Observation · {selected.data.schema.length} fields</h3>{selected.data.schema.map((field) => <div key={field.name}><code>{field.name}</code><span>{field.type}</span>{field.tags?.map((tag) => <em key={tag}>{tag}</em>)}</div>)}</section>}
      </div> : <p className="empty-copy">Select a card to inspect its metadata.</p>}

      <section className="validation-list">
        <div className="validation-heading"><h3>Atomic validation</h3><span className={errorCount ? 'count-error' : 'count-good'}>{errorCount ? `${errorCount} blocking` : 'Ready'}</span></div>
        {issues.map((issue) => <button key={issue.id} onClick={() => issue.nodeId && onSelectNode(issue.nodeId)} type="button"><span className={`issue-icon ${issue.severity}`}>{issue.severity === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}</span><div><strong>{issue.title}</strong><small>{issue.detail}</small><code className="validation-atom-id">{issue.atomId}</code></div></button>)}
        {issues.length === 0 && <div className="all-clear"><CheckCircle2 size={17} /><div><strong>All atomic checks passed</strong><small>Direction, topology and game-safety contracts are valid.</small></div></div>}
      </section>
    </PanelScrollArea>
    {onBack && <PanelFooterActions>
      <button aria-label={`Back to ${returnLabel ?? 'previous panel'}`} className="panel-back" onClick={onBack} title={`Back to ${returnLabel ?? 'previous panel'}`} type="button"><ArrowLeft size={14} /><span>{returnLabel}</span></button>
    </PanelFooterActions>}
  </>
}
