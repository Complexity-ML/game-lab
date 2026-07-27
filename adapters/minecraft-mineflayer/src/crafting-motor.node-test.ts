import assert from 'node:assert/strict'
import test from 'node:test'
import minecraftData from 'minecraft-data'
import recipeLoader from 'prismarine-recipe'
import { planCrafting } from './crafting-motor.js'

const data = minecraftData('26.2')
const Recipe = (recipeLoader as unknown as (registry: object) => {
  Recipe: { find(itemId: number, metadata: number | null): import('./crafting-motor.js').RecipeLike[] }
})(data).Recipe
const context = (inventory: Array<{ name: string; count: number }>, tableAvailable = false) => ({
  itemId: (itemName: string) => data.itemsByName[itemName]?.id,
  itemName: (itemId: number) => data.items[itemId]?.name ?? `item_${itemId}`,
  recipesFor: (itemId: number) => Recipe.find(itemId, null),
  inventory: inventory.map((item) => ({ type: data.itemsByName[item.name].id, count: item.count })),
  tableAvailable,
})

test('plans logs to planks, sticks, table and a wooden pickaxe', () => {
  const plan = planCrafting(context([{ name: 'oak_log', count: 3 }]), 'wooden_pickaxe', 1)

  assert.equal(plan.feasible, true)
  assert.equal(plan.requiresTable, true)
  assert.deepEqual(plan.steps.map((step) => `${step.kind}:${step.itemName}`), [
    'craft:oak_planks',
    'craft:crafting_table',
    'place_table:crafting_table',
    'craft:oak_planks',
    'craft:oak_planks',
    'craft:stick',
    'craft:wooden_pickaxe',
  ])
  assert.equal(plan.ingredients.find((item) => item.itemName === 'oak_log')?.missing, 0)
})

test('reports missing base ingredients without pretending the plan is executable', () => {
  const plan = planCrafting(context([{ name: 'oak_log', count: 1 }]), 'wooden_pickaxe', 1)

  assert.equal(plan.feasible, false)
  assert.equal(plan.ingredients.find((item) => item.itemName === 'oak_log')?.missing, 2)
})

test('reuses a nearby crafting table instead of planning placement', () => {
  const plan = planCrafting(context([{ name: 'oak_planks', count: 3 }, { name: 'stick', count: 2 }], true), 'wooden_pickaxe', 1)

  assert.equal(plan.feasible, true)
  assert.equal(plan.steps.some((step) => step.kind === 'place_table'), false)
  assert.equal(plan.steps.at(-1)?.itemName, 'wooden_pickaxe')
})
