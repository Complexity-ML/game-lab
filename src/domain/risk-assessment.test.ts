import { describe, expect, it } from 'vitest'
import { defaultRiskAssessmentRule, parseRiskAssessmentRule, riskDomainFromText } from './risk-assessment'

describe('game risk assessment context', () => {
  it('parses a complete safety contract', () => {
    expect(parseRiskAssessmentRule('scope=nether_route | risk_domain=mission | risk_type=safety | severity=high | confidence=0.86 | evidence=fresh | affected_assets=1 | action=return_to_portal')).toMatchObject({
      scope: 'nether_route',
      domain: 'mission',
      riskType: 'safety',
      severity: 'high',
      confidence: 0.86,
      evidence: 'fresh',
      affectedAssets: 1,
      complete: true,
    })
  })

  it('infers game-specific domains', () => {
    expect(riskDomainFromText('player health and inventory')).toBe('player')
    expect(riskDomainFromText('server tick latency')).toBe('performance')
    expect(riskDomainFromText('nearby blocks and entities')).toBe('world')
  })

  it('keeps unavailable evidence from claiming a risk', () => {
    expect(parseRiskAssessmentRule(defaultRiskAssessmentRule)).toMatchObject({
      riskType: 'none',
      severity: 'unknown',
      evidence: 'unavailable',
      affectedAssets: 0,
      complete: true,
    })
  })

  it('marks malformed contracts incomplete', () => {
    expect(parseRiskAssessmentRule('scope=mission | risk_type=safety | severity=urgent | confidence=2')).toMatchObject({
      complete: false,
      severity: undefined,
      confidence: undefined,
    })
  })
})
