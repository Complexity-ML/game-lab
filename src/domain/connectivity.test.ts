import { describe, expect, it } from 'vitest'
import { classifyConnectivityFailure } from './connectivity'

describe('connectivity incident classification', () => {
  it.each([
    ['offline', new Error('connect ENETUNREACH 10.0.0.1'), 'No network'],
    ['dns', new Error('getaddrinfo ENOTFOUND bridge.private'), 'DNS failure'],
    ['refused', new Error('connect ECONNREFUSED 127.0.0.1:8080'), 'Connection refused'],
    ['timeout', new Error('observation read timed out after 20s'), 'Connection timed out'],
    ['authentication', new Error('HTTP 401 Unauthorized'), 'Authentication failed'],
    ['tls', new Error('self-signed certificate in certificate chain'), 'Secure connection failed'],
  ])('classifies %s without claiming a gameplay anomaly', (kind, error, title) => {
    const incident = classifyConnectivityFailure(error, 'Game Bridge')
    expect(incident).toMatchObject({ kind, sourceSystem: 'GAME LAB connectivity' })
    expect(incident?.title).toContain(title)
    expect(incident?.detail).toContain('Game state was not evaluated')
  })

  it('does not misclassify an ordinary game validation error as connectivity', () => {
    expect(classifyConnectivityFailure('checkpoint does not match the current observation', 'Game Bridge')).toBeUndefined()
  })
})
