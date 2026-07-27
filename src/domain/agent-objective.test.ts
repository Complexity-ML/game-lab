import { describe, expect, it } from 'vitest'
import { defaultBlankObjective, gameDiscoveryQuery, resolveAgentObjective } from './agent-objective'

describe('bounded agent objectives', () => {
  it('uses a focused game-server discovery for blank missions and preserves explicit controller missions', () => {
    expect(gameDiscoveryQuery(defaultBlankObjective)).toBe('game server')
    expect(gameDiscoveryQuery('Execute GAME LAB Control policy: objective=maintain reviewed game graph | on_review=resume | on_idle=monitor')).toBe('game server')
    expect(gameDiscoveryQuery('Inspect the nearby Minecraft world')).toBe('Inspect the nearby Minecraft world')
  })

  it('turns empty Play into a private game operations mission', () => {
    expect(resolveAgentObjective('', { hasGraph: false, matchedSource: false })).toMatchObject({
      accepted: true,
      defaulted: true,
      objective: expect.stringContaining('authorized private game server'),
    })
  })

  it('accepts game work and known-card matches while rejecting unrelated noise', () => {
    expect(resolveAgentObjective('Inspect the Minecraft inventory', { hasGraph: true, matchedSource: false }).accepted).toBe(true)
    expect(resolveAgentObjective('Minecraft Agent', { hasGraph: true, matchedSource: true }).accepted).toBe(true)
    expect(resolveAgentObjective('tell me a joke about bananas', { hasGraph: true, matchedSource: false }).accepted).toBe(false)
  })
})
