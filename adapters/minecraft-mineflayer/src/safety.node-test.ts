import assert from 'node:assert/strict'
import test from 'node:test'
import { defensiveResponse, defensiveRetreatTarget, isHostileMob, isRelevantHostile, navigationDescentCell, navigationRecoveryCell, reconnectDelay } from './safety.js'

test('recognizes hostile Minecraft mobs without treating players as hostile', () => {
  assert.equal(isHostileMob('zombie'), true)
  assert.equal(isHostileMob('minecraft:creeper'), true)
  assert.equal(isHostileMob('skeleton'), true)
  assert.equal(isHostileMob('player'), false)
  assert.equal(isHostileMob('cow'), false)
})

test('ignores distant underground mobs while retaining nearby and same-level threats', () => {
  const player = { x: 201, y: 68, z: -577 }
  assert.equal(isRelevantHostile(player, { x: 193, y: 62, z: -574 }), false)
  assert.equal(isRelevantHostile(player, { x: 190, y: 68, z: -577 }), true)
  assert.equal(isRelevantHostile(player, { x: 201, y: 64, z: -577 }), true)
  assert.equal(isRelevantHostile(player, { x: 201, y: 30, z: -577 }), false)
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

test('fights only a bounded nearby melee threat when health permits it', () => {
  assert.equal(defensiveResponse({ health: 18, hostileCount: 1, nearestDistance: 3, nearestName: 'zombie', hasWeapon: false }), 'fight')
  assert.equal(defensiveResponse({ health: 12, hostileCount: 1, nearestDistance: 3, nearestName: 'zombie', hasWeapon: true }), 'fight')
  assert.equal(defensiveResponse({ health: 9, hostileCount: 1, nearestDistance: 3, nearestName: 'zombie', hasWeapon: true }), 'retreat')
  assert.equal(defensiveResponse({ health: 20, hostileCount: 2, nearestDistance: 3, nearestName: 'zombie', hasWeapon: true }), 'retreat')
  assert.equal(defensiveResponse({ health: 20, hostileCount: 1, nearestDistance: 2, nearestName: 'creeper', hasWeapon: true }), 'retreat')
  assert.equal(defensiveResponse({ health: 20, hostileCount: 1, nearestDistance: 3, nearestName: 'skeleton', hasWeapon: true }), 'retreat')
})

test('backs off reconnect attempts with a bounded delay', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8].map(reconnectDelay), [1_000, 2_000, 4_000, 8_000, 15_000, 15_000])
})

test('selects a walkable local recovery cell toward the original target', () => {
  const cell = navigationRecoveryCell([
    { offsetX: 0, offsetZ: 0, position: { x: 10, y: 70, z: 10 }, state: 'walkable' },
    { offsetX: 1, offsetZ: 0, position: { x: 11, y: 70, z: 10 }, state: 'hazard' },
    { offsetX: -1, offsetZ: 0, position: { x: 9, y: 70, z: 10 }, state: 'walkable' },
    { offsetX: 0, offsetZ: 1, position: { x: 10, y: 70, z: 11 }, state: 'walkable' },
  ], { x: 20, y: 70, z: 10 })
  assert.deepEqual(cell?.position, { x: 10, y: 70, z: 11 })
})

test('selects a bounded grounded descent and ignores void or excessive drops', () => {
  const cell = navigationDescentCell([
    { offsetX: 1, offsetZ: 0, position: { x: 11, y: 69, z: 10 }, state: 'drop', ground: 'grass_block' },
    { offsetX: 0, offsetZ: 1, position: { x: 10, y: 69, z: 11 }, state: 'drop' },
    { offsetX: -1, offsetZ: 0, position: { x: 9, y: 68, z: 10 }, state: 'drop', ground: 'dirt' },
    { offsetX: 0, offsetZ: -1, position: { x: 10, y: 72, z: 9 }, state: 'walkable', ground: 'dark_oak_leaves' },
  ], { x: 10, y: 73, z: 10 }, { x: 20, y: 69, z: 10 })
  assert.deepEqual(cell?.position, { x: 11, y: 69, z: 10 })
})
