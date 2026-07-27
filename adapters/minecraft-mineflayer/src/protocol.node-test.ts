import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig } from './config.js'
import { actionTimeoutMs, isImmediateAction, parseActionCommand } from './protocol.js'

test('private-server acknowledgment is mandatory', () => {
  assert.throws(() => loadConfig({}), /Refusing to start/)
  assert.equal(loadConfig({ GAME_LAB_PRIVATE_SERVER_ACKNOWLEDGED: 'true' }).minecraftHost, '127.0.0.1')
})

test('Minecraft commands are bounded and checkpointed', () => {
  const command = parseActionCommand({
    checkpointId: 'minecraft-checkpoint-1',
    action: 'mine_block',
    arguments: { blockName: 'oak_log', maxDistance: 24 },
  })
  assert.equal(command.action, 'mine_block')
  assert.equal(command.arguments.blockName, 'oak_log')
  assert.match(command.commandId, /^command-/)
  assert.equal(parseActionCommand({
    checkpointId: 'minecraft-checkpoint-2',
    action: 'jump',
    arguments: { durationMs: 450 },
  }).action, 'jump')
})

test('unsafe and malformed commands are rejected', () => {
  assert.throws(() => parseActionCommand({ checkpointId: 'checkpoint-1', action: 'run_console', arguments: {} }), /allowlist/)
  assert.throws(() => parseActionCommand({ checkpointId: 'checkpoint-1', action: 'navigate_to', arguments: { targetX: 40_000_000 } }), /targetX/)
  assert.throws(() => parseActionCommand({ checkpointId: 'checkpoint-1', action: 'place_block', arguments: { face: 'diagonal' } }), /cardinal/)
})

test('stop is the only action that bypasses the action queue', () => {
  assert.equal(isImmediateAction('stop'), true)
  assert.equal(isImmediateAction('move_to'), false)
  assert.equal(isImmediateAction('jump'), false)
})

test('action deadlines finish before the desktop bridge timeout', () => {
  assert.equal(actionTimeoutMs({ action: 'mine_block', arguments: {} }), 38_000)
  assert.equal(actionTimeoutMs({ action: 'move_to', arguments: {} }), 28_000)
  assert.equal(actionTimeoutMs({ action: 'wait', arguments: { durationMs: 60_000 } }), 62_000)
  assert.equal(actionTimeoutMs({ action: 'craft_item', arguments: { itemName: 'wooden_pickaxe' } }), 150_000)
})
