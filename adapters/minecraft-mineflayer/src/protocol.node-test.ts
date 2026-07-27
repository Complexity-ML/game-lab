import assert from 'node:assert/strict'
import test from 'node:test'
import { loadConfig } from './config.js'
import { parseActionCommand } from './protocol.js'

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
})

test('unsafe and malformed commands are rejected', () => {
  assert.throws(() => parseActionCommand({ checkpointId: 'checkpoint-1', action: 'run_console', arguments: {} }), /allowlist/)
  assert.throws(() => parseActionCommand({ checkpointId: 'checkpoint-1', action: 'navigate_to', arguments: { targetX: 40_000_000 } }), /targetX/)
  assert.throws(() => parseActionCommand({ checkpointId: 'checkpoint-1', action: 'place_block', arguments: { face: 'diagonal' } }), /cardinal/)
})
