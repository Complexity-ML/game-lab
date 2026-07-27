export const gameActionTypes = ['move_to', 'follow_route', 'interact', 'enter_vehicle', 'exit_vehicle', 'wait', 'stop'] as const

export type GameActionType = typeof gameActionTypes[number]

export interface GameActionArguments {
  targetX?: number
  targetY?: number
  targetZ?: number
  entityId?: string
  routeId?: string
  interaction?: string
  durationMs?: number
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
  }>
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
