export interface WorldPosition {
  x: number
  y: number
  z: number
}

const hostileMobPattern = /(?:^|_)(?:blaze|bogged|breeze|cave_spider|creeper|drowned|elder_guardian|endermite|evoker|ghast|guardian|hoglin|husk|magma_cube|phantom|piglin_brute|pillager|ravager|shulker|silverfish|skeleton|slime|spider|stray|vex|vindicator|warden|witch|wither|wither_skeleton|zoglin|zombie|zombie_villager)(?:$|_)/i
const boundedMeleeThreatPattern = /(?:^|_)(?:cave_spider|drowned|endermite|husk|magma_cube|silverfish|slime|spider|zombie|zombie_villager)(?:$|_)/i
const explosiveThreatPattern = /(?:^|_)creeper(?:$|_)/i

export function isHostileMob(name: string | undefined) {
  return hostileMobPattern.test((name ?? '').replace(/[:\s]+/g, '_'))
}

export interface DefensiveSituation {
  health: number
  hostileCount: number
  nearestDistance: number
  nearestName?: string
  hasWeapon: boolean
}

export function defensiveResponse(situation: DefensiveSituation): 'fight' | 'retreat' {
  const name = (situation.nearestName ?? '').replace(/[:\s]+/g, '_')
  if (explosiveThreatPattern.test(name)) return 'retreat'
  if (!boundedMeleeThreatPattern.test(name)) return 'retreat'
  if (situation.hostileCount !== 1 || situation.nearestDistance > 4.5) return 'retreat'
  const minimumHealth = situation.hasWeapon ? 10 : 16
  return situation.health >= minimumHealth ? 'fight' : 'retreat'
}

export function reconnectDelay(attempt: number) {
  return Math.min(15_000, 1_000 * 2 ** Math.max(0, Math.min(4, Math.floor(attempt) - 1)))
}

export function defensiveRetreatTarget(player: WorldPosition, threat: WorldPosition, distance = 12): WorldPosition {
  const deltaX = player.x - threat.x
  const deltaZ = player.z - threat.z
  const magnitude = Math.hypot(deltaX, deltaZ)
  const directionX = magnitude > 0.01 ? deltaX / magnitude : 1
  const directionZ = magnitude > 0.01 ? deltaZ / magnitude : 0
  return {
    x: Math.floor(player.x + directionX * distance),
    y: Math.floor(player.y),
    z: Math.floor(player.z + directionZ * distance),
  }
}
