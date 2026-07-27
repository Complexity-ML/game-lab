import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AdapterConfig } from './config.js'
import { buildObservation } from './observation.js'
import { parseActionCommand, protocol } from './protocol.js'
import type { MinecraftController } from './minecraft-controller.js'

const MAX_BODY_BYTES = 64_000

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

async function requestBody(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new Error('Request exceeds 64 KB')
  }
  try { return body ? JSON.parse(body) as unknown : {} } catch { throw new Error('Request body must be valid JSON') }
}

export function startBridgeServer(config: AdapterConfig, controller: MinecraftController) {
  const sessionId = `minecraft-${randomUUID().slice(0, 12)}`
  let observationSequence = 0
  let lastObservationAt: string | undefined
  let currentCheckpointId: string | undefined
  const commandIds = new Set<string>()
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
      if (request.method === 'GET' && url.pathname === '/v1/status') {
        const status = controller.status()
        json(response, status.connected ? 200 : 503, {
          protocol,
          message: status.connected ? `Minecraft connected · ${status.lastAction}` : status.lastAction,
          game: 'Minecraft Java · Mineflayer',
          adapterVersion: '0.1.0',
          sessionId,
          lastObservationAt,
        })
        return
      }
      if (request.method === 'GET' && url.pathname === '/v1/observation') {
        if (!controller.status().connected) {
          json(response, 503, { error: controller.status().lastAction })
          return
        }
        observationSequence += 1
        const observationId = `minecraft-observation-${observationSequence}`
        currentCheckpointId = `minecraft-checkpoint-${observationSequence}`
        lastObservationAt = new Date().toISOString()
        json(response, 200, buildObservation(controller.bot, {
          checkpointId: currentCheckpointId,
          observationId,
          sessionId,
          objective: config.missionObjective,
          stage: controller.status().stage,
        }))
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/actions') {
        const command = parseActionCommand(await requestBody(request))
        if (!currentCheckpointId || command.checkpointId !== currentCheckpointId) {
          json(response, 409, { status: 'rejected', summary: 'Stale or unknown checkpoint. Capture a fresh observation before acting.' })
          return
        }
        if (commandIds.has(command.commandId)) {
          json(response, 409, { status: 'rejected', summary: 'Duplicate commandId rejected.' })
          return
        }
        commandIds.add(command.commandId)
        try {
          await controller.enqueue(command)
          json(response, 200, {
            commandId: command.commandId,
            status: 'completed',
            summary: `${command.action} completed against ${command.checkpointId}`,
          })
        } catch (error) {
          json(response, 200, {
            commandId: command.commandId,
            status: 'failed',
            summary: `${command.action} failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
          })
        }
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/stop') {
        const body = await requestBody(request)
        const commandId = body && typeof body === 'object' && 'commandId' in body && typeof body.commandId === 'string' ? body.commandId.slice(0, 120) : `stop-${randomUUID()}`
        json(response, 200, { stopped: true, commandId, summary: controller.emergencyStop() })
        return
      }
      json(response, 404, { error: 'Not found' })
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })
  server.listen(config.bridgePort, config.bridgeHost, () => {
    process.stdout.write(`GAME LAB Minecraft bridge listening on http://${config.bridgeHost}:${config.bridgePort}\n`)
  })
  return server
}
