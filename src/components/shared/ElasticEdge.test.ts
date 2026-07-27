import { describe, expect, it } from 'vitest'
import { routeElasticCable } from './ElasticEdge'

describe('ElasticEdge routing', () => {
  it('keeps a short forward connection between adjacent cards', () => {
    const route = routeElasticCable({
      sourceId: 'agent',
      sourceX: 642,
      sourceY: 233,
      targetId: 'review',
      targetX: 714,
      targetY: 237,
      obstacles: [
        { id: 'agent', x: 410, y: 120, width: 232, height: 226 },
        { id: 'review', x: 714, y: 151, width: 232, height: 172 },
      ],
    })

    expect(route.routedAroundObstacle).toBe(false)
    expect(route.labelY).toBe(235)
    expect(route.path).toMatch(/^M 642 233 L /)
    expect(route.path).not.toContain(' 76 ')
  })

  it('uses an outside lane for a real backward connection', () => {
    const route = routeElasticCable({
      sourceId: 'output',
      sourceX: 950,
      sourceY: 240,
      targetId: 'monitor',
      targetX: 390,
      targetY: 240,
      obstacles: [
        { id: 'output', x: 718, y: 150, width: 232, height: 180 },
        { id: 'monitor', x: 390, y: 150, width: 232, height: 180 },
      ],
    })

    expect(route.routedAroundObstacle).toBe(true)
    expect(route.labelY < 120 || route.labelY > 330).toBe(true)
  })

  it('still routes a forward cable around a card in its corridor', () => {
    const route = routeElasticCable({
      sourceId: 'source',
      sourceX: 300,
      sourceY: 220,
      targetId: 'target',
      targetX: 900,
      targetY: 220,
      obstacles: [
        { id: 'source', x: 68, y: 120, width: 232, height: 200 },
        { id: 'obstacle', x: 480, y: 140, width: 232, height: 180 },
        { id: 'target', x: 900, y: 120, width: 232, height: 200 },
      ],
    })

    expect(route.routedAroundObstacle).toBe(true)
    expect(route.labelY).toBeLessThan(140)
  })
})
