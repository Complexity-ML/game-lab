import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'

type ScenarioPresetId = 'server-ops' | 'agent-arena'

interface ScenarioPreset {
  title: string
  nodes: PipelineNode[]
  edges: Edge[]
}

export const scenarioPresets: Record<ScenarioPresetId, ScenarioPreset> = {
  'server-ops': {
    title: 'Minecraft server incident response',
    nodes: [
      {
        id: 'game-server',
        type: 'pipeline',
        position: { x: 80, y: 220 },
        data: {
          kind: 'server',
          label: 'Private Minecraft Server',
          description: 'Private Java server with bounded health and player telemetry.',
          owner: 'Game Operations',
          status: 'warning',
          schema: [],
          rule: 'transport=read_only | scope=private_server | commands=reviewed',
          serverTelemetry: {
            platform: 'Minecraft',
            state: 'degraded',
            endpoint: '127.0.0.1:25565',
            playersOnline: 1,
            playerCapacity: 8,
            latencyMs: 86,
            cpuPercent: 78,
            memoryMb: 4096,
            resourcesRunning: 1,
            resourcesFailed: 0,
          },
        },
      },
      { id: 'server-monitor', type: 'pipeline', position: { x: 390, y: 220 }, data: { kind: 'monitor', label: 'Watch server health', description: 'Opens one bounded incident iteration when the server checkpoint changes.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'on_change=game_checkpoint | cooldown=60s | max_iterations=10', monitorMode: 'event-loop' } },
      { id: 'server-analysis', type: 'pipeline', position: { x: 700, y: 220 }, data: { kind: 'analysis', label: 'Diagnose the session', description: 'Correlates latency, health and the current mission without reading private chat.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'window=5m | evidence=structured_observation | private_chat=excluded' } },
      { id: 'server-risk', type: 'pipeline', position: { x: 1010, y: 220 }, data: { kind: 'risk', label: 'Session stability risk', description: 'Rates the impact on the private test session from fresh game evidence.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'scope=private_server | risk_domain=reliability | severity=medium | confidence=0.94 | evidence=fresh | affected_assets=1 | action=review_then_recover' } },
      { id: 'server-review', type: 'pipeline', position: { x: 1320, y: 220 }, data: { kind: 'review', label: 'Approve recovery', description: 'A server operator reviews the action and rollback before execution.', owner: 'Server Operator', status: 'draft', schema: [], rule: 'approve=bounded_recovery | reject=observe_only' } },
      { id: 'server-validation', type: 'pipeline', position: { x: 1630, y: 220 }, data: { kind: 'validation', label: 'Validate recovery', description: 'Requires a fresh observation before the incident is closed.', owner: 'Game Operations', status: 'draft', schema: [], rule: 'server=online AND observation=fresh' } },
      { id: 'server-output', type: 'pipeline', position: { x: 1940, y: 220 }, data: { kind: 'output', label: 'Recovery result', description: 'Stores the reviewed result and action receipt.', owner: 'Game Operations', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'server-monitor-edge', source: 'game-server', target: 'server-monitor', type: 'elastic' },
      { id: 'monitor-analysis-edge', source: 'server-monitor', target: 'server-analysis', type: 'elastic' },
      { id: 'analysis-risk-edge', source: 'server-analysis', target: 'server-risk', type: 'elastic' },
      { id: 'risk-review-edge', source: 'server-risk', target: 'server-review', type: 'elastic' },
      { id: 'review-validation-edge', source: 'server-review', target: 'server-validation', type: 'elastic' },
      { id: 'validation-output-edge', source: 'server-validation', target: 'server-output', type: 'elastic' },
      { id: 'output-monitor-edge', source: 'server-output', target: 'server-monitor', sourceHandle: 'feedback', type: 'elastic', label: 'next incident' },
    ],
  },
  'agent-arena': {
    title: 'Private Minecraft agent evaluation',
    nodes: [
      { id: 'arena-server', type: 'pipeline', position: { x: 80, y: 220 }, data: { kind: 'server', label: 'Minecraft Agent Arena', description: 'Isolated private world for one AI test player.', owner: 'Game AI Team', status: 'healthy', schema: [], rule: 'scope=private_server | commands=reviewed', serverTelemetry: { platform: 'Minecraft', state: 'online', endpoint: '127.0.0.1:25565', playersOnline: 1, playerCapacity: 8, latencyMs: 14, cpuPercent: 31, memoryMb: 2048, resourcesRunning: 1, resourcesFailed: 0 } } },
      { id: 'minecraft-agent', type: 'pipeline', position: { x: 390, y: 220 }, data: { kind: 'agent', label: 'Minecraft Agent', description: 'GPT observes structured game state and proposes allowlisted actions.', owner: 'Game AI Team', status: 'healthy', schema: [], rule: 'environment=private_server | act=allowlist | emergency_stop=required', agentTelemetry: { mode: 'test-player', state: 'observing', objective: 'Gather wood and return safely', safetyMode: 'private-server-only', confidence: 0.9 } } },
      { id: 'arena-analysis', type: 'pipeline', position: { x: 700, y: 220 }, data: { kind: 'analysis', label: 'Score the mission', description: 'Scores progress, health, inventory and action safety from structured checkpoints.', owner: 'GAME LAB Agent', status: 'healthy', schema: [], rule: 'score=progress,health,inventory,safety | observation=required' } },
      { id: 'arena-review', type: 'pipeline', position: { x: 1010, y: 220 }, data: { kind: 'review', label: 'Review next action', description: 'A human approves the next material gameplay action.', owner: 'Safety Reviewer', status: 'draft', schema: [], rule: 'approve=next_private_action | reject=stop_agent' } },
      { id: 'arena-validation', type: 'pipeline', position: { x: 1320, y: 220 }, data: { kind: 'validation', label: 'Safety gate', description: 'Requires allowlisted actions and a matching fresh checkpoint.', owner: 'Game AI Team', status: 'draft', schema: [], rule: 'action=allowlisted AND checkpoint=fresh' } },
      { id: 'arena-output', type: 'pipeline', position: { x: 1630, y: 220 }, data: { kind: 'output', label: 'Mission result', description: 'Stores the reviewed action receipt and mission result.', owner: 'Game AI Team', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'arena-server-agent', source: 'arena-server', target: 'minecraft-agent', type: 'elastic' },
      { id: 'arena-agent-analysis', source: 'minecraft-agent', target: 'arena-analysis', type: 'elastic' },
      { id: 'arena-analysis-review', source: 'arena-analysis', target: 'arena-review', type: 'elastic' },
      { id: 'arena-review-validation', source: 'arena-review', target: 'arena-validation', type: 'elastic' },
      { id: 'arena-validation-output', source: 'arena-validation', target: 'arena-output', type: 'elastic' },
    ],
  },
}
