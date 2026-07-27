import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
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

const navigationHazards = new Set([
  'bubble_column', 'cactus', 'campfire', 'fire', 'lava', 'magma_block', 'powder_snow',
  'soul_campfire', 'soul_fire', 'sweet_berry_bush', 'water', 'wither_rose',
])

export interface LocalNavigationCell {
  offsetX: number
  offsetZ: number
  position: { x: number; y: number; z: number }
  state: 'walkable' | 'blocked' | 'hazard' | 'drop'
  ground?: string
}

export function buildLocalNavigationMap(bot: Bot, radius = 5) {
  const origin = bot.entity.position.floored()
  const cells: LocalNavigationCell[] = []
  for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const x = origin.x + offsetX
      const z = origin.z + offsetZ
      let ground
      for (let y = origin.y + 1; y >= origin.y - 4; y -= 1) {
        const candidate = bot.blockAt(new Vec3(x, y, z))
        if (candidate?.boundingBox === 'block') {
          ground = candidate
          break
        }
      }
      if (!ground) {
        cells.push({ offsetX, offsetZ, position: { x, y: origin.y - 4, z }, state: 'drop' })
        continue
      }
      const feet = bot.blockAt(ground.position.offset(0, 1, 0))
      const head = bot.blockAt(ground.position.offset(0, 2, 0))
      const hazardous = [ground, feet, head].some((block) => block && navigationHazards.has(block.name))
      const clearanceBlocked = [feet, head].some((block) => block && block.boundingBox !== 'empty')
      const verticalDelta = ground.position.y - (origin.y - 1)
      const state = hazardous
        ? 'hazard' as const
        : clearanceBlocked || verticalDelta > 1
          ? 'blocked' as const
          : verticalDelta < -1
            ? 'drop' as const
            : 'walkable' as const
      cells.push({
        offsetX,
        offsetZ,
        position: { x, y: ground.position.y + 1, z },
        state,
        ground: ground.name,
      })
    }
  }
  const counts = {
    walkable: cells.filter((cell) => cell.state === 'walkable').length,
    blocked: cells.filter((cell) => cell.state === 'blocked').length,
    hazard: cells.filter((cell) => cell.state === 'hazard').length,
    drop: cells.filter((cell) => cell.state === 'drop').length,
  }
  return { radius, diameter: radius * 2 + 1, origin: { x: origin.x, y: origin.y, z: origin.z }, counts, cells }
}

export function buildObservation(bot: Bot, runtime: ObservationRuntime) {
  const position = bot.entity.position
  const support = bot.blockAt(position.floored().offset(0, -1, 0))
  const supportBlock = support?.name
  const surfaceState = support?.boundingBox !== 'block'
    ? 'airborne' as const
    : /_leaves$/.test(support.name)
      ? 'canopy' as const
      : 'ground' as const
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
      supportBlock,
      surfaceState,
      inventory: bot.inventory.items().slice(0, 46).map((item) => ({ name: item.name, count: item.count, slot: item.slot })),
      nearbyBlocks: nearbyBlocks(bot),
      localMap: buildLocalNavigationMap(bot),
    },
  }
}
