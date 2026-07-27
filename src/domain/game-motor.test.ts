import { describe, expect, it } from 'vitest'
import { createGameMotorPlan, gameMotorCheckpoint, gameMotorMaximumActions } from './game-motor'
import type { GameObservation } from './game-bridge'

const observation: GameObservation = {
  protocol: 'game-lab.control.v1',
  observationId: 'observation-1',
  checkpointId: 'checkpoint-1',
  capturedAt: '2026-07-28T00:00:00.000Z',
  sessionId: 'session-1',
  player: { position: { x: 0, y: 64, z: 0 }, heading: 0, speed: 0, health: 20, armor: 0, inVehicle: false },
  mission: { objective: 'Gather wood', stage: 'acting', completed: false },
  environment: { area: 'overworld', threatLevel: 'none' },
  nearby: [],
}

describe('GAME LAB Motor', () => {
  it('keeps plans bounded to twenty actions', () => {
    expect(gameMotorMaximumActions).toBe(20)
  })

  it('continues safe deterministic steps from a fresh checkpoint', () => {
    expect(gameMotorCheckpoint(observation, 'mine_block')).toEqual({ continue: true })
  })

  it('exposes every planned step before local execution starts', () => {
    const plan = createGameMotorPlan([
      { commandId: 'step-1', checkpointId: 'checkpoint-1', action: 'move_to', reason: 'Reach the tree.' },
      { commandId: 'step-2', checkpointId: 'checkpoint-1', action: 'mine_block', reason: 'Gather one log.' },
    ], '2026-07-28T00:00:00.000Z')
    expect(plan).toMatchObject({
      status: 'running',
      completedActions: 0,
      steps: [
        { action: 'move_to', reason: 'Reach the tree.', status: 'queued' },
        { action: 'mine_block', reason: 'Gather one log.', status: 'queued' },
      ],
    })
  })

  it('interrupts work but preserves survival movement when danger changes', () => {
    const threatened = {
      ...observation,
      player: { ...observation.player, health: 7 },
      environment: { ...observation.environment, threatLevel: 'high' as const },
    }
    expect(gameMotorCheckpoint(threatened, 'mine_block')).toMatchObject({ continue: false })
    expect(gameMotorCheckpoint(threatened, 'move_to')).toEqual({ continue: true })
  })
})
