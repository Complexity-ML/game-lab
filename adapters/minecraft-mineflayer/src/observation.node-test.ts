import assert from 'node:assert/strict'
import test from 'node:test'
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { buildLocalNavigationMap, isElevatedNaturalSupport } from './observation.js'

test('finds a confirmed landing surface below a thick tree canopy', () => {
  const bot = {
    entity: { position: new Vec3(0, 72, 0) },
    blockAt(position: Vec3) {
      return position.y === 67
        ? { name: 'grass_block', boundingBox: 'block', position }
        : { name: 'air', boundingBox: 'empty', position }
    },
  } as unknown as Bot

  const map = buildLocalNavigationMap(bot, 0)

  assert.deepEqual({
    ...map.cells[0],
    offsetX: map.cells[0]?.offsetX || 0,
    offsetZ: map.cells[0]?.offsetZ || 0,
  }, {
    offsetX: 0,
    offsetZ: 0,
    position: { x: 0, y: 68, z: 0 },
    state: 'drop',
    ground: 'grass_block',
  })
})

test('recognizes leaves and giant mushroom caps as elevated natural surfaces', () => {
  assert.equal(isElevatedNaturalSupport('dark_oak_leaves'), true)
  assert.equal(isElevatedNaturalSupport('red_mushroom_block'), true)
  assert.equal(isElevatedNaturalSupport('grass_block'), false)
  assert.equal(isElevatedNaturalSupport(undefined), false)
})
