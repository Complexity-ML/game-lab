import type { Bot } from 'mineflayer'
import minecraftData from 'minecraft-data'

export interface RecipeItemLike {
  id: number
  count: number
}

export interface RecipeLike {
  result: RecipeItemLike
  delta: RecipeItemLike[]
  requiresTable: boolean
}

export interface CraftingIngredientStatus {
  itemName: string
  required: number
  available: number
  missing: number
  crafted: number
}

export interface CraftingMotorStep {
  id: string
  kind: 'craft' | 'place_table' | 'approach_table'
  itemName: string
  count: number
  operations?: number
  requiresTable?: boolean
  ingredients?: Array<{ itemName: string; count: number }>
  status: 'planned' | 'completed' | 'failed'
  summary: string
}

export interface CraftingMotorPlan {
  targetItem: string
  requestedCount: number
  feasible: boolean
  requiresTable: boolean
  tableAvailable: boolean
  ingredients: CraftingIngredientStatus[]
  steps: CraftingMotorStep[]
}

interface PlannerContext {
  itemId(itemName: string): number | undefined
  itemName(itemId: number): string
  recipesFor(itemId: number): RecipeLike[]
  inventory: Array<{ type: number; count: number }>
  tableAvailable: boolean
}

interface PlanningState {
  counts: Map<number, number>
  initialCounts: Map<number, number>
  craftedCounts: Map<number, number>
  requiredCounts: Map<number, number>
  missingCounts: Map<number, number>
  steps: CraftingMotorStep[]
  tableAvailable: boolean
  tableRequired: boolean
}

const maximumRecipeDepth = 12
const maximumCraftingSteps = 64

function addCount(counts: Map<number, number>, itemId: number, count: number) {
  counts.set(itemId, (counts.get(itemId) ?? 0) + count)
}

function cloneState(state: PlanningState): PlanningState {
  return {
    counts: new Map(state.counts),
    initialCounts: state.initialCounts,
    craftedCounts: new Map(state.craftedCounts),
    requiredCounts: new Map(state.requiredCounts),
    missingCounts: new Map(state.missingCounts),
    steps: state.steps.map((step) => ({ ...step, ingredients: step.ingredients?.map((item) => ({ ...item })) })),
    tableAvailable: state.tableAvailable,
    tableRequired: state.tableRequired,
  }
}

function score(state: PlanningState) {
  const missing = [...state.missingCounts.values()].reduce((total, count) => total + count, 0)
  return missing * 10_000 + state.requiredCounts.size * 10 + state.steps.length
}

function recipeInputs(recipe: RecipeLike) {
  return recipe.delta
    .filter((item) => item.id >= 0 && item.count < 0)
    .map((item) => ({ id: item.id, count: Math.abs(item.count) }))
}

function ensureCraftingTable(context: PlannerContext, state: PlanningState, trail: Set<number>, depth: number) {
  if (state.tableAvailable) return state
  const tableId = context.itemId('crafting_table')
  if (tableId === undefined) return state
  let next = state
  addCount(next.requiredCounts, tableId, 1)
  if ((next.counts.get(tableId) ?? 0) < 1) next = ensureItem(context, next, tableId, 1, trail, depth + 1)
  if ((next.counts.get(tableId) ?? 0) < 1) return next
  addCount(next.counts, tableId, -1)
  next.tableAvailable = true
  next.tableRequired = true
  next.steps.push({
    id: `craft-step-${next.steps.length + 1}`,
    kind: 'place_table',
    itemName: 'crafting_table',
    count: 1,
    status: 'planned',
    summary: 'Place one crafting table on a safe adjacent block',
  })
  return next
}

