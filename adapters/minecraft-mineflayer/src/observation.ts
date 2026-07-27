import type { Bot } from 'mineflayer'

export interface ObservationRuntime {
  checkpointId: string
  observationId: string
  sessionId: string
  objective: string
  stage: string
}

function distance(left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) {
  return Math.sqrt((left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2)
}

function nearbyBlocks(bot: Bot) {
  const origin = bot.entity.position
  const blocks: Array<{ name: string; position: { x: number; y: number; z: number }; distance: number }> = []
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -4; x <= 4; x += 1) {
      for (let z = -4; z <= 4; z += 1) {
        const position = origin.offset(x, y, z).floored()
        const block = bot.blockAt(position)
        if (!block || ['air', 'cave_air', 'void_air'].includes(block.name)) continue
        blocks.push({
          name: block.name,
          position: { x: position.x, y: position.y, z: position.z },
          distance: Number(distance(origin, position).toFixed(2)),
        })
      }
    }
  }
  return blocks.sort((left, right) => left.distance - right.distance).slice(0, 64)
}

export function buildObservation(bot: Bot, runtime: ObservationRuntime) {
  const position = bot.entity.position
  const entities = Object.values(bot.entities)
    .filter((entity) => entity !== bot.entity && entity.position)
    .map((entity) => ({
      id: `entity-${entity.id}`,
      kind: entity.type === 'player' ? 'player' as const : entity.type === 'mob' ? 'npc' as const : entity.type === 'object' ? 'object' as const : 'object' as const,
      distance: Number(distance(position, entity.position).toFixed(2)),
      state: `${entity.name ?? entity.displayName ?? entity.type}`.slice(0, 120),
    }))
    .filter((entity) => entity.distance <= 64)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 32)
  const timeOfDay = bot.time?.timeOfDay ?? 0
  return {
    protocol: 'game-lab.control.v1' as const,
    observationId: runtime.observationId,
    checkpointId: runtime.checkpointId,
    capturedAt: new Date().toISOString(),
    sessionId: runtime.sessionId,
    player: {
      position: { x: position.x, y: position.y, z: position.z },
      heading: ((bot.entity.yaw * 180 / Math.PI) + 360) % 360,
      speed: Number(Math.sqrt(bot.entity.velocity.x ** 2 + bot.entity.velocity.y ** 2 + bot.entity.velocity.z ** 2).toFixed(3)),
      health: bot.health,
      armor: 0,
      inVehicle: false,
    },
    mission: {
      id: 'minecraft-private-mission',
      objective: runtime.objective,
      stage: runtime.stage,
      completed: false,
    },
    environment: {
      area: bot.game?.dimension ?? 'minecraft:unknown',
      weather: bot.isRaining ? 'rain' : 'clear',
      time: String(timeOfDay),
      threatLevel: entities.some((entity) => entity.kind === 'npc' && /zombie|skeleton|creeper|spider|witch|pillager/i.test(entity.state)) ? 'medium' as const : 'none' as const,
    },
    nearby: entities,
    gameState: {
      kind: 'minecraft' as const,
      version: bot.version,
      dimension: bot.game?.dimension ?? 'minecraft:unknown',
      food: bot.food,
      saturation: bot.foodSaturation,
      experienceLevel: bot.experience.level,
      inventory: bot.inventory.items().slice(0, 46).map((item) => ({ name: item.name, count: item.count, slot: item.slot })),
      nearbyBlocks: nearbyBlocks(bot),
    },
  }
}
