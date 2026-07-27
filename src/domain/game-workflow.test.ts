import { describe, expect, it } from 'vitest'
import { createPipelineExport, parsePipelineExport } from './pipeline-io'
import { loadPipelinePreset, newCard } from './pipeline'
import { collectRiskImpactOverview } from './risk-impact'
import { validatePipeline } from '../validation'

describe('game-only workflow', () => {
  it('loads only private-game presets', () => {
    const server = loadPipelinePreset('server-ops')
    const arena = loadPipelinePreset('agent-arena')
    expect(server.nodes.some((node) => node.data.serverTelemetry?.platform === 'Minecraft')).toBe(true)
    expect(arena.nodes.some((node) => node.data.kind === 'agent')).toBe(true)
  })

  it('exports and imports game evidence fields', () => {
    const node = newCard('agent', 0)
    node.data.evidenceRef = 'observation-1'
    const exported = createPipelineExport('Minecraft mission', [node], [], [])
    const parsed = parsePipelineExport(JSON.stringify(exported))
    expect(parsed.graph.nodes[0]?.data.evidenceRef).toBe('observation-1')
  })

  it('reports game risks and validates unsafe action paths', () => {
    const review = { ...newCard('review', 0), id: 'review' }
    const action = { ...newCard('patch', 1), id: 'action' }
    const result = { ...newCard('output', 2), id: 'result' }
    const edges = [
      { id: 'review-action', source: 'review', target: 'action', type: 'elastic' },
      { id: 'action-result', source: 'action', target: 'result', type: 'elastic' },
    ]
    expect(validatePipeline([review, action, result], edges).some((finding) => finding.id === 'review-before-action-action')).toBe(false)
    expect(collectRiskImpactOverview([review, action, result], edges).items).toEqual([])
  })
})
