import { describe, expect, it } from 'vitest'
import { atomicBlockerFingerprint, maximumAtomicRepairAttempts, planAtomicRepair } from './atomic-repair'

describe('bounded atomic repair', () => {
  it('normalizes blocker fingerprints so equivalent invalid diffs deduplicate', () => {
    expect(atomicBlockerFingerprint(['unsafe-action', 'orphan-output', 'unsafe-action']))
      .toBe('orphan-output|unsafe-action')
  })

  it('allows one repair turn and then settles without another retry', () => {
    const first = planAtomicRepair(undefined, 7, ['unsafe-action', 'orphan-output'])
    expect(first.shouldRetry).toBe(true)
    expect(first.exhausted).toBe(false)
    expect(first.nextState.attempts).toBe(maximumAtomicRepairAttempts)

    const repeated = planAtomicRepair(first.nextState, 7, ['orphan-output', 'unsafe-action'])
    expect(repeated.shouldRetry).toBe(false)
    expect(repeated.exhausted).toBe(true)
    expect(repeated.nextState.attempts).toBe(maximumAtomicRepairAttempts)
  })

  it('starts a fresh bounded repair budget for a new player session', () => {
    const first = planAtomicRepair(undefined, 7, ['invalid-explorer'])
    const nextSession = planAtomicRepair(first.nextState, 8, ['invalid-explorer'])
    expect(nextSession.shouldRetry).toBe(true)
    expect(nextSession.nextState.attempts).toBe(1)
  })
})
