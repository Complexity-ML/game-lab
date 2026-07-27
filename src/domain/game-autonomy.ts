import type { AutonomyPolicy } from './autonomy-policy'
import type { GameActionCommand, GameObservation } from './game-bridge'

const autonomousMissionActions = new Set<GameActionCommand['action']>([
  'move_to',
  'navigate_to',
  'jump',
  'mine_block',
  'place_block',
  'craft_item',
  'equip_item',
  'use_item',
  'wait',
])
const autonomousEvasionActions = new Set<GameActionCommand['action']>(['move_to', 'navigate_to', 'jump'])

export const autonomousMissionActionBudget = 96

export function isRecoverableGameActionFailure(summary: string) {
  return /timed out|timeout|movement blocked|pathfinder|digging|target may be blocked|unreachable|no path|not in the minecraft allowlist|not allowlisted/i.test(summary)
}

export function gameActionRequiresHumanReview(
  policy: AutonomyPolicy,
  action: GameActionCommand['action'],
  observation: GameObservation,
) {
  if (policy.gameplay !== 'autonomous-mission') return true
  if (!autonomousMissionActions.has(action)) return true
  if (observation.player.health <= 8 || observation.environment.threatLevel === 'high' || observation.environment.threatLevel === 'medium') {
    return !autonomousEvasionActions.has(action)
  }
  return false
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
