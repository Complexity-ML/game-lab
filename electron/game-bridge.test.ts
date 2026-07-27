import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameBridgeClient } from './game-bridge.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('local structured Game Bridge', () => {
  it('rejects non-local endpoints and embedded credentials', () => {
    const settings = new Map<string, string>()
    const client = new GameBridgeClient(
      { load: (key) => settings.get(key) ?? null, save: (key, value) => settings.set(key, value) },
      { save: () => undefined },
    )

    expect(() => client.saveConfiguration({ endpoint: 'http://192.168.1.20:4317' })).toThrow('only a local HTTP endpoint')
    expect(() => client.saveConfiguration({ endpoint: 'http://user:secret@127.0.0.1:4317' })).toThrow('cannot contain credentials')
  })

  it('normalizes observations, binds actions to checkpoints and records receipts', async () => {
    const checkpoints: unknown[] = []
    const responses = [
      {
        protocol: 'game-lab.control.v1',
        observationId: 'observation-1',
        checkpointId: 'checkpoint-1',
        capturedAt: '2026-07-27T12:00:00.000Z',
        sessionId: 'session-1',
        player: { position: { x: 1, y: 2, z: 3 }, heading: 90, speed: 0, health: 200, armor: 50, inVehicle: false },
        mission: { id: 'mission-1', objective: 'Reach the marker', stage: 'spawned', completed: false },
        environment: { area: 'Private shard', threatLevel: 'none' },
        nearby: [{ id: 'marker-1', kind: 'checkpoint', distance: 12, position: { x: 12, y: 64, z: 20 } }],
        gameState: {
          kind: 'minecraft',
          version: '1.21.11',
          dimension: 'minecraft:overworld',
          food: 18,
          saturation: 4,
          experienceLevel: 3,
          inventory: [{ name: 'oak_log', count: 4, slot: 9 }],
          nearbyBlocks: [{ name: 'oak_log', position: { x: 10, y: 64, z: 20 }, distance: 5 }],
        },
      },
      { status: 'completed', summary: 'Movement completed' },
      { stopped: true, summary: 'Stopped immediately' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })))
    const client = new GameBridgeClient(
      { load: () => 'http://127.0.0.1:4317', save: () => undefined },
      { save: (checkpoint) => checkpoints.push(checkpoint) },
    )

    const observation = await client.observation()
    expect(observation).toMatchObject({ checkpointId: 'checkpoint-1', mission: { objective: 'Reach the marker' }, nearby: [{ id: 'marker-1', position: { x: 12, y: 64, z: 20 } }], gameState: { kind: 'minecraft', food: 18, inventory: [{ name: 'oak_log', count: 4 }] } })

    const receipt = await client.execute({
      action: 'mine_block',
      checkpointId: observation.checkpointId,
      arguments: { blockName: 'oak_log', maxDistance: 24 },
    })
    expect(receipt).toMatchObject({ checkpointId: 'checkpoint-1', action: 'mine_block', status: 'completed' })
    expect(await client.emergencyStop()).toMatchObject({ stopped: true, summary: 'Stopped immediately' })
    expect(checkpoints).toMatchObject([
      { kind: 'observation', checkpointId: 'checkpoint-1', status: 'captured' },
      { kind: 'action', checkpointId: 'checkpoint-1', action: 'mine_block', status: 'completed' },
    ])
  })

  it('rejects actions outside the allowlist before any network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new GameBridgeClient(
      { load: () => 'http://127.0.0.1:4317', save: () => undefined },
      { save: () => undefined },
    )

    await expect(client.execute({ action: 'press_arbitrary_key', checkpointId: 'checkpoint-1', arguments: {} })).rejects.toThrow('not allowlisted')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
