import type { Bot } from 'mineflayer'
import { isHostileMob } from './safety.js'

export interface ObservationRuntime {
  checkpointId: string
  observationId: string
  sessionId: string
  objective: string
  stage: string
  stageChangedAt: string
  lastAction: string
  previousHealth?: number
  source: 'manual' | 'startup' | 'autonomous_loop' | 'post_action' | 'card_rework'
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
    .map((entity) => {
      const state = `${entity.name ?? entity.displayName ?? entity.type}`.slice(0, 120)
      return {
        id: `entity-${entity.id}`,
        kind: entity.type === 'player' ? 'player' as const : isHostileMob(state) || entity.type === 'mob' ? 'npc' as const : 'object' as const,
        distance: Number(distance(position, entity.position).toFixed(2)),
        state,
        position: { x: entity.position.x, y: entity.position.y, z: entity.position.z },
      }
    })
    .filter((entity) => entity.distance <= 64)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 32)
  const timeOfDay = bot.time?.timeOfDay ?? 0
  const hostileEntities = entities.filter((entity) => entity.kind === 'npc' && isHostileMob(entity.state))
  const threatLevel = hostileEntities.some((entity) => entity.distance <= 8)
    ? 'high' as const
    : hostileEntities.some((entity) => entity.distance <= 24)
      ? 'medium' as const
      : hostileEntities.length
        ? 'low' as const
        : 'none' as const
  const nearestHostile = hostileEntities[0]
  const activityState = ['defending', 'evading', 'acting', 'blocked', 'stopped', 'connecting', 'disconnected'].includes(runtime.stage)
    ? runtime.stage
    : threatLevel === 'none'
      ? 'safe'
      : 'threat_detected'
  const activityReason = activityState === 'safe'
    ? 'No hostile mob detected within 64 blocks'
    : activityState === 'threat_detected'
      ? `${hostileEntities.length} hostile mob${hostileEntities.length === 1 ? '' : 's'} visible; nearest ${nearestHostile?.state ?? 'hostile'} at ${nearestHostile?.distance ?? 'unknown'} blocks`
      : runtime.lastAction
  const healthDelta = runtime.previousHealth === undefined ? 0 : Number((bot.health - runtime.previousHealth).toFixed(3))
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
      stage: activityState,
      completed: false,
    },
    activity: {
      state: activityState,
      reason: activityReason,
      source: runtime.source,
      lastAction: runtime.lastAction,
      stateChangedAt: runtime.stageChangedAt,
      healthDelta,
      hostileCount: hostileEntities.length,
      ...(nearestHostile ? {
        nearestHostile: {
          id: nearestHostile.id,
          state: nearestHostile.state,
          distance: nearestHostile.distance,
        },
      } : {}),
    },
    environment: {
      area: bot.game?.dimension ?? 'minecraft:unknown',
      weather: bot.isRaining ? 'rain' : 'clear',
      time: String(timeOfDay),
      threatLevel,
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
