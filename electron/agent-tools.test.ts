import { describe, expect, it } from 'vitest'
import { AgentToolSession, agentToolDefinitions } from './agent-tools.js'

const payload = {
  cardActivationPlan: [
    { kind: 'agent', state: 'recommended', reason: 'A private-server objective is active.' },
  ],
  graph: {
    nodes: [
      { id: 'server-1', kind: 'server', label: 'Private Minecraft server' },
      { id: 'agent-1', kind: 'agent', label: 'Minecraft Agent' },
    ],
    edges: [{ id: 'server-agent', source: 'server-1', target: 'agent-1' }],
  },
  gameRuntime: { connected: true, checkpointId: 'checkpoint-42' },
}

describe('bounded GAME LAB agent tools', () => {
  it('publishes strict schemas with every property required', () => {
    for (const tool of agentToolDefinitions) {
      expect(tool.strict).toBe(true)
      expect(tool.parameters.additionalProperties).toBe(false)
      expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties))
    }
    expect(agentToolDefinitions.map((tool) => tool.name)).not.toContain('read_catalog_checkpoint')
  })

  it('builds a checkpoint-bound reviewed game action', () => {
    const session = new AgentToolSession(payload)
    expect(session.execute('list_card_kinds', {}).ok).toBe(true)
    expect(session.execute('add_card', {
      node_id: 'review-next-action',
      kind: 'review',
      label: 'Review next action',
      description: 'Approve the next private-server movement.',
      owner: 'Operator',
      rule: null,
      reason: 'Gameplay changes external state.',
    }).ok).toBe(true)
    expect(session.execute('queue_game_action', {
      node_id: 'agent-1',
      game_action: 'move_to',
      checkpoint_id: 'checkpoint-42',
      target_x: 10,
      target_y: 64,
      target_z: 20,
      entity_id: null,
      route_id: null,
      interaction: null,
      duration_ms: null,
      item_name: null,
      block_name: null,
      count: null,
      face: null,
      max_distance: 32,
      reason: 'Move to the observed safe waypoint.',
    }).ok).toBe(true)
    expect(session.execute('validate_plan', {})).toMatchObject({ ok: true, action_count: 2 })
    expect(session.execute('finish_plan', {
      title: 'Move to the safe waypoint',
      summary: 'Queue one reviewed movement.',
      rationale: 'The waypoint exists in the current observation.',
      requires_human_review: true,
      confidence: 0.9,
      writeback: 'Store the approved action receipt locally.',
      evidence: ['checkpoint-42'],
    }).ok).toBe(true)
    expect(session.proposal?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'game_action', checkpoint_id: 'checkpoint-42', game_action: 'move_to' }),
    ]))
  })

  it('finishes a low-risk motor plan without per-action review in autonomous mission mode', () => {
    const session = new AgentToolSession({
      ...payload,
      autonomyPolicy: { gameplay: 'autonomous-mission' },
      gameRuntime: {
        ...payload.gameRuntime,
        observation: {
          player: { health: 20, position: { x: 8, y: 64, z: 20 } },
          environment: { threatLevel: 'none' },
        },
      },
    })
    expect(session.execute('list_card_kinds', {})).toMatchObject({
      ok: true,
      game_policy: { gameplay_mode: 'autonomous-mission' },
    })
    expect(session.execute('queue_game_action', {
      node_id: 'agent-1',
      game_action: 'move_to',
      checkpoint_id: 'checkpoint-42',
      target_x: 10,
      target_y: 64,
      target_z: 20,
      entity_id: null,
      route_id: null,
      interaction: null,
      duration_ms: null,
      item_name: null,
      block_name: null,
      count: null,
      face: null,
      max_distance: 32,
      reason: 'Continue the authorized mission.',
    })).toMatchObject({ ok: true })
    expect(session.execute('queue_game_action', {
      node_id: 'agent-1',
      game_action: 'wait',
      checkpoint_id: 'checkpoint-42',
      target_x: null,
      target_y: null,
      target_z: null,
      entity_id: null,
      route_id: null,
      interaction: null,
      duration_ms: 250,
      item_name: null,
      block_name: null,
      count: null,
      face: null,
      max_distance: null,
      reason: 'Allow the local motor to validate movement state.',
    })).toMatchObject({ ok: true })
    expect(session.execute('validate_plan', {})).toMatchObject({ ok: true, action_count: 2 })
    expect(session.execute('finish_plan', {
      title: 'Continue the mission',
      summary: 'Execute two locally validated motor steps.',
      rationale: 'Both steps are nearby, bounded and low-risk.',
      requires_human_review: false,
      confidence: 0.95,
      writeback: 'Store the completed action receipt.',
      evidence: ['checkpoint-42'],
    })).toMatchObject({ ok: true })
    expect(session.proposal).toMatchObject({ requires_human_review: false })
  })

  it('rejects stale game checkpoints', () => {
    const session = new AgentToolSession(payload)
    session.execute('add_card', {
      node_id: 'review-next-action',
      kind: 'review',
      label: 'Review next action',
      description: null,
      owner: null,
      rule: null,
      reason: 'Review gameplay.',
    })
    expect(session.execute('queue_game_action', {
      node_id: 'agent-1',
      game_action: 'wait',
      checkpoint_id: 'stale-checkpoint',
      target_x: null,
      target_y: null,
      target_z: null,
      entity_id: null,
      route_id: null,
      interaction: null,
      duration_ms: 1000,
      item_name: null,
      block_name: null,
      count: null,
      face: null,
      max_distance: null,
      reason: 'Wait safely.',
    })).toMatchObject({ ok: false, summary: expect.stringContaining('current connected Game Bridge checkpoint') })
  })

  it('supplies game-only defaults for World Explorer and Live Monitor', () => {
    const session = new AgentToolSession(payload)
    expect(session.execute('add_card', {
      node_id: 'world-explorer',
      kind: 'explorer',
      label: null,
      description: null,
      owner: null,
      rule: null,
      reason: 'Inspect the nearby world.',
    })).toMatchObject({
      ok: true,
      action: { rule: 'scope=nearby_world | checkpoint=versioned | resume=true' },
    })
    expect(session.execute('add_card', {
      node_id: 'server-monitor',
      kind: 'monitor',
      label: null,
      description: null,
      owner: null,
      rule: null,
      reason: 'Watch the game checkpoint.',
    })).toMatchObject({
      ok: true,
      action: { rule: expect.stringContaining('on_change=game_checkpoint') },
    })
  })
})
