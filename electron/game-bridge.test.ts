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
        activity: {
          state: 'threat_detected',
          reason: 'Nearest hostile zombie at 6 blocks',
          source: 'post_action',
          lastAction: 'move_to completed',
          stateChangedAt: '2026-07-27T11:59:58.000Z',
          healthDelta: -2,
          hostileCount: 1,
          nearestHostile: { id: 'entity-9', state: 'zombie', distance: 6 },
        },
        environment: { area: 'Private shard', threatLevel: 'none' },
        nearby: [{ id: 'marker-1', kind: 'checkpoint', distance: 12, position: { x: 12, y: 64, z: 20 } }],
        gameState: {
          kind: 'minecraft',
          version: '1.21.11',
          dimension: 'minecraft:overworld',
          food: 18,
          saturation: 4,
          experienceLevel: 3,
          supportBlock: 'oak_leaves',
          surfaceState: 'canopy',
          inventory: [{ name: 'oak_log', count: 4, slot: 9 }],
          nearbyBlocks: [{ name: 'oak_log', position: { x: 10, y: 64, z: 20 }, distance: 5 }],
          localMap: {
            radius: 1,
            diameter: 3,
            origin: { x: 1, y: 2, z: 3 },
            counts: { walkable: 1, blocked: 0, hazard: 1, drop: 0 },
            cells: [
              { offsetX: 0, offsetZ: 0, position: { x: 1, y: 2, z: 3 }, state: 'walkable', ground: 'grass_block' },
              { offsetX: 1, offsetZ: 0, position: { x: 2, y: 2, z: 3 }, state: 'hazard', ground: 'lava' },
            ],
          },
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

    const observation = await client.observation('post_action')
    expect(observation).toMatchObject({ checkpointId: 'checkpoint-1', mission: { objective: 'Reach the marker' }, activity: { state: 'threat_detected', source: 'post_action', healthDelta: -2, hostileCount: 1, nearestHostile: { state: 'zombie', distance: 6 } }, nearby: [{ id: 'marker-1', position: { x: 12, y: 64, z: 20 } }], gameState: { kind: 'minecraft', food: 18, supportBlock: 'oak_leaves', surfaceState: 'canopy', inventory: [{ name: 'oak_log', count: 4 }], localMap: { radius: 1, diameter: 3, counts: { walkable: 1, hazard: 1 }, cells: [{ state: 'walkable' }, { state: 'hazard' }] } } })

    const receipt = await client.execute({
      action: 'mine_block',
      checkpointId: observation.checkpointId,
      arguments: { blockName: 'oak_log', maxDistance: 24 },
    })
    expect(receipt).toMatchObject({ checkpointId: 'checkpoint-1', action: 'mine_block', status: 'completed' })
    expect(await client.emergencyStop()).toMatchObject({ stopped: true, summary: 'Stopped immediately' })
    expect(checkpoints).toMatchObject([
      { kind: 'observation', checkpointId: 'checkpoint-1', status: 'captured', summary: expect.stringContaining('state=threat_detected; source=post_action') },
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
