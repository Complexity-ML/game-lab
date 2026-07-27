export const gameActionTypes = [
  'move_to', 'follow_route', 'interact', 'enter_vehicle', 'exit_vehicle',
  'navigate_to', 'jump', 'mine_block', 'place_block', 'craft_item', 'equip_item', 'attack_entity', 'use_item',
  'wait', 'stop',
] as const

export type GameActionType = typeof gameActionTypes[number]
export type GameObservationSource = 'manual' | 'startup' | 'autonomous_loop' | 'post_action' | 'card_rework'
export type GameActivityState = 'connecting' | 'safe' | 'threat_detected' | 'defending' | 'evading' | 'acting' | 'blocked' | 'stopped' | 'disconnected'

export interface GameActionArguments {
  targetX?: number
  targetY?: number
  targetZ?: number
  entityId?: string
  routeId?: string
  interaction?: string
  durationMs?: number
  itemName?: string
  blockName?: string
  count?: number
  face?: 'up' | 'down' | 'north' | 'south' | 'east' | 'west'
  maxDistance?: number
}

export interface GameActionCommand {
  commandId: string
  checkpointId: string
  action: GameActionType
  arguments: GameActionArguments
  requestedAt: string
}

export interface GameActionReceipt {
  commandId: string
  checkpointId: string
  action: GameActionType
  status: 'accepted' | 'completed' | 'rejected' | 'failed' | 'stopped'
  summary: string
  receivedAt: string
}

export interface GameObservation {
  protocol: 'game-lab.control.v1'
  observationId: string
  checkpointId: string
  capturedAt: string
  sessionId: string
  player: {
    position: { x: number; y: number; z: number }
    heading: number
    speed: number
    health: number
    armor: number
    inVehicle: boolean
  }
  mission: {
    id?: string
    objective: string
    stage: string
    completed: boolean
  }
  activity?: {
    state: GameActivityState
    reason: string
    source: GameObservationSource
    lastAction: string
    stateChangedAt: string
    healthDelta: number
    hostileCount: number
    nearestHostile?: { id: string; state?: string; distance: number }
  }
  environment: {
    area: string
    weather?: string
    time?: string
    threatLevel: 'none' | 'low' | 'medium' | 'high'
  }
  nearby: Array<{
    id: string
    kind: 'player' | 'npc' | 'vehicle' | 'object' | 'checkpoint'
    distance: number
    state?: string
    position?: { x: number; y: number; z: number }
  }>
  gameState?: {
    kind: 'minecraft'
    version: string
    dimension: string
    food: number
    saturation: number
    experienceLevel: number
    supportBlock?: string
    surfaceState?: 'ground' | 'canopy' | 'airborne'
    inventory: Array<{ name: string; count: number; slot: number }>
    nearbyBlocks: Array<{ name: string; position: { x: number; y: number; z: number }; distance: number }>
    localMap?: {
      radius: number
      diameter: number
      origin: { x: number; y: number; z: number }
      counts: { walkable: number; blocked: number; hazard: number; drop: number }
      cells: Array<{
        offsetX: number
        offsetZ: number
        position: { x: number; y: number; z: number }
        state: 'walkable' | 'blocked' | 'hazard' | 'drop'
        ground?: string
      }>
    }
  }
}

export interface GameBridgeSettings {
  endpoint: string
}

export interface GameBridgeStatus {
  mode: 'disconnected' | 'connected'
  protocol: 'game-lab.control.v1'
  endpoint: string
  message: string
  game?: string
  adapterVersion?: string
  sessionId?: string
  lastObservationAt?: string
}

export interface GameCheckpointSummary {
  id: string
  kind: 'observation' | 'action'
  checkpointId: string
  observationId?: string
  commandId?: string
  action?: GameActionType
  status: string
  summary: string
  createdAt: string
}
