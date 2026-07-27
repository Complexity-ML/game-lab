interface MiningBlock {
  name: string
  harvestTools?: Record<string, boolean>
  canHarvest(itemType: number | null): boolean
  digTime(itemType: number | null, creative: boolean, inWater: boolean, notOnGround: boolean, enchantments?: Array<{ name: string; lvl: number }>): number
}

interface MiningTool {
  name: string
  type: number
  maxDurability: number
  durabilityUsed: number
  enchants: Array<{ name: string; lvl: number }>
}

const lightNavigationObstructions = new Set([
  'azalea',
  'cave_vines',
  'cave_vines_plant',
  'dead_bush',
  'fern',
  'flowering_azalea',
  'glow_lichen',
  'hanging_roots',
  'large_fern',
  'moss_carpet',
  'short_grass',
  'snow',
  'tall_grass',
  'twisting_vines',
  'twisting_vines_plant',
  'vine',
  'weeping_vines',
  'weeping_vines_plant',
])

export function isLightNavigationObstruction(blockName: string) {
  return /_leaves$/.test(blockName) || lightNavigationObstructions.has(blockName)
}

export function selectBestMiningTool<T extends MiningTool>(block: MiningBlock, inventory: T[], requireHarvest = true) {
  const handTime = block.digTime(null, false, false, false)
  const tools = inventory
    .filter((item) => /(?:_pickaxe|_axe|_shovel|_hoe|_sword|shears)$/.test(item.name))
    .filter((item) => !item.maxDurability || item.maxDurability - item.durabilityUsed > 1)
    .map((item) => ({
      item,
      harvests: block.canHarvest(item.type),
      digTime: block.digTime(item.type, false, false, false, item.enchants),
    }))
    .sort((left, right) => Number(right.harvests) - Number(left.harvests) || left.digTime - right.digTime)
  const best = tools[0]
  if (requireHarvest && block.harvestTools && !best?.harvests) throw new Error(`No suitable harvesting tool for ${block.name}`)
  return best && best.digTime < handTime
    ? { item: best.item, digTime: best.digTime, handTime }
    : { item: undefined, digTime: handTime, handTime }
}
