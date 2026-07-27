import { randomUUID } from 'node:crypto'

export const protocol = 'game-lab.control.v1' as const

export const actionTypes = [
  'move_to', 'navigate_to', 'jump', 'mine_block', 'place_block', 'craft_item',
  'equip_item', 'attack_entity', 'interact', 'use_item', 'wait', 'stop',
] as const

export type MinecraftAction = typeof actionTypes[number]

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
