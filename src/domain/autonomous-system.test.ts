import { describe, expect, it } from 'vitest'
import type { GameBridgeStatus, GameObservation } from './game-bridge'
import { ensureAutonomousSystemCards } from './autonomous-system'

const observation: GameObservation = {
  protocol: 'game-lab.control.v1',
  observationId: 'observation-1',
  checkpointId: 'checkpoint-1',
  capturedAt: '2026-07-27T12:00:00.000Z',
  sessionId: 'session-1',
  player: { position: { x: 0, y: 64, z: 0 }, heading: 0, speed: 0, health: 20, armor: 0, inVehicle: false },
  mission: { objective: 'Gather wood', stage: 'start', completed: false },
  environment: { area: 'spawn', threatLevel: 'none' },
  nearby: [],
  gameState: { kind: 'minecraft', version: '1.21.6', dimension: 'overworld', food: 20, saturation: 5, experienceLevel: 0, inventory: [], nearbyBlocks: [] },
}

const status: GameBridgeStatus = {
  mode: 'connected',
  protocol: 'game-lab.control.v1',
  endpoint: 'http://127.0.0.1:4317',
  message: 'Connected',
  game: 'Minecraft',
}

describe('autonomous game bootstrap', () => {
  it('starts with the controller, Minecraft agent and Human Review', () => {
    const system = ensureAutonomousSystemCards([], [], { observation, status })
    expect(system.added.map((node) => node.data.kind)).toEqual(['control', 'agent', 'review'])
    expect(system.agent.data.label).toBe('Minecraft Agent')
    expect(system.addedEdges).toEqual([expect.objectContaining({ source: 'game-bridge-agent', target: 'game-bridge-review' })])
  })

  it('does not duplicate existing system cards or edges', () => {
    const initial = ensureAutonomousSystemCards([], [], { observation, status })
    const resumed = ensureAutonomousSystemCards(initial.added, initial.addedEdges, { observation, status })
    expect(resumed.added).toEqual([])
    expect(resumed.updated).toEqual([])
    expect(resumed.addedEdges).toEqual([])
  })

  it('upgrades legacy generated system cards without replacing custom cards', () => {
    const initial = ensureAutonomousSystemCards([], [], { observation, status })
    const legacy = initial.added.map((node) => node.id === 'game-bridge-review'
      ? { ...node, data: { ...node.data, label: 'Review next game action', description: 'Review every action.', rule: 'checkpoint=current_game_observation' } }
      : node)
    const resumed = ensureAutonomousSystemCards(legacy, initial.addedEdges, { observation, status })
    expect(resumed.updated).toHaveLength(1)
    expect(resumed.review.data.label).toBe('Review sensitive game plan')
    expect(resumed.review.data.description).toContain('Low-risk motor plans continue autonomously')
  })
})
