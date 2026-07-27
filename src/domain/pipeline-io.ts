import type { Edge } from '@xyflow/react'
import type { GameEvidence } from './game-evidence'
import type { CardKind, PipelineNode, PipelineNodeData, SchemaField } from './pipeline'
import type { PipelineVersion } from './versioning'

export const pipelineExportSchema = 'game-lab.pipeline'
export const pipelineExportVersion = 2

const kinds = new Set<CardKind>(['control', 'explorer', 'worker', 'query', 'server', 'agent', 'source', 'profile', 'analysis', 'impact', 'risk', 'patch', 'monitor', 'parallel', 'diagram', 'split', 'decision', 'transform', 'review', 'validation', 'output'])

function redactExportText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[=:]\s*["']?)[^\s,"'}&]+/gi, '$1[REDACTED]')
    .replace(/(?:\/Users\/[^\s"']+|[A-Za-z]:\\Users\\[^\s"']+)/g, '[LOCAL_PATH_REMOVED]')
}

export interface PipelineExport {
  schema: typeof pipelineExportSchema
  schemaVersion: typeof pipelineExportVersion
  exportedAt: string
  projectTitle: string
  graph: { nodes: PipelineNode[]; edges: Edge[] }
  versions: PipelineVersion[]
}

function cleanFields(value: unknown): SchemaField[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Record<string, unknown>
    if (typeof source.name !== 'string' || !['string', 'number', 'boolean', 'timestamp'].includes(String(source.type))) return []
    return [{
      name: redactExportText(source.name).slice(0, 240),
      type: source.type as SchemaField['type'],
      tags: Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => redactExportText(tag).slice(0, 80)).slice(0, 50) : undefined,
    }]
  })
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum
}

function cleanNodeData(value: unknown): PipelineNodeData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Card data is invalid')
  const data = value as Record<string, unknown>
  const kind = kinds.has(data.kind as CardKind) ? data.kind as CardKind : 'analysis'
  const rawServer = data.serverTelemetry && typeof data.serverTelemetry === 'object' && !Array.isArray(data.serverTelemetry) ? data.serverTelemetry as Record<string, unknown> : undefined
  const rawAgent = data.agentTelemetry && typeof data.agentTelemetry === 'object' && !Array.isArray(data.agentTelemetry) ? data.agentTelemetry as Record<string, unknown> : undefined
  return {
    kind,
    label: typeof data.label === 'string' ? redactExportText(data.label).slice(0, 160) : `Imported ${kind}`,
    description: typeof data.description === 'string' ? redactExportText(data.description).slice(0, 2_000) : '',
    owner: typeof data.owner === 'string' ? redactExportText(data.owner).slice(0, 160) : 'Unassigned',
    status: ['healthy', 'warning', 'blocked', 'draft'].includes(String(data.status)) ? data.status as PipelineNodeData['status'] : 'draft',
    schema: cleanFields(data.schema),
    evidenceRef: typeof data.evidenceRef === 'string' ? redactExportText(data.evidenceRef).slice(0, 500) : undefined,
    rule: typeof data.rule === 'string' ? redactExportText(data.rule).slice(0, 8_000) : undefined,
    patchScope: kind === 'patch' ? 'graph-only' : undefined,
    monitorMode: kind === 'monitor' ? 'event-loop' : undefined,
    parallelMode: kind === 'parallel' ? 'branch-fanout' : undefined,
    diagramMode: kind === 'diagram' ? 'incident-workstream' : undefined,
    controlMode: kind === 'control' ? 'autonomous-player' : undefined,
    explorerMode: kind === 'explorer' ? 'world-scan' : undefined,
    workerMode: kind === 'worker' ? 'bounded-execution' : undefined,
    serverTelemetry: kind === 'server' && rawServer ? {
      platform: ['Minecraft', 'FiveM', 'RedM', 'Generic'].includes(String(rawServer.platform)) ? rawServer.platform as 'Minecraft' | 'FiveM' | 'RedM' | 'Generic' : 'Generic',
      state: ['online', 'degraded', 'offline', 'maintenance'].includes(String(rawServer.state)) ? rawServer.state as 'online' | 'degraded' | 'offline' | 'maintenance' : 'offline',
      endpoint: typeof rawServer.endpoint === 'string' ? redactExportText(rawServer.endpoint).slice(0, 240) : '',
      playersOnline: Math.round(boundedNumber(rawServer.playersOnline, 0, 100_000)),
      playerCapacity: Math.round(boundedNumber(rawServer.playerCapacity, 0, 100_000)),
      latencyMs: Math.round(boundedNumber(rawServer.latencyMs, 0, 120_000)),
      cpuPercent: boundedNumber(rawServer.cpuPercent, 0, 100),
      memoryMb: Math.round(boundedNumber(rawServer.memoryMb, 0, 10_000_000)),
      resourcesRunning: Math.round(boundedNumber(rawServer.resourcesRunning, 0, 100_000)),
      resourcesFailed: Math.round(boundedNumber(rawServer.resourcesFailed, 0, 100_000)),
    } : undefined,
    agentTelemetry: kind === 'agent' && rawAgent ? {
      mode: ['npc', 'test-player', 'operator'].includes(String(rawAgent.mode)) ? rawAgent.mode as 'npc' | 'test-player' | 'operator' : 'test-player',
      state: ['idle', 'observing', 'planning', 'acting', 'blocked'].includes(String(rawAgent.state)) ? rawAgent.state as 'idle' | 'observing' | 'planning' | 'acting' | 'blocked' : 'blocked',
      objective: typeof rawAgent.objective === 'string' ? redactExportText(rawAgent.objective).slice(0, 500) : '',
      safetyMode: 'private-server-only',
      confidence: boundedNumber(rawAgent.confidence, 0, 1),
      lastAction: typeof rawAgent.lastAction === 'string' ? redactExportText(rawAgent.lastAction).slice(0, 240) : undefined,
    } : undefined,
    pinned: data.pinned === true,
  }
}