function ensureItem(
  context: PlannerContext,
  state: PlanningState,
  itemId: number,
  requiredAvailable: number,
  trail: Set<number>,
  depth: number,
): PlanningState {
  const available = state.counts.get(itemId) ?? 0
  if (available >= requiredAvailable) return state
  const shortfall = requiredAvailable - available
  if (depth > maximumRecipeDepth || trail.has(itemId) || state.steps.length >= maximumCraftingSteps) {
    addCount(state.missingCounts, itemId, shortfall)
    addCount(state.counts, itemId, shortfall)
    return state
  }
  const recipes = context.recipesFor(itemId)
  if (!recipes.length) {
    addCount(state.missingCounts, itemId, shortfall)
    addCount(state.counts, itemId, shortfall)
    return state
  }

  let best: PlanningState | undefined
  for (const recipe of recipes) {
    const resultCount = Math.max(1, recipe.result.count)
    const operations = Math.ceil(shortfall / resultCount)
    let candidate = cloneState(state)
    const nextTrail = new Set(trail).add(itemId)
    if (recipe.requiresTable) candidate = ensureCraftingTable(context, candidate, nextTrail, depth)
    const inputs = recipeInputs(recipe)
    for (const input of inputs) {
      const total = input.count * operations
      addCount(candidate.requiredCounts, input.id, total)
      candidate = ensureItem(context, candidate, input.id, total, nextTrail, depth + 1)
      addCount(candidate.counts, input.id, -total)
    }
    for (const delta of recipe.delta.filter((item) => item.count > 0)) addCount(candidate.counts, delta.id, delta.count * operations)
    addCount(candidate.craftedCounts, itemId, resultCount * operations)
    const itemName = context.itemName(itemId)
    candidate.tableRequired ||= recipe.requiresTable
    candidate.steps.push({
      id: `craft-step-${candidate.steps.length + 1}`,
      kind: 'craft',
      itemName,
      count: resultCount * operations,
      operations,
      requiresTable: recipe.requiresTable,
      ingredients: inputs.map((input) => ({ itemName: context.itemName(input.id), count: input.count * operations })),
      status: 'planned',
      summary: `Craft ${resultCount * operations} ${itemName}${recipe.requiresTable ? ' at the crafting table' : ' in the inventory grid'}`,
    })
    if (!best || score(candidate) < score(best)) best = candidate
  }
  return best ?? state
}

export function planCrafting(context: PlannerContext, targetItem: string, requestedCount: number): CraftingMotorPlan {
  const itemId = context.itemId(targetItem)
  if (itemId === undefined) throw new Error(`Unknown item ${targetItem}`)
  const initialCounts = new Map<number, number>()
  for (const item of context.inventory) addCount(initialCounts, item.type, item.count)
  const state = ensureItem(context, {
    counts: new Map(initialCounts),
    initialCounts,
    craftedCounts: new Map(),
    requiredCounts: new Map(),
    missingCounts: new Map(),
    steps: [],
    tableAvailable: context.tableAvailable,
    tableRequired: false,
  }, itemId, (initialCounts.get(itemId) ?? 0) + requestedCount, new Set(), 0)
  const ingredientIds = new Set([
    ...state.requiredCounts.keys(),
    ...state.missingCounts.keys(),
    ...state.craftedCounts.keys(),
  ])
  ingredientIds.delete(itemId)
  return {
    targetItem,
    requestedCount,
    feasible: [...state.missingCounts.values()].every((count) => count <= 0),
    requiresTable: state.tableRequired,
    tableAvailable: context.tableAvailable,
    ingredients: [...ingredientIds].map((dependencyId) => ({
      itemName: context.itemName(dependencyId),
      required: state.requiredCounts.get(dependencyId) ?? 0,
      available: state.initialCounts.get(dependencyId) ?? 0,
      missing: state.missingCounts.get(dependencyId) ?? 0,
      crafted: state.craftedCounts.get(dependencyId) ?? 0,
    })).sort((left, right) => right.missing - left.missing || left.itemName.localeCompare(right.itemName)),
    steps: state.steps,
  }
}

export function planBotCrafting(bot: Bot, targetItem: string, requestedCount: number) {
  const data = minecraftData(bot.version)
  const tableType = data.blocksByName.crafting_table?.id
  const tableAvailable = tableType !== undefined && Boolean(bot.findBlock({ matching: tableType, maxDistance: 32 }))
  return planCrafting({
    itemId: (itemName) => data.itemsByName[itemName]?.id,
    itemName: (itemId) => data.items[itemId]?.name ?? `item_${itemId}`,
    recipesFor: (itemId) => bot.recipesAll(itemId, null, true),
    inventory: bot.inventory.items().map((item) => ({ type: item.type, count: item.count })),
    tableAvailable,
  }, targetItem, requestedCount)
}
