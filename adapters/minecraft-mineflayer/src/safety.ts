export interface WorldPosition {
  x: number
  y: number
  z: number
}

const hostileMobPattern = /(?:^|_)(?:blaze|bogged|breeze|cave_spider|creeper|drowned|elder_guardian|endermite|evoker|ghast|guardian|hoglin|husk|magma_cube|phantom|piglin_brute|pillager|ravager|shulker|silverfish|skeleton|slime|spider|stray|vex|vindicator|warden|witch|wither|wither_skeleton|zoglin|zombie|zombie_villager)(?:$|_)/i

export function isHostileMob(name: string | undefined) {
  return hostileMobPattern.test((name ?? '').replace(/[:\s]+/g, '_'))
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
