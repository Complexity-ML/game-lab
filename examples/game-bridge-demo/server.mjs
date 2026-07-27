import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const port = Number(process.env.GAME_LAB_BRIDGE_PORT || 4317)
const sessionId = `demo-${randomUUID().slice(0, 8)}`
let tick = 0
let stopped = false
let lastObservationAt

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function body(request) {
  let value = ''
  for await (const chunk of request) {
    value += chunk
    if (value.length > 64_000) throw new Error('Request too large')
  }
  return value ? JSON.parse(value) : {}
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
  if (request.method === 'GET' && url.pathname === '/v1/status') {
    send(response, 200, {
      protocol: 'game-lab.control.v1',
      message: stopped ? 'Demo adapter stopped; request a new observation to resume' : 'Demo adapter ready',
      game: 'FiveM structured demo',
      adapterVersion: '1.0.0',
      sessionId,
      lastObservationAt,
    })
    return
  }
  if (request.method === 'GET' && url.pathname === '/v1/observation') {
    tick += 1
    stopped = false
    lastObservationAt = new Date().toISOString()
    send(response, 200, {
      protocol: 'game-lab.control.v1',
      observationId: `observation-${tick}`,
      checkpointId: `checkpoint-${tick}`,
      capturedAt: lastObservationAt,
      sessionId,
      player: {
        position: { x: 214.5 + tick, y: -810.2, z: 30.7 },
        heading: 90,
        speed: 0,
        health: 200,
        armor: 50,
        inVehicle: false,
      },
      mission: {
        id: 'safe-route-demo',
        objective: 'Walk to the marked checkpoint in the private test shard',
        stage: tick > 2 ? 'checkpoint-visible' : 'spawned',
        completed: false,
      },
      environment: {
        area: 'Legion Square test shard',
        weather: 'clear',
        time: '12:00',
        threatLevel: 'none',
      },
      nearby: [
        { id: 'checkpoint-safe-route', kind: 'checkpoint', distance: Math.max(2, 24 - tick), state: 'active' },
        { id: 'npc-instructor', kind: 'npc', distance: 8, state: 'idle' },
      ],
    })
    return
  }
  if (request.method === 'POST' && url.pathname === '/v1/actions') {
    const command = await body(request)
    if (stopped) {
      send(response, 409, { status: 'rejected', summary: 'Adapter is stopped. Capture a fresh observation before acting.' })
      return
    }
    send(response, 200, {
      commandId: command.commandId,
      status: 'accepted',
      summary: `Demo accepted ${command.action} against ${command.checkpointId}`,
    })
    return
  }
  if (request.method === 'POST' && url.pathname === '/v1/stop') {
    stopped = true
    send(response, 200, { stopped: true, summary: 'Demo movement and queued actions stopped immediately' })
    return
  }
  send(response, 404, { error: 'Not found' })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`GAME LAB demo bridge listening on http://127.0.0.1:${port}\n`)
})
