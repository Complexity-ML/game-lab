import { loadConfig } from './config.js'
import { startBridgeServer } from './http-server.js'
import { MinecraftController } from './minecraft-controller.js'

try {
  const config = loadConfig()
  const controller = new MinecraftController(config)
  const server = startBridgeServer(config, controller)
  const stop = () => {
    controller.emergencyStop()
    server.close(() => process.exit(0))
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
