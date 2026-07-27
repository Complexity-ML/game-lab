import { Gamepad2, RefreshCw, Save, ShieldAlert, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { GameBridgeStatus, GameCheckpointSummary, GameObservation } from '../../domain/game-bridge'
import { ActionButton } from './ActionButton'

const unavailableStatus: GameBridgeStatus = {
  mode: 'disconnected',
  protocol: 'game-lab.control.v1',
  endpoint: 'http://127.0.0.1:4317',
  message: 'The Game Bridge requires the Electron application.',
}

export function GameBridgePanel() {
  const endpointRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<GameBridgeStatus>(unavailableStatus)
  const [observation, setObservation] = useState<GameObservation>()
  const [checkpoints, setCheckpoints] = useState<GameCheckpointSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const refresh = async (readObservation = false) => {
    if (!window.gameLab) return
    setBusy(true)
    setFeedback('')
    try {
      const nextStatus = await window.gameLab.getGameBridgeStatus()
      setStatus(nextStatus)
      if (readObservation && nextStatus.mode === 'connected') setObservation(await window.gameLab.getGameObservation('manual'))
      setCheckpoints(await window.gameLab.listGameCheckpoints(8))
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Game Bridge request failed.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    if (!window.gameLab) return
    void Promise.all([
      window.gameLab.getGameBridgeSettings(),
      window.gameLab.getGameBridgeStatus(),
      window.gameLab.listGameCheckpoints(8),
    ]).then(([settings, nextStatus, nextCheckpoints]) => {
      if (!active) return
      if (endpointRef.current) endpointRef.current.value = settings.endpoint
      setStatus(nextStatus)
      setCheckpoints(nextCheckpoints)
    }).catch((error) => {
      if (active) setFeedback(error instanceof Error ? error.message : 'Unable to load Game Bridge settings.')
    })
    return () => { active = false }
  }, [])

  const saveAndConnect = async () => {
    if (!window.gameLab) return
    setBusy(true)
    setFeedback('')
    try {
      await window.gameLab.saveGameBridgeSettings({ endpoint: endpointRef.current?.value.trim() ?? '' })
      const nextStatus = await window.gameLab.getGameBridgeStatus()
      setStatus(nextStatus)
      setFeedback(nextStatus.message)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to save the Game Bridge endpoint.')
    } finally {
      setBusy(false)
    }
  }

  const emergencyStop = async () => {
    if (!window.gameLab) return
    setBusy(true)
    try {
      const result = await window.gameLab.emergencyStopGameBridge()
      setFeedback(result.summary)
    } finally {
      setBusy(false)
    }
  }

  return <section className="settings-section game-bridge-settings">
    <div className="settings-section-title">
      <span><Gamepad2 size={15} /> Local Game Bridge</span>
      <small>{status.mode === 'connected' ? `${status.game ?? 'Game'} connected` : 'Offline'}</small>
    </div>
    <div className="settings-setting-row">
      <div className={`settings-icon bridge-${status.mode === 'connected' ? 'connected' : 'demo'}`}><Gamepad2 size={19} /></div>
      <div><strong>{status.mode === 'connected' ? 'Structured game state ready' : 'Game adapter not connected'}</strong><p>{status.message}</p></div>
      <ActionButton disabled={busy} icon={<RefreshCw size={14} />} onClick={() => void refresh(true)} variant="ghost">Observe</ActionButton>
    </div>
    <label className="settings-field">
      <span>Local adapter endpoint</span>
      <input defaultValue={status.endpoint} placeholder="http://127.0.0.1:4317" ref={endpointRef} type="url" />
      <small>Protocol <code>game-lab.control.v1</code>. Version 1 accepts only loopback HTTP on the same computer as the game or bot.</small>
    </label>
    <div className="ai-connection-actions">
      <ActionButton disabled={busy || !window.gameLab} icon={<Square size={13} />} onClick={() => void emergencyStop()} variant="ghost">Stop game agent</ActionButton>
      <ActionButton disabled={busy || !window.gameLab} icon={<Save size={14} />} onClick={() => void saveAndConnect()} variant="primary">{busy ? 'Checking…' : 'Save & connect'}</ActionButton>
    </div>
    {observation && <div className="game-observation-summary">
      <ShieldAlert size={17} />
      <div>
        <strong>{observation.activity ? `${observation.activity.state} · ${observation.activity.reason}` : observation.mission.objective}</strong>
        <small>Checkpoint {observation.checkpointId} · source {observation.activity?.source ?? 'manual'} · {observation.environment.area} · health {observation.player.health}{observation.activity ? ` (${observation.activity.healthDelta > 0 ? '+' : ''}${observation.activity.healthDelta}) · ${observation.activity.hostileCount} hostile · last: ${observation.activity.lastAction}` : ''} · {observation.nearby.length} nearby entities{observation.gameState?.kind === 'minecraft' ? ` · food ${observation.gameState.food}/20 · ${observation.gameState.inventory.length} inventory stacks · ${observation.gameState.nearbyBlocks.length} nearby blocks` : ''}</small>
      </div>
    </div>}
    {checkpoints.length > 0 && <div className="game-checkpoint-list">
      {checkpoints.map((checkpoint) => <div key={checkpoint.id}><span>{checkpoint.kind === 'action' ? checkpoint.action : 'observation'} · {new Date(checkpoint.createdAt).toLocaleTimeString()}</span><small>{checkpoint.status} · {checkpoint.summary}</small></div>)}
    </div>}
    {feedback && <p aria-live="polite" className="settings-feedback">{feedback}</p>}
    <p className="settings-note">No screenshot and no GraphQL are used. GPT receives only this bounded state. Gameplay actions are allowlisted, tied to the exact observation checkpoint and require Human Review before execution.</p>
  </section>
}
