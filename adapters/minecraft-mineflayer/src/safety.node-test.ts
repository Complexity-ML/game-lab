import assert from 'node:assert/strict'
import test from 'node:test'
import { defensiveRetreatTarget, isHostileMob } from './safety.js'

test('recognizes hostile Minecraft mobs without treating players as hostile', () => {
  assert.equal(isHostileMob('zombie'), true)
  assert.equal(isHostileMob('minecraft:creeper'), true)
  assert.equal(isHostileMob('skeleton'), true)
  assert.equal(isHostileMob('player'), false)
  assert.equal(isHostileMob('cow'), false)
})

test('computes a bounded target directly away from the threat', () => {
  assert.deepEqual(
    defensiveRetreatTarget({ x: 10, y: 64, z: 10 }, { x: 8, y: 64, z: 10 }),
    { x: 22, y: 64, z: 10 },
  )
  assert.deepEqual(
    defensiveRetreatTarget({ x: 10, y: 64, z: 10 }, { x: 10, y: 64, z: 10 }, 8),
    { x: 18, y: 64, z: 10 },
  )
})
