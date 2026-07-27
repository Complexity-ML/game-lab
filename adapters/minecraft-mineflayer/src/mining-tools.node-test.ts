import assert from 'node:assert/strict'
import test from 'node:test'
import { isLightNavigationObstruction, selectBestMiningTool } from './mining-tools.js'

const tool = (name: string, type: number) => ({ name, type, maxDurability: 100, durabilityUsed: 0, enchants: [] })

test('selects the fastest suitable tool from inventory', () => {
  const selected = selectBestMiningTool({
    name: 'oak_log',
    canHarvest: () => true,
    digTime: (type) => type === 2 ? 600 : type === 1 ? 1_200 : 3_000,
  }, [tool('wooden_pickaxe', 1), tool('stone_axe', 2)])

  assert.equal(selected.item?.name, 'stone_axe')
  assert.equal(selected.digTime, 600)
})

test('refuses to destroy a harvest-sensitive block without its required tool', () => {
  assert.throws(() => selectBestMiningTool({
    name: 'diamond_ore',
    harvestTools: { 3: true },
    canHarvest: (type) => type === 3,
    digTime: () => 5_000,
  }, [tool('wooden_shovel', 2)]), /No suitable harvesting tool/)
})

test('allows only lightweight vegetation as a bounded navigation obstruction', () => {
  assert.equal(isLightNavigationObstruction('dark_oak_leaves'), true)
  assert.equal(isLightNavigationObstruction('vine'), true)
  assert.equal(isLightNavigationObstruction('stone'), false)
  assert.equal(isLightNavigationObstruction('red_mushroom_block'), false)
  assert.equal(isLightNavigationObstruction('lava'), false)
})
