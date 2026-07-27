export interface AdapterConfig {
  bridgeHost: '127.0.0.1'
  bridgePort: number
  minecraftHost: string
  minecraftPort: number
  username: string
  auth: 'offline' | 'microsoft'
  version?: string
  missionObjective: string
}

function port(value: string | undefined, fallback: number, label: string) {
  const parsed = value ? Number(value) : fallback
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error(`${label} must be a port between 1 and 65535`)
  return parsed
}

function text(value: string | undefined, fallback: string, maximum: number) {
  const normalized = value?.trim() || fallback
  return normalized.slice(0, maximum)
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AdapterConfig {
  if (environment.GAME_LAB_PRIVATE_SERVER_ACKNOWLEDGED !== 'true') {
    throw new Error('Refusing to start: set GAME_LAB_PRIVATE_SERVER_ACKNOWLEDGED=true only for a server you own or are explicitly authorized to automate')
  }
  const auth = environment.MINECRAFT_AUTH === 'microsoft' ? 'microsoft' : 'offline'
  return {
    bridgeHost: '127.0.0.1',
    bridgePort: port(environment.GAME_LAB_BRIDGE_PORT, 4317, 'GAME_LAB_BRIDGE_PORT'),
    minecraftHost: text(environment.MINECRAFT_HOST, '127.0.0.1', 253),
    minecraftPort: port(environment.MINECRAFT_PORT, 25565, 'MINECRAFT_PORT'),
    username: text(environment.MINECRAFT_USERNAME, 'GAME_LAB_Bot', 40),
    auth,
    version: environment.MINECRAFT_VERSION?.trim() || undefined,
    missionObjective: text(environment.GAME_LAB_MISSION_OBJECTIVE, 'Explore the authorized private world safely', 500),
  }
}
