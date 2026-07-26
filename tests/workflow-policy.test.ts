import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')

describe('hackathon CI policy', () => {
  it('builds Setup on demand and when Setup sources reach main', () => {
    const setup = workflow('setup-preview.yml')
    expect(setup).toContain('  workflow_dispatch:')
    expect(setup).not.toContain('  pull_request:')
    expect(setup).toContain('  push:')
    expect(setup).toContain('branches: [main]')
    expect(setup).toContain("'apps/bootstrap-installer/**'")
    expect(setup).toContain("'install-game-lab-macos.sh'")
  })

  it('keeps the expensive Windows packaging smoke off UI-only changes and main pushes', () => {
    const windows = workflow('windows-smoke.yml')
    expect(windows).toContain('  pull_request:')
    expect(windows).not.toContain("      - 'src/**'")
    expect(windows).not.toContain('  push:')
  })

  it('runs portable tests and a production build on every pull request', () => {
    const fast = workflow('fast-pr.yml')
    expect(fast).toContain('  pull_request:')
    expect(fast).toContain('run: npm test')
    expect(fast).toContain('run: npm run build')
  })
})
