import { Binoculars, Bot, Braces, BrainCircuit, ChartColumn, ChartNetwork, Cpu, Database, Dices, FileDiff, Gamepad2, GitBranch, LayoutDashboard, Network, PanelLeftClose, Plus, Radar, SearchCheck, Send, Server, ShieldAlert, UserCheck, WandSparkles } from 'lucide-react'
import { PanelHeader } from '../components/shared/PanelHeader'
import { PanelScrollArea } from '../components/shared/PanelScrollArea'
import { cardLabels, type CardKind } from '../domain/pipeline'

const palette: { kind: CardKind; description: string; icon: typeof Database }[] = [
  { kind: 'control', description: 'Persistent objective, review resume and idle policy', icon: Bot },
  { kind: 'server', description: 'Private FiveM, RedM or generic game server', icon: Server },
  { kind: 'agent', description: 'AI NPC, test player or governed operator', icon: Gamepad2 },
  { kind: 'explorer', description: 'Discover worlds, resources and gameplay surfaces', icon: Binoculars },
  { kind: 'worker', description: 'Run bounded missions or audits in parallel', icon: Cpu },
  { kind: 'query', description: 'Read registered server or replay telemetry', icon: Braces },
  { kind: 'source', description: 'Logs, metrics, replays, resources or events', icon: Database },
  { kind: 'profile', description: 'Version a compact telemetry snapshot', icon: ChartColumn },
  { kind: 'analysis', description: 'Diagnose incidents or score an agent replay', icon: BrainCircuit },
  { kind: 'impact', description: 'Calculate player, session and resource impact', icon: ChartNetwork },
  { kind: 'risk', description: 'Classify operational, safety and action risk', icon: ShieldAlert },
  { kind: 'patch', description: 'Propose one reversible server recovery', icon: FileDiff },
  { kind: 'monitor', description: 'Restart only when telemetry evidence changes', icon: Radar },
  { kind: 'parallel', description: 'Delegate independent missions or incident branches', icon: Network },
  { kind: 'diagram', description: 'Merge reviewed incident branches atomically', icon: LayoutDashboard },
  { kind: 'split', description: 'Route approved, retry and quarantine outcomes', icon: GitBranch },
  { kind: 'decision', description: 'Choose a bounded action or human escalation', icon: Dices },
  { kind: 'transform', description: 'Normalize observations into allowlisted actions', icon: WandSparkles },
  { kind: 'review', description: 'Ask an operator before a material command', icon: UserCheck },
  { kind: 'validation', description: 'Check server recovery and agent safety gates', icon: SearchCheck },
  { kind: 'output', description: 'Incident result, replay score or action receipt', icon: Send },
]

export function CardLibraryView({ onAddCard, onClose }: { onAddCard(kind: CardKind): void; onClose(): void }) {
  return <aside className="library-panel">
    <PanelHeader action={<button aria-label="Close card library" className="panel-toggle" onClick={onClose} title="Close card library" type="button"><PanelLeftClose size={16} /></button>} eyebrow="BUILD" title="Card library" />
    <PanelScrollArea className="library-panel-content" label="Card library content">
      <p className="panel-intro">Compose an auditable private-game workflow. Server operations and agent actions remain inspectable, reviewable and stoppable.</p>
      <div className="palette-list">{palette.map(({ kind, description, icon: Icon }) => <button
        className={`palette-card palette-${kind}`}
        draggable
        key={kind}
        onClick={() => onAddCard(kind)}
        onDragEnd={(event) => event.currentTarget.classList.remove('is-dragging')}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy'
          event.dataTransfer.setData('application/game-lab-card', kind)
          event.dataTransfer.setData('text/plain', cardLabels[kind])
          event.currentTarget.classList.add('is-dragging')
        }}
        title={`Click to add or drag ${cardLabels[kind]} onto the canvas`}
        type="button"
      ><span><Icon size={16} /></span><div><strong>{cardLabels[kind]}</strong><small>{description}</small></div><Plus size={14} /></button>)}</div>
      <section className="datahub-context">
        <div><Gamepad2 size={15} /><strong>Private-server safety</strong></div>
        <p>GAME LAB operates on owned or authorized private servers. Commands stay allowlisted, versioned and behind Human Review.</p>
        <ul><li>server telemetry</li><li>replay evidence</li><li>emergency stop</li></ul>
      </section>
    </PanelScrollArea>
  </aside>
}
