import { Ban, CheckCircle2, Circle, Clock3, LoaderCircle, PanelLeftClose, PauseCircle, ScrollText, ShieldAlert, Trash2, XCircle } from 'lucide-react'
import { PanelFooterActions, PanelHeader, PanelHeaderActions, PanelHeaderButton } from '../components/shared/PanelHeader'
import { PanelScrollArea } from '../components/shared/PanelScrollArea'
import type { GameMotorPlanStep, GameMotorPlanView } from '../domain/game-motor'
import type { AgentActionLog } from './AgentActionsView'

interface LiveActivityViewProps {
  busy: boolean
  entries: AgentActionLog[]
  motorPlan?: GameMotorPlanView
  onClear(): void
  onClose(): void
}

function MotorStepIcon({ step }: { step: GameMotorPlanStep }) {
  if (step.status === 'running') return <LoaderCircle className="agent-context-wheel" size={12} />
  if (step.status === 'completed') return <CheckCircle2 size={12} />
  if (step.status === 'blocked') return <ShieldAlert size={12} />
  if (step.status === 'failed') return <XCircle size={12} />
  if (step.status === 'skipped') return <Ban size={12} />
  return <Circle size={12} />
}

function MotorPlan({ plan }: { plan: GameMotorPlanView }) {
  const progress = plan.steps.length ? Math.round(plan.completedActions / plan.steps.length * 100) : 0
  return <section aria-label="GAME LAB Motor plan" className={`motor-plan is-${plan.status}`}>
    <div className="motor-plan-heading">
      <span><strong>GAME LAB Motor plan</strong><small>Every planned micro-action · live status</small></span>
      <span className="motor-plan-status">{plan.status === 'paused' ? <PauseCircle size={11} /> : plan.status === 'running' ? <LoaderCircle className="agent-context-wheel" size={11} /> : <CheckCircle2 size={11} />}{plan.status}</span>
    </div>
    <div className="motor-plan-progress">
      <span style={{ width: `${progress}%` }} />
    </div>
    <small className="motor-plan-count">{plan.completedActions}/{plan.steps.length} validated{plan.currentStep ? ` · step ${plan.currentStep}` : ''}</small>
    <ol className="motor-plan-steps">{plan.steps.map((step, index) => <li className={`is-${step.status}`} key={step.id}>
      <span><MotorStepIcon step={step} /></span>
      <div>
        <strong>{index + 1}. {step.action.replaceAll('_', ' ')}</strong>
        <p>{step.reason}</p>
        <small>{step.status} · {step.checkpointId}</small>
        {step.summary && <em>{step.summary}</em>}
      </div>
    </li>)}</ol>
  </section>
}

export function LiveActivityView({ busy, entries, motorPlan, onClear, onClose }: LiveActivityViewProps) {
  return <>
    <PanelHeader action={<PanelHeaderActions>
      <PanelHeaderButton label="Close live logs" onClick={onClose}><PanelLeftClose size={16} /></PanelHeaderButton>
    </PanelHeaderActions>} eyebrow="LIVE" title="Activity log" />
    <PanelScrollArea className="live-log-content" label="Live activity content">
      <div className={`live-log-state ${busy ? 'is-busy' : ''}`}>
        {busy ? <LoaderCircle className="agent-context-wheel" size={17} /> : <ScrollText size={17} />}
        <span><strong>{busy ? 'GAME LAB is working' : 'Waiting for the next event'}</strong><small>Simple session timeline · newest first</small></span>
      </div>
      {motorPlan && <MotorPlan plan={motorPlan} />}
      {entries.length ? <ol className="live-log-list">{entries.map((entry, index) => <li key={entry.id}>
        <span>{index === 0 && busy ? <LoaderCircle className="agent-context-wheel" size={12} /> : index === 0 ? <Clock3 size={12} /> : <CheckCircle2 size={12} />}</span>
        <div><strong>{entry.message}</strong><time>{new Date(entry.createdAt).toLocaleTimeString()}</time></div>
      </li>)}</ol> : <p className="empty-copy">Play the graph or change a setting to start the live timeline.</p>}
    </PanelScrollArea>
    <PanelFooterActions>
      <PanelHeaderButton className="panel-clear-button" disabled={!entries.length} label="Clear session log" onClick={onClear}><Trash2 size={15} /></PanelHeaderButton>
    </PanelFooterActions>
  </>
}
