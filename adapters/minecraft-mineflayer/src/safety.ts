export interface WorldPosition {
  x: number
  y: number
  z: number
}

export interface NavigationRecoveryCell {
  offsetX: number
  offsetZ: number
  position: WorldPosition
  state: 'walkable' | 'blocked' | 'hazard' | 'drop'
  ground?: string
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

export function navigationRecoveryCell(cells: NavigationRecoveryCell[], target: WorldPosition) {
  return cells
    .filter((cell) => cell.state === 'walkable' && (cell.offsetX !== 0 || cell.offsetZ !== 0))
    .sort((left, right) => {
      const targetDistance = (cell: NavigationRecoveryCell) =>
        (cell.position.x - target.x) ** 2 + (cell.position.y - target.y) ** 2 + (cell.position.z - target.z) ** 2
      return targetDistance(left) - targetDistance(right)
        || left.offsetX ** 2 + left.offsetZ ** 2 - right.offsetX ** 2 - right.offsetZ ** 2
    })[0]
}

export function navigationDescentCell(
  cells: NavigationRecoveryCell[],
  player: WorldPosition,
  target: WorldPosition,
  maximumDrop = 4,
) {
  const targetDistance = (cell: NavigationRecoveryCell) =>
    (cell.position.x - target.x) ** 2 + (cell.position.y - target.y) ** 2 + (cell.position.z - target.z) ** 2
  return cells
    .filter((cell) => {
      const drop = player.y - cell.position.y
      return cell.state === 'drop'
        && Boolean(cell.ground)
        && drop >= 2
        && drop <= maximumDrop
        && (cell.offsetX !== 0 || cell.offsetZ !== 0)
    })
    .sort((left, right) =>
      targetDistance(left) - targetDistance(right)
      || player.y - left.position.y - (player.y - right.position.y)
      || left.offsetX ** 2 + left.offsetZ ** 2 - right.offsetX ** 2 - right.offsetZ ** 2,
    )[0]
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
