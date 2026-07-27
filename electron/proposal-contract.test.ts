import { describe, expect, it } from 'vitest'
import { parseAndValidateProposal, validateProposal } from './proposal-contract.js'

const payload = {
  graph: {
    nodes: [
      { id: 'server-1', kind: 'server' },
      { id: 'agent-1', kind: 'agent' },
      { id: 'output-1', kind: 'output' },
    ],
    edges: [{ id: 'server-agent', source: 'server-1', target: 'agent-1' }],
  },
  gameRuntime: { connected: true, checkpointId: 'checkpoint-42' },
}

const nullActionFields = {
  kind: null,
  label: null,
  description: null,
  owner: null,
  rule: null,
  source: null,
  target: null,
  source_handle: null,
  game_action: null,
  game_action_args: null,
  checkpoint_id: null,
}

const proposal = (actions: unknown[], requiresHumanReview = false) => ({
  title: 'Plan the next private-server step',
  summary: 'Use current structured game evidence.',
  rationale: 'The action is bounded by the current checkpoint.',
  requires_human_review: requiresHumanReview,
  confidence: 0.9,
  writeback: 'Store the reviewed graph revision and action receipt locally.',
  evidence: ['checkpoint-42'],
  actions,
})

const addCard = (nodeId: string, kind: string, rule: string | null = null) => ({
  type: 'add_card',
  node_id: nodeId,
  ...nullActionFields,
  kind,
  rule,
  reason: 'Add one bounded game workflow card.',
})

const moveAction = {
  type: 'game_action',
  node_id: 'agent-1',
  ...nullActionFields,
  game_action: 'move_to',
  game_action_args: {
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
  },
  checkpoint_id: 'checkpoint-42',
  reason: 'Move to a waypoint present in the current observation.',
}

describe('strict game proposal contract', () => {
  it('accepts only checkpoint-bound reviewed gameplay actions', () => {
    const review = addCard('review-next-action', 'review')

    expect(validateProposal(proposal([review, moveAction], true), payload).actions[1]).toMatchObject({
      type: 'game_action',
      checkpoint_id: 'checkpoint-42',
      game_action: 'move_to',
    })
    expect(() => validateProposal(proposal([review, { ...moveAction, checkpoint_id: 'stale' }], true), payload)).toThrow('current connected Game Bridge checkpoint')
    expect(() => validateProposal(proposal([moveAction]), payload)).toThrow('requires_human_review=true')
  })

  it('allows one nearby low-risk action in autonomous mission mode', () => {
    const autonomousPayload = {
      ...payload,
      autonomyPolicy: { gameplay: 'autonomous-mission' },
      gameRuntime: {
        ...payload.gameRuntime,
        observation: {
          player: { health: 20, position: { x: 8, y: 64, z: 20 } },
          environment: { threatLevel: 'none' },
        },
      },
    }
    expect(validateProposal(proposal([moveAction]), autonomousPayload).actions[0]).toMatchObject({ game_action: 'move_to' })
    expect(() => validateProposal(proposal([{ ...moveAction, game_action: 'attack_entity', game_action_args: { ...moveAction.game_action_args, entity_id: 'entity-2' } }]), autonomousPayload)).toThrow('require Human Review')
    expect(() => validateProposal(proposal([moveAction, { ...moveAction, game_action: 'wait', game_action_args: { ...moveAction.game_action_args, target_x: null, target_y: null, target_z: null, duration_ms: 1000 } }]), autonomousPayload)).toThrow('exactly one')
    expect(() => validateProposal(proposal([{ ...moveAction, game_action_args: { ...moveAction.game_action_args, target_x: 100 } }]), autonomousPayload)).toThrow('within 64 blocks')
    const threatenedPayload = {
      ...autonomousPayload,
      gameRuntime: {
        ...autonomousPayload.gameRuntime,
        observation: {
          ...autonomousPayload.gameRuntime.observation,
          environment: { threatLevel: 'high' },
        },
      },
    }
    expect(validateProposal(proposal([moveAction]), threatenedPayload).actions[0]).toMatchObject({ game_action: 'move_to' })
    expect(() => validateProposal(proposal([{
      ...moveAction,
      game_action: 'mine_block',
      game_action_args: { ...moveAction.game_action_args, block_name: 'oak_log' },
    }]), threatenedPayload)).toThrow('allows only autonomous movement or stop')
  })

  it('validates game-only World Explorer and Telemetry Query policies', () => {
    const explorer = addCard('world-explorer', 'explorer', 'scope=nearby_world | checkpoint=versioned | resume=true')
    const query = addCard('telemetry-query', 'query', 'source=game_bridge | operation=observation.read | mode=read_only | timeout_ms=8000')

    expect(validateProposal(proposal([explorer, query]), payload).actions.map((action) => action.kind)).toEqual(['explorer', 'query'])
    expect(() => validateProposal(proposal([{ ...explorer, rule: 'scope=all_worlds | checkpoint=versioned | resume=true' }]), payload)).toThrow('scope=nearby_world')
    expect(() => validateProposal(proposal([{ ...query, rule: 'source=game_bridge | operation=command.run | mode=read_only | timeout_ms=8000' }]), payload)).toThrow('operation=observation.read')
  })

  it('requires fresh evidence for operational and safety risks', () => {
    const riskRule = 'scope=private_mission | risk_domain=mission | risk_type=safety | severity=high | confidence=0.9 | evidence=fresh | affected_assets=1 | action=return_to_safe_checkpoint'
    const risk = addCard('mission-risk', 'risk', riskRule)
    expect(validateProposal(proposal([risk]), payload).actions[0]).toMatchObject({ kind: 'risk' })
    expect(() => validateProposal(proposal([{ ...risk, rule: riskRule.replace('evidence=fresh', 'evidence=stale') }]), payload)).toThrow('fresh game observation')
  })

  it('keeps the World Explorer outside the action path', () => {
    const explorer = addCard('world-explorer', 'explorer', 'scope=nearby_world | checkpoint=versioned | resume=true')
    const source = addCard('game-evidence', 'source')
    const edge = {
      type: 'add_edge',
      node_id: null,
      ...nullActionFields,
      source: 'world-explorer',
      target: 'game-evidence',
      reason: 'Attempt to connect a host sidecar.',
    }
    expect(() => validateProposal(proposal([explorer, source, edge]), payload)).toThrow('host-owned World Explorer sidecar')
  })

  it('parses strict JSON and rejects malformed provider output', () => {
    expect(parseAndValidateProposal(JSON.stringify(proposal([])), payload).actions).toEqual([])
    expect(() => parseAndValidateProposal('{not-json}', payload)).toThrow('malformed JSON')
  })
})
