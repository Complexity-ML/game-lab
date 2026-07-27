import type { GameActionCommand, GameActionReceipt, GameObservation } from './game-bridge'

export const gameMotorMaximumActions = 20

const survivalActions = new Set<GameActionCommand['action']>(['move_to', 'navigate_to', 'jump', 'stop'])

export interface GameMotorExecutionResult {
  completed: boolean
  completedActions: number
  interrupted?: boolean
  missionCompleted?: boolean
  observation?: GameObservation
  receipt?: GameActionReceipt
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
