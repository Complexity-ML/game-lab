import { createHash, randomUUID } from 'node:crypto'

export const GAME_BRIDGE_PROTOCOL = 'game-lab.control.v1' as const
const DEFAULT_ENDPOINT = 'http://127.0.0.1:4317'
const TIMEOUT_MS = 4_000
const ACTION_TIMEOUT_MS = 75_000
const MAX_RESPONSE_BYTES = 256_000
const actionTypes = new Set([
  'move_to', 'follow_route', 'interact', 'enter_vehicle', 'exit_vehicle',
  'navigate_to', 'mine_block', 'place_block', 'craft_item', 'equip_item', 'attack_entity', 'use_item',
  'wait', 'stop',
])
const activityStates = new Set(['connecting', 'safe', 'threat_detected', 'evading', 'acting', 'blocked', 'stopped', 'disconnected'])
const observationSources = new Set(['manual', 'startup', 'autonomous_loop', 'post_action', 'card_rework'])

type SettingsStore = {
  load(key: string): string | null
  save(key: string, value: string): void
}

type CheckpointStore = {
  save(input: {
    kind: 'observation' | 'action'
    checkpointId: string
    observationId?: string
    commandId?: string
    action?: string
    status: string
    summary: string
  }): unknown
}

type JsonRecord = Record<string, unknown>

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as JsonRecord
}

function boundedText(value: unknown, label: string, maximum: number, fallback?: string) {
  if (typeof value !== 'string' || !value.trim()) {
    if (fallback !== undefined) return fallback
    throw new Error(`${label} is required`)
  }
  return value.trim().slice(0, maximum)
}

function boundedNumber(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
  return Math.max(minimum, Math.min(maximum, value))
}

function optionalBoundedNumber(value: unknown, label: string, minimum: number, maximum: number) {
  return value === null || value === undefined ? undefined : boundedNumber(value, label, minimum, maximum)
}

function optionalIdentifier(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return undefined
  const result = boundedText(value, label, 120)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(result)) throw new Error(`${label} is not a safe identifier`)
  return result
}

