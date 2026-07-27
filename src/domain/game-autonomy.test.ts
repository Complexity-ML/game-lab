import { describe, expect, it } from 'vitest'
import { defaultAutonomyPolicy } from './autonomy-policy'
import { autonomousProposalFingerprint, gameActionRequiresHumanReview, isRecoverableGameActionFailure } from './game-autonomy'
import type { GameObservation } from './game-bridge'

const observation: GameObservation = {
  protocol: 'game-lab.control.v1',
  observationId: 'observation-1',
  checkpointId: 'checkpoint-1',
  capturedAt: '2026-07-27T12:00:00.000Z',
  sessionId: 'session-1',
  player: { position: { x: 10, y: 64, z: 20 }, heading: 0, speed: 0, health: 20, armor: 0, inVehicle: false },
  mission: { objective: 'Gather wood', stage: 'observing', completed: false },
  environment: { area: 'overworld', threatLevel: 'none' },
  nearby: [],
}

describe('autonomous gameplay policy', () => {
  it('allows low-risk mission actions while keeping sensitive actions reviewed', () => {
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'mine_block', observation)).toBe(false)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'craft_item', observation)).toBe(false)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'jump', observation)).toBe(false)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'attack_entity', observation)).toBe(true)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'interact', observation)).toBe(true)
  })

  it('allows immediate evasion but reviews non-evasive actions when the player is unsafe', () => {
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'navigate_to', {
      ...observation,
      player: { ...observation.player, health: 6 },
    })).toBe(false)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'jump', {
      ...observation,
      player: { ...observation.player, health: 6 },
    })).toBe(false)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'navigate_to', {
      ...observation,
      environment: { ...observation.environment, threatLevel: 'high' },
    })).toBe(false)
    expect(gameActionRequiresHumanReview(defaultAutonomyPolicy, 'mine_block', {
      ...observation,
      environment: { ...observation.environment, threatLevel: 'high' },
    })).toBe(true)
  })

  it('fingerprints actions separately from graph-only proposals', () => {
    const first = autonomousProposalFingerprint('0123456789abcdef', [{
      checkpointId: 'checkpoint-1',
      action: 'mine_block',
      arguments: { blockName: 'oak_log', maxDistance: 16 },
    }])
    const second = autonomousProposalFingerprint('0123456789abcdef', [{
      checkpointId: 'checkpoint-2',
      action: 'mine_block',
      arguments: { blockName: 'oak_log', maxDistance: 16 },
    }])
    expect(first).toMatch(/^[a-f0-9]{16}$/)
    expect(first).not.toBe(second)
  })

  it('replans bounded navigation and mixed-version adapter failures', () => {
    expect(isRecoverableGameActionFailure('Pathfinder attempt timed out')).toBe(true)
    expect(isRecoverableGameActionFailure('Action is not in the Minecraft allowlist')).toBe(true)
    expect(isRecoverableGameActionFailure('Minecraft credentials rejected')).toBe(false)
  })
})
