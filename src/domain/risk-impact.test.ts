import { describe, expect, it } from 'vitest'
import { newCard } from './pipeline'
import { collectRiskImpactOverview, riskItemsForDomain } from './risk-impact'

describe('game impact and risk overview', () => {
  it('reports a missing downstream risk assessment', () => {
    const impact = {
      ...newCard('impact', 0),
      id: 'impact',
      data: { ...newCard('impact', 0).data, label: 'Player health impact', description: 'The route crosses a hostile area.', rule: 'scope=player_health' },
    }

    const overview = collectRiskImpactOverview([impact], [])
    expect(overview).toMatchObject({ actionable: 0, coverageGaps: 1 })
    expect(overview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'coverage-gap', domain: 'player', nodeId: 'impact' }),
    ]))
  })

  it('groups an evidence-backed game risk by domain', () => {
    const impact = { ...newCard('impact', 0), id: 'impact' }
    const risk = {
      ...newCard('risk', 1),
      id: 'risk',
      data: {
        ...newCard('risk', 1).data,
        rule: 'scope=private_mission | risk_domain=mission | risk_type=safety | severity=high | confidence=0.9 | evidence=fresh | affected_assets=1 | action=return_to_safe_checkpoint',
      },
    }
    const overview = collectRiskImpactOverview([impact, risk], [{ id: 'impact-risk', source: 'impact', target: 'risk' }])

    expect(overview).toMatchObject({ actionable: 1, high: 1, coverageGaps: 0 })
    expect(riskItemsForDomain(overview, 'mission').filter((item) => item.kind === 'risk')).toEqual([
      expect.objectContaining({ kind: 'risk', nodeId: 'risk', domain: 'mission' }),
    ])
  })
})