function safeEndpoint(value: unknown) {
  const input = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ENDPOINT
  let url: URL
  try { url = new URL(input) } catch { throw new Error('Game Bridge endpoint must be a valid URL') }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('Game Bridge v1 accepts only a local HTTP endpoint on this machine')
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Game Bridge endpoint cannot contain credentials, query parameters or fragments')
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

async function jsonRequest(endpoint: string, path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS) {
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await response.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Game Bridge response exceeds 256 KB')
  if (!response.ok) throw new Error(`Game Bridge ${response.status}: ${body.slice(0, 240) || response.statusText}`)
  try { return JSON.parse(body) as unknown } catch { throw new Error('Game Bridge returned invalid JSON') }
}

function normalizeStatus(value: unknown, endpoint: string) {
  const input = record(value, 'Game Bridge status')
  if (input.protocol !== GAME_BRIDGE_PROTOCOL) throw new Error(`Unsupported Game Bridge protocol: ${String(input.protocol ?? 'missing')}`)
  return {
    mode: 'connected' as const,
    protocol: GAME_BRIDGE_PROTOCOL,
    endpoint,
    message: boundedText(input.message, 'Game Bridge status message', 280, 'Local game adapter connected'),
    game: typeof input.game === 'string' ? input.game.trim().slice(0, 80) : undefined,
    adapterVersion: typeof input.adapterVersion === 'string' ? input.adapterVersion.trim().slice(0, 40) : undefined,
    sessionId: optionalIdentifier(input.sessionId, 'Game Bridge session ID'),
    lastObservationAt: typeof input.lastObservationAt === 'string' ? input.lastObservationAt.slice(0, 40) : undefined,
  }
}

function normalizeObservation(value: unknown) {
  const input = record(value, 'Game observation')
  const player = record(input.player, 'Game observation player')
  const position = record(player.position, 'Game observation player position')
  const mission = record(input.mission, 'Game observation mission')
  const environment = record(input.environment, 'Game observation environment')
  if (input.protocol !== GAME_BRIDGE_PROTOCOL) throw new Error('Game observation uses an unsupported protocol')
  const threatLevel = ['none', 'low', 'medium', 'high'].includes(String(environment.threatLevel)) ? environment.threatLevel as 'none' | 'low' | 'medium' | 'high' : 'none'
  const nearby = Array.isArray(input.nearby) ? input.nearby.slice(0, 32).map((entry, index) => {
    const item = record(entry, `Nearby entity ${index + 1}`)
    const kind = ['player', 'npc', 'vehicle', 'object', 'checkpoint'].includes(String(item.kind)) ? item.kind as 'player' | 'npc' | 'vehicle' | 'object' | 'checkpoint' : 'object'
    const entityPosition = item.position && typeof item.position === 'object' && !Array.isArray(item.position)
      ? item.position as JsonRecord
      : undefined
    return {
      id: optionalIdentifier(item.id, `Nearby entity ${index + 1} id`) ?? `entity-${index + 1}`,
      kind,
      distance: boundedNumber(item.distance, `Nearby entity ${index + 1} distance`, 0, 10_000),
      state: typeof item.state === 'string' ? item.state.trim().slice(0, 120) : undefined,
      ...(entityPosition ? {
        position: {
          x: boundedNumber(entityPosition.x, `Nearby entity ${index + 1} x`, -30_000_000, 30_000_000),
          y: boundedNumber(entityPosition.y, `Nearby entity ${index + 1} y`, -2_048, 2_048),
          z: boundedNumber(entityPosition.z, `Nearby entity ${index + 1} z`, -30_000_000, 30_000_000),
        },
      } : {}),
    }
  }) : []
  const rawActivity = input.activity && typeof input.activity === 'object' && !Array.isArray(input.activity)
    ? input.activity as JsonRecord
    : undefined
  const rawNearestHostile = rawActivity?.nearestHostile && typeof rawActivity.nearestHostile === 'object' && !Array.isArray(rawActivity.nearestHostile)
    ? rawActivity.nearestHostile as JsonRecord
    : undefined
  const fallbackActivityState = threatLevel === 'none' ? 'safe' : 'threat_detected'
  const activityState = activityStates.has(String(rawActivity?.state)) ? String(rawActivity?.state) as 'connecting' | 'safe' | 'threat_detected' | 'evading' | 'acting' | 'blocked' | 'stopped' | 'disconnected' : fallbackActivityState
  const activitySource = observationSources.has(String(rawActivity?.source)) ? String(rawActivity?.source) as 'manual' | 'startup' | 'autonomous_loop' | 'post_action' | 'card_rework' : 'manual'
  const activity = {
    state: activityState,
    reason: boundedText(rawActivity?.reason, 'Game activity reason', 500, threatLevel === 'none' ? 'No active threat reported' : `Threat level ${threatLevel}`),
    source: activitySource,
    lastAction: boundedText(rawActivity?.lastAction, 'Game activity last action', 500, 'Observation captured'),
    stateChangedAt: boundedText(rawActivity?.stateChangedAt, 'Game activity state timestamp', 40, String(input.capturedAt ?? new Date().toISOString())),
    healthDelta: optionalBoundedNumber(rawActivity?.healthDelta, 'Game activity health delta', -10_000, 10_000) ?? 0,
    hostileCount: optionalBoundedNumber(rawActivity?.hostileCount, 'Game activity hostile count', 0, 32) ?? 0,
    ...(rawNearestHostile ? {
      nearestHostile: {
        id: optionalIdentifier(rawNearestHostile.id, 'Nearest hostile ID') ?? 'hostile-unknown',
        state: typeof rawNearestHostile.state === 'string' ? rawNearestHostile.state.trim().slice(0, 120) : undefined,
        distance: boundedNumber(rawNearestHostile.distance, 'Nearest hostile distance', 0, 10_000),
      },
    } : {}),
  }
  const rawGameState = input.gameState && typeof input.gameState === 'object' && !Array.isArray(input.gameState)
    ? input.gameState as JsonRecord
    : undefined
  const gameState = rawGameState?.kind === 'minecraft'
    ? {
        kind: 'minecraft' as const,
        version: boundedText(rawGameState.version, 'Minecraft version', 40, 'unknown'),
        dimension: boundedText(rawGameState.dimension, 'Minecraft dimension', 80, 'unknown'),
        food: boundedNumber(rawGameState.food, 'Minecraft food', 0, 20),
        saturation: boundedNumber(rawGameState.saturation, 'Minecraft saturation', 0, 20),
        experienceLevel: boundedNumber(rawGameState.experienceLevel, 'Minecraft experience level', 0, 1_000_000),
        inventory: Array.isArray(rawGameState.inventory) ? rawGameState.inventory.slice(0, 46).map((entry, index) => {
          const item = record(entry, `Minecraft inventory item ${index + 1}`)
          return {
            name: boundedText(item.name, `Minecraft inventory item ${index + 1} name`, 100),
            count: boundedNumber(item.count, `Minecraft inventory item ${index + 1} count`, 0, 99_999),
            slot: boundedNumber(item.slot, `Minecraft inventory item ${index + 1} slot`, -1, 255),
          }
        }) : [],
        nearbyBlocks: Array.isArray(rawGameState.nearbyBlocks) ? rawGameState.nearbyBlocks.slice(0, 64).map((entry, index) => {
          const block = record(entry, `Minecraft nearby block ${index + 1}`)
          const blockPosition = record(block.position, `Minecraft nearby block ${index + 1} position`)
          return {
            name: boundedText(block.name, `Minecraft nearby block ${index + 1} name`, 100),
            position: {
              x: boundedNumber(blockPosition.x, `Minecraft nearby block ${index + 1} x`, -30_000_000, 30_000_000),
              y: boundedNumber(blockPosition.y, `Minecraft nearby block ${index + 1} y`, -2_048, 2_048),
              z: boundedNumber(blockPosition.z, `Minecraft nearby block ${index + 1} z`, -30_000_000, 30_000_000),
            },
            distance: boundedNumber(block.distance, `Minecraft nearby block ${index + 1} distance`, 0, 256),
          }
        }) : [],
      }
    : undefined
  return {
    protocol: GAME_BRIDGE_PROTOCOL,
    observationId: optionalIdentifier(input.observationId, 'Observation ID') ?? `observation-${randomUUID()}`,
    checkpointId: optionalIdentifier(input.checkpointId, 'Checkpoint ID') ?? `checkpoint-${randomUUID()}`,
    capturedAt: boundedText(input.capturedAt, 'Observation timestamp', 40, new Date().toISOString()),
    sessionId: optionalIdentifier(input.sessionId, 'Observation session ID') ?? 'local-session',
    player: {
      position: {
        x: boundedNumber(position.x, 'Player x', -100_000, 100_000),
        y: boundedNumber(position.y, 'Player y', -100_000, 100_000),
        z: boundedNumber(position.z, 'Player z', -10_000, 100_000),
      },
      heading: boundedNumber(player.heading, 'Player heading', 0, 360),
      speed: boundedNumber(player.speed, 'Player speed', 0, 1_000),
      health: boundedNumber(player.health, 'Player health', 0, 10_000),
      armor: boundedNumber(player.armor, 'Player armor', 0, 10_000),
      inVehicle: player.inVehicle === true,
    },
    mission: {
      id: optionalIdentifier(mission.id, 'Mission ID'),
      objective: boundedText(mission.objective, 'Mission objective', 500, 'Observe the authorized private session'),
      stage: boundedText(mission.stage, 'Mission stage', 120, 'unknown'),
      completed: mission.completed === true,
    },
    activity,
    environment: {
      area: boundedText(environment.area, 'Environment area', 120, 'unknown'),
      weather: typeof environment.weather === 'string' ? environment.weather.trim().slice(0, 80) : undefined,
      time: typeof environment.time === 'string' ? environment.time.trim().slice(0, 40) : undefined,
      threatLevel,
    },
    nearby,
    ...(gameState ? { gameState } : {}),
  }
}

function normalizeCommand(value: unknown) {
  const input = record(value, 'Game action')
  const args = record(input.arguments ?? {}, 'Game action arguments')
  const action = boundedText(input.action, 'Game action type', 40)
  if (!actionTypes.has(action)) throw new Error('Game action is not allowlisted')
  const checkpointId = optionalIdentifier(input.checkpointId, 'Game action checkpoint ID')
  if (!checkpointId) throw new Error('Game action requires the exact observation checkpoint ID')
  return {
    commandId: optionalIdentifier(input.commandId, 'Game action command ID') ?? `command-${randomUUID()}`,
    checkpointId,
    action,
    arguments: {
      targetX: optionalBoundedNumber(args.targetX, 'targetX', -100_000, 100_000),
      targetY: optionalBoundedNumber(args.targetY, 'targetY', -100_000, 100_000),
      targetZ: optionalBoundedNumber(args.targetZ, 'targetZ', -10_000, 100_000),
      entityId: optionalIdentifier(args.entityId, 'entityId'),
      routeId: optionalIdentifier(args.routeId, 'routeId'),
      interaction: typeof args.interaction === 'string' ? args.interaction.trim().slice(0, 120) : undefined,
      durationMs: optionalBoundedNumber(args.durationMs, 'durationMs', 0, 60_000),
      itemName: optionalIdentifier(args.itemName, 'itemName'),
      blockName: optionalIdentifier(args.blockName, 'blockName'),
      count: optionalBoundedNumber(args.count, 'count', 1, 64),
      face: ['up', 'down', 'north', 'south', 'east', 'west'].includes(String(args.face)) ? args.face as 'up' | 'down' | 'north' | 'south' | 'east' | 'west' : undefined,
      maxDistance: optionalBoundedNumber(args.maxDistance, 'maxDistance', 1, 128),
    },
    requestedAt: new Date().toISOString(),
  }
}

export class GameBridgeClient {
  constructor(private readonly settings: SettingsStore, private readonly checkpoints: CheckpointStore) {}

  configuration() {
    return { endpoint: safeEndpoint(this.settings.load('game-bridge-endpoint') ?? DEFAULT_ENDPOINT) }
  }

  saveConfiguration(value: unknown) {
    const input = record(value, 'Game Bridge settings')
    const endpoint = safeEndpoint(input.endpoint)
    this.settings.save('game-bridge-endpoint', endpoint)
    return { endpoint }
  }

  async status() {
    const { endpoint } = this.configuration()
    try {
      return normalizeStatus(await jsonRequest(endpoint, '/v1/status'), endpoint)
    } catch (error) {
      return {
        mode: 'disconnected' as const,
        protocol: GAME_BRIDGE_PROTOCOL,
        endpoint,
        message: error instanceof Error ? error.message : 'Game Bridge is unavailable',
      }
    }
  }

  async observation(source: unknown = 'manual') {
    const { endpoint } = this.configuration()
    const normalizedSource = observationSources.has(String(source)) ? String(source) : 'manual'
    const observation = normalizeObservation(await jsonRequest(endpoint, `/v1/observation?source=${encodeURIComponent(normalizedSource)}`))
    const healthDelta = observation.activity.healthDelta === 0 ? '0' : observation.activity.healthDelta > 0 ? `+${observation.activity.healthDelta}` : String(observation.activity.healthDelta)
    const nearestHostile = observation.activity.nearestHostile
      ? `; nearest_hostile=${observation.activity.nearestHostile.state ?? observation.activity.nearestHostile.id}@${observation.activity.nearestHostile.distance}`
      : ''
    const summary = `state=${observation.activity.state}; source=${observation.activity.source}; reason=${observation.activity.reason}; last_action=${observation.activity.lastAction}; health=${observation.player.health}; health_delta=${healthDelta}; threat=${observation.environment.threatLevel}; hostiles=${observation.activity.hostileCount}${nearestHostile}; nearby=${observation.nearby.length}`
    this.checkpoints.save({
      kind: 'observation',
      checkpointId: observation.checkpointId,
      observationId: observation.observationId,
      status: 'captured',
      summary,
    })
    return observation
  }

  async execute(value: unknown) {
    const { endpoint } = this.configuration()
    const command = normalizeCommand(value)
    const response = record(await jsonRequest(endpoint, '/v1/actions', { method: 'POST', body: JSON.stringify(command) }, ACTION_TIMEOUT_MS), 'Game action receipt')
    const status = ['accepted', 'completed', 'rejected', 'failed', 'stopped'].includes(String(response.status)) ? response.status as 'accepted' | 'completed' | 'rejected' | 'failed' | 'stopped' : 'failed'
    const receipt = {
      commandId: command.commandId,
      checkpointId: command.checkpointId,
      action: command.action,
      status,
      summary: boundedText(response.summary, 'Game action receipt summary', 500, `${command.action} ${status}`),
      receivedAt: new Date().toISOString(),
    }
    this.checkpoints.save({
      kind: 'action',
      checkpointId: receipt.checkpointId,
      commandId: receipt.commandId,
      action: receipt.action,
      status: receipt.status,
      summary: receipt.summary,
    })
    return receipt
  }

  async emergencyStop() {
    const { endpoint } = this.configuration()
    const commandId = `stop-${createHash('sha256').update(`${Date.now()}:${randomUUID()}`).digest('hex').slice(0, 20)}`
    try {
      const response = record(await jsonRequest(endpoint, '/v1/stop', { method: 'POST', body: JSON.stringify({ commandId, requestedAt: new Date().toISOString() }) }), 'Emergency stop receipt')
      return { stopped: response.stopped !== false, commandId, summary: boundedText(response.summary, 'Emergency stop summary', 500, 'Game adapter stopped') }
    } catch (error) {
      return { stopped: false, commandId, summary: error instanceof Error ? error.message : 'Game adapter stop failed' }
    }
  }
}
