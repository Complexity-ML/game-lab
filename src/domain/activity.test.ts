import { describe, expect, it } from 'vitest'
import { gameCheckpointActivityMessage, isAgentActionActivity } from './activity'

describe('agent action activity', () => {
  it('keeps scheduler, provider and terminal graph transitions together', () => {
    expect(isAgentActionActivity('Next autonomous iteration scheduled · rereading the graph and checkpoint…')).toBe(true)
    expect(isAgentActionActivity('gpt-5.6-sol is analyzing the graph and previous versions…')).toBe(true)
    expect(isAgentActionActivity('Graph is already current · no duplicate revision created · Live Monitor remains armed')).toBe(true)
    expect(isAgentActionActivity('Game checkpoint complete · model call boundary reached')).toBe(true)
  })

  it('leaves unrelated interface messages in the complete live log only', () => {
    expect(isAgentActionActivity('Canvas fitted to the current graph')).toBe(true)
    expect(isAgentActionActivity('Theme changed to dark')).toBe(false)
    expect(isAgentActionActivity('Workspace renamed · Customer pipeline')).toBe(false)
  })

  it('formats persisted Game Bridge checkpoints for the live activity log', () => {
    expect(gameCheckpointActivityMessage({
      id: 'checkpoint-row-1',
      kind: 'observation',
      checkpointId: 'minecraft-checkpoint-4',
      observationId: 'observation-4',
      status: 'captured',
      summary: 'captured · state=evading; reason=nearest zombie at 4 blocks',
      createdAt: '2026-07-27T12:00:00.000Z',
    })).toBe('Observation captured · state=evading; reason=nearest zombie at 4 blocks')
    expect(gameCheckpointActivityMessage({
      id: 'checkpoint-row-2',
      kind: 'action',
      checkpointId: 'minecraft-checkpoint-4',
      commandId: 'command-4',
      action: 'move_to',
      status: 'completed',
      summary: 'move_to completed against minecraft-checkpoint-4',
      createdAt: '2026-07-27T12:00:01.000Z',
    })).toBe('Action move to completed · move_to completed against minecraft-checkpoint-4')
  })
})