function cleanNodes(value: unknown): PipelineNode[] {
  if (!Array.isArray(value) || value.length > 2_000) throw new Error('Pipeline cards must be an array of at most 2,000 items')
  const ids = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Card ${index + 1} is invalid`)
    const source = item as Record<string, unknown>
    const id = typeof source.id === 'string' ? source.id.slice(0, 180) : ''
    if (!id || ids.has(id)) throw new Error(`Card ${index + 1} has a missing or duplicate ID`)
    ids.add(id)
    const position = source.position && typeof source.position === 'object' ? source.position as Record<string, unknown> : {}
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Card ${id} has an invalid XY position`)
    return { id, type: 'pipeline', position: { x: Number(position.x), y: Number(position.y) }, data: cleanNodeData(source.data) }
  })
}

function cleanEdges(value: unknown, nodeIds: Set<string>): Edge[] {
  if (!Array.isArray(value) || value.length > 4_000) throw new Error('Pipeline edges must be an array of at most 4,000 items')
  const ids = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Edge ${index + 1} is invalid`)
    const source = item as Record<string, unknown>
    const id = typeof source.id === 'string' ? source.id.slice(0, 180) : ''
    const from = typeof source.source === 'string' ? source.source : ''
    const target = typeof source.target === 'string' ? source.target : ''
    if (!id || ids.has(id)) throw new Error(`Edge ${index + 1} has a missing or duplicate ID`)
    if (!nodeIds.has(from) || !nodeIds.has(target)) throw new Error(`Edge ${id} references a missing card`)
    ids.add(id)
    const sourceHandle = source.sourceHandle === 'approved' || source.sourceHandle === 'quarantine' || source.sourceHandle === 'feedback' ? source.sourceHandle : undefined
    return { id, source: from, target, type: 'elastic', sourceHandle, label: sourceHandle === 'feedback' ? 'next iteration' : undefined }
  })
}

function cleanGraph(nodes: unknown, edges: unknown) {
  const clean = cleanNodes(nodes)
  return { nodes: clean, edges: cleanEdges(edges, new Set(clean.map((node) => node.id))) }
}

function cleanEvidence(value: unknown): GameEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const source = item as Record<string, unknown>
    if (typeof source.tool !== 'string' || typeof source.source !== 'string' || typeof source.capturedAt !== 'string' || typeof source.expiresAt !== 'string') return []
    return [{
      tool: source.tool.slice(0, 120),
      source: redactExportText(source.source).slice(0, 500),
      capturedAt: source.capturedAt,
      expiresAt: source.expiresAt,
      status: ['ok', 'unavailable', 'error'].includes(String(source.status)) ? source.status as GameEvidence['status'] : 'unavailable',
      summary: typeof source.summary === 'string' ? redactExportText(source.summary).slice(0, 500) : '',
      cached: source.cached === true,
      stale: source.stale === true,
    }]
  })
}

function cleanVersion(value: unknown, index: number): PipelineVersion {
  if (!value || typeof value !== 'object') throw new Error(`Version ${index + 1} is invalid`)
  const source = value as Record<string, unknown>
  const graph = cleanGraph(source.nodes, source.edges)
  if (typeof source.id !== 'string' || typeof source.label !== 'string' || typeof source.createdAt !== 'string') throw new Error(`Version ${index + 1} metadata is invalid`)
  return {
    id: source.id.slice(0, 180),
    label: redactExportText(source.label).slice(0, 180),
    createdAt: source.createdAt,
    origin: ['initial', 'agent', 'manual'].includes(String(source.origin)) ? source.origin as PipelineVersion['origin'] : 'manual',
    nodes: graph.nodes,
    edges: graph.edges,
    blockingIssues: Number.isInteger(source.blockingIssues) ? Number(source.blockingIssues) : 0,
    status: ['committed', 'pending-review', 'rejected'].includes(String(source.status)) ? source.status as PipelineVersion['status'] : 'committed',
    description: typeof source.description === 'string' ? redactExportText(source.description).slice(0, 4_000) : undefined,
    evidence: cleanEvidence(source.evidence),
  }
}

export function createPipelineExport(projectTitle: string, nodes: PipelineNode[], edges: Edge[], versions: PipelineVersion[]): PipelineExport {
  const graph = cleanGraph(nodes, edges)
  return {
    schema: pipelineExportSchema,
    schemaVersion: pipelineExportVersion,
    exportedAt: new Date().toISOString(),
    projectTitle: redactExportText(projectTitle).slice(0, 180),
    graph,
    versions: versions.slice(-20).map((version, index) => cleanVersion(version, index)),
  }
}

export function parsePipelineExport(serialized: string): PipelineExport {
  if (serialized.length > 8_000_000) throw new Error('Import exceeds the 8 MB safety limit')
  let value: unknown
  try { value = JSON.parse(serialized) } catch { throw new Error('Import is not valid JSON') }
  if (!value || typeof value !== 'object') throw new Error('Import root must be an object')
  const source = value as Record<string, unknown>
  if (source.schema !== pipelineExportSchema) throw new Error('This file is not a GAME LAB pipeline export')
  if (source.schemaVersion !== pipelineExportVersion) throw new Error(`Unsupported GAME LAB schema version ${String(source.schemaVersion)}. This app supports version ${pipelineExportVersion}.`)
  if (!source.graph || typeof source.graph !== 'object') throw new Error('Import is missing its graph')
  const graphSource = source.graph as Record<string, unknown>
  const graph = cleanGraph(graphSource.nodes, graphSource.edges)
  const versions = Array.isArray(source.versions) ? source.versions.map((version, index) => cleanVersion(version, index)) : []
  return {
    schema: pipelineExportSchema,
    schemaVersion: pipelineExportVersion,
    exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : new Date().toISOString(),
    projectTitle: typeof source.projectTitle === 'string' ? redactExportText(source.projectTitle).slice(0, 180) : 'Imported pipeline',
    graph,
    versions,
  }
}
