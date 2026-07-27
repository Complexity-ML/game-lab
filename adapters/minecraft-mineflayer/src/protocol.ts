import { randomUUID } from 'node:crypto'

export const protocol = 'game-lab.control.v1' as const

export const actionTypes = [
  'move_to', 'navigate_to', 'jump', 'mine_block', 'place_block', 'craft_item',
  'equip_item', 'attack_entity', 'interact', 'use_item', 'wait', 'stop',
] as const

export type MinecraftAction = typeof actionTypes[number]

export function isImmediateAction(action: MinecraftAction) {
  return action === 'stop'
}

export function actionTimeoutMs(command: Pick<ActionCommand, 'action' | 'arguments'>) {
  if (command.action === 'stop') return 1_000
  if (command.action === 'wait') return Math.min(62_000, (command.arguments.durationMs ?? 1_000) + 2_000)
  if (command.action === 'mine_block' || command.action === 'place_block') return 38_000
  if (command.action === 'craft_item') return 150_000
  return 28_000
}

export interface ActionArguments {
  targetX?: number
  targetY?: number
  targetZ?: number
  entityId?: string
  interaction?: string
  durationMs?: number
  itemName?: string
  blockName?: string
  count?: number
  face?: 'up' | 'down' | 'north' | 'south' | 'east' | 'west'
  maxDistance?: number
}

export interface ActionCommand {
  commandId: string
  checkpointId: string
  action: MinecraftAction
  arguments: ActionArguments
  requestedAt: string
}

export interface ActionMicroEvent {
  id: string
  kind: 'recipe' | 'inventory' | 'craft' | 'placement' | 'navigation' | 'tool' | 'mine' | 'validation'
  status: 'planned' | 'running' | 'completed' | 'missing' | 'failed'
  summary: string
  itemName?: string
  count?: number
  available?: number
  missing?: number
}

export interface ActionExecutionReport {
  summary: string
  microActions?: ActionMicroEvent[]
  crafting?: {
    targetItem: string
    requestedCount: number
    feasible: boolean
    requiresTable: boolean
    ingredients: Array<{ itemName: string; required: number; available: number; missing: number; crafted: number }>
  }
}

export class ActionExecutionError extends Error {
  constructor(message: string, readonly report: ActionExecutionReport) {
    super(message)
    this.name = 'ActionExecutionError'
  }
}

type JsonRecord = Record<string, unknown>

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as JsonRecord
}

function optionalNumber(value: unknown, label: string, minimum: number, maximum: number) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`)
  return value
}

function optionalIdentifier(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value)) throw new Error(`${label} must be a safe identifier`)
  return value
}

export function parseActionCommand(value: unknown): ActionCommand {
  const input = record(value, 'Action command')
  const args = record(input.arguments ?? {}, 'Action arguments')
  if (typeof input.action !== 'string' || !actionTypes.includes(input.action as MinecraftAction)) throw new Error('Action is not in the Minecraft allowlist')
  const checkpointId = optionalIdentifier(input.checkpointId, 'checkpointId')
  if (!checkpointId) throw new Error('checkpointId is required')
  const face = args.face === undefined || args.face === null ? undefined : String(args.face)
  if (face && !['up', 'down', 'north', 'south', 'east', 'west'].includes(face)) throw new Error('face must be a cardinal block face')
  return {
    commandId: optionalIdentifier(input.commandId, 'commandId') ?? `command-${randomUUID()}`,
    checkpointId,
    action: input.action as MinecraftAction,
    arguments: {
      targetX: optionalNumber(args.targetX, 'targetX', -30_000_000, 30_000_000),
      targetY: optionalNumber(args.targetY, 'targetY', -2_048, 2_048),
      targetZ: optionalNumber(args.targetZ, 'targetZ', -30_000_000, 30_000_000),
      entityId: optionalIdentifier(args.entityId, 'entityId'),
      interaction: typeof args.interaction === 'string' ? args.interaction.trim().slice(0, 120) || undefined : undefined,
      durationMs: optionalNumber(args.durationMs, 'durationMs', 0, 60_000),
      itemName: optionalIdentifier(args.itemName, 'itemName'),
      blockName: optionalIdentifier(args.blockName, 'blockName'),
      count: optionalNumber(args.count, 'count', 1, 64),
      face: face as ActionArguments['face'],
      maxDistance: optionalNumber(args.maxDistance, 'maxDistance', 1, 128),
    },
    requestedAt: typeof input.requestedAt === 'string' ? input.requestedAt.slice(0, 40) : new Date().toISOString(),
  }
}
