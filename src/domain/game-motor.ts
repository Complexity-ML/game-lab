import type { GameActionCommand, GameActionReceipt, GameObservation } from './game-bridge'

export const gameMotorMaximumActions = 20

const survivalActions = new Set<GameActionCommand['action']>(['move_to', 'navigate_to', 'jump', 'stop'])

export type GameMotorPlanStatus = 'running' | 'completed' | 'yielded' | 'paused' | 'stopped' | 'failed'
export type GameMotorStepStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'failed' | 'skipped'

export interface GameMotorPlanStep {
  id: string
  action: GameActionCommand['action']
  checkpointId: string
  reason: string
  status: GameMotorStepStatus
  summary?: string
}

export interface GameMotorPlanView {
  id: string
  status: GameMotorPlanStatus
  startedAt: string
  updatedAt: string
  completedActions: number
  currentStep?: number
  steps: GameMotorPlanStep[]
}

export interface GameMotorExecutionResult {
  completed: boolean
  completedActions: number
  interrupted?: boolean
  missionCompleted?: boolean
  observation?: GameObservation
  receipt?: GameActionReceipt
}

export function createGameMotorPlan(
  actions: Array<Pick<GameActionCommand, 'commandId' | 'checkpointId' | 'action'> & { reason?: string }>,
  createdAt = new Date().toISOString(),
): GameMotorPlanView {
  return {
    id: `motor-${actions[0]?.commandId ?? createdAt}`,
    status: 'running',
    startedAt: createdAt,
    updatedAt: createdAt,
    completedActions: 0,
    steps: actions.slice(0, gameMotorMaximumActions).map((action) => ({
      id: action.commandId,
      action: action.action,
      checkpointId: action.checkpointId,
      reason: action.reason?.trim() || 'Bounded allowlisted motor step',
      status: 'queued',
    })),
  }
}

export function gameMotorCheckpoint(
  observation: GameObservation,
  nextAction: GameActionCommand['action'],
): { continue: true } | { continue: false; reason: string } {
  if (observation.mission.completed) return { continue: false, reason: 'Mission objective reported complete' }
  const state = observation.activity?.state ?? observation.mission.stage
  if (state === 'disconnected' || state === 'stopped' || state === 'blocked') {
    return { continue: false, reason: `Game state changed to ${state}` }
  }
  const survivalOnly = observation.player.health <= 8
    || observation.environment.threatLevel === 'high'
    || observation.environment.threatLevel === 'medium'
    || (observation.activity?.healthDelta ?? 0) < 0
    || state === 'defending'
    || state === 'evading'
  if (survivalOnly && !survivalActions.has(nextAction)) {
    return {
      continue: false,
      reason: `Fresh checkpoint requires survival action before ${nextAction} · health ${observation.player.health} · threat ${observation.environment.threatLevel}`,
    }
  }
  return { continue: true }
}
