import { describe, expect, it } from 'vitest'
import { buildCardActivationPlan } from './card-activation'
import { newCard } from './pipeline'

function stateOf(plan: ReturnType<typeof buildCardActivationPlan>, kind: string) {
  return plan.find((item) => item.kind === kind)?.state
}

describe('game-evidence card activation', () => {
  it('starts a blank player with host-owned control and world exploration', () => {
    const plan = buildCardActivationPlan([], [])
    expect(stateOf(plan, 'control')).toBe('host-owned')
    expect(stateOf(plan, 'explorer')).toBe('host-owned')
    expect(stateOf(plan, 'server')).toBe('recommended')
    expect(stateOf(plan, 'risk')).toBe('available')
  })

  it('recommends the next game-analysis cards from the current graph state', () => {
    const server = newCard('server', 0)
    const agent = newCard('agent', 1)
    expect(stateOf(buildCardActivationPlan([server, agent], []), 'analysis')).toBe('recommended')

    const analysis = newCard('analysis', 2)
    expect(stateOf(buildCardActivationPlan([server, agent, analysis], []), 'impact')).toBe('recommended')

    const impact = newCard('impact', 3)
    expect(stateOf(buildCardActivationPlan([server, agent, analysis, impact], []), 'risk')).toBe('recommended')
  })

  it('recommends parallel orchestration only for multiple incidents', () => {
    const server = newCard('server', 0)
    const plan = buildCardActivationPlan([server], [], [], 3)
    expect(stateOf(plan, 'parallel')).toBe('recommended')
    expect(stateOf(plan, 'diagram')).toBe('recommended')
  })

  it('arms monitoring only after a terminal result exists', () => {
    const output = newCard('output', 0)
    expect(stateOf(buildCardActivationPlan([output], []), 'monitor')).toBe('recommended')
  })
})
