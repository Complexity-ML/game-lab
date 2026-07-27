import type { AutonomyPolicy } from './autonomy-policy'
import type { GameActionCommand, GameObservation } from './game-bridge'

const autonomousMissionActions = new Set<GameActionCommand['action']>([
  'move_to',
  'navigate_to',
  'mine_block',
  'place_block',
  'craft_item',
  'equip_item',
  'use_item',
  'wait',
  'stop',
])

export const autonomousMissionActionBudget = 96

export function gameActionRequiresHumanReview(
  policy: AutonomyPolicy,
  action: GameActionCommand['action'],
  observation: GameObservation,
) {
  if (policy.gameplay !== 'autonomous-mission') return true
  if (!autonomousMissionActions.has(action)) return true
  if (observation.player.health <= 8) return true
  return observation.environment.threatLevel === 'high'
}

export function autonomousProposalFingerprint(
  graphFingerprint: string,
  actions: Array<Pick<GameActionCommand, 'checkpointId' | 'action' | 'arguments'>>,
) {
  const canonical = JSON.stringify({
    graphFingerprint,
    actions: actions.map(({ checkpointId, action, arguments: args }) => ({
      checkpointId,
      action,
      arguments: Object.fromEntries(Object.entries(args).sort(([left], [right]) => left.localeCompare(right))),
    })),
  })
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}
