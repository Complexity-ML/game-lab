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
        nearby: [{ id: 'marker-1', kind: 'checkpoint', distance: 12 }],
      },
      { status: 'accepted', summary: 'Movement queued' },
      { stopped: true, summary: 'Stopped immediately' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })))
    const client = new GameBridgeClient(
      { load: () => 'http://127.0.0.1:4317', save: () => undefined },
      { save: (checkpoint) => checkpoints.push(checkpoint) },
    )

    const observation = await client.observation()
    expect(observation).toMatchObject({ checkpointId: 'checkpoint-1', mission: { objective: 'Reach the marker' }, nearby: [{ id: 'marker-1' }] })

    const receipt = await client.execute({
      action: 'move_to',
      checkpointId: observation.checkpointId,
      arguments: { targetX: 10, targetY: 20, targetZ: 30 },
    })
    expect(receipt).toMatchObject({ checkpointId: 'checkpoint-1', action: 'move_to', status: 'accepted' })
    expect(await client.emergencyStop()).toMatchObject({ stopped: true, summary: 'Stopped immediately' })
    expect(checkpoints).toMatchObject([
      { kind: 'observation', checkpointId: 'checkpoint-1', status: 'captured' },
      { kind: 'action', checkpointId: 'checkpoint-1', action: 'move_to', status: 'accepted' },
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
