import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  autosaveWorkspaceDraft,
  closeWorkspaceDatabase,
  commitActiveWorkspace,
  createWorkspace,
  listAgentProposalMemory,
  listGameCheckpoints,
  loadAppSetting,
  loadSavedWorkspace,
  loadWorkspaceManagerState,
  openWorkspace,
  rememberAgentProposal,
  saveGameCheckpoint,
} from './workspace-db.js'

let testDirectory: string | undefined

function directory(label: string) {
  testDirectory = mkdtempSync(join(tmpdir(), `game-lab-${label}-`))
  return testDirectory
}

afterEach(() => {
  closeWorkspaceDatabase()
  if (testDirectory) rmSync(testDirectory, { force: true, recursive: true })
  testDirectory = undefined
})

describe('SQLite game workspace persistence', () => {
  it('starts with a blank workbench', () => {
    const target = directory('blank')
    expect(loadWorkspaceManagerState(target)).toMatchObject({
      activeWorkspaceId: null,
      workspaces: [],
    })
    expect(autosaveWorkspaceDraft(target, { nodes: [] })).toEqual({ saved: false, reason: 'no-active-workspace' })
  })

  it('isolates game graphs by workspace', () => {
    const target = directory('workspaces')
    const arena = createWorkspace(target, 'Agent arena', { projectTitle: 'Agent arena', nodes: [{ id: 'agent-1' }], edges: [] })
    expect(autosaveWorkspaceDraft(target, { projectTitle: 'Agent arena draft', nodes: [{ id: 'agent-2' }], edges: [] })).toMatchObject({ saved: true })
    expect(commitActiveWorkspace(target, { projectTitle: 'Agent arena', nodes: [{ id: 'agent-1' }], edges: [] })).toMatchObject({ saved: true })

    createWorkspace(target, 'Server operations', { projectTitle: 'Server operations', nodes: [], edges: [] })
    expect(loadSavedWorkspace(target)).toMatchObject({ projectTitle: 'Server operations' })
    openWorkspace(target, arena.activeWorkspaceId!)
    expect(loadSavedWorkspace(target)).toMatchObject({ projectTitle: 'Agent arena' })
  })

  it('stores observations and action receipts in the active game workspace', () => {
    const target = directory('checkpoints')
    const first = createWorkspace(target, 'Arena', { projectTitle: 'Arena' })
    saveGameCheckpoint(target, {
      kind: 'observation',
      checkpointId: 'checkpoint-1',
      observationId: 'observation-1',
      status: 'captured',
      summary: 'Private-server observation captured',
    })
    saveGameCheckpoint(target, {
      kind: 'action',
      checkpointId: 'checkpoint-1',
      commandId: 'command-1',
      action: 'move_to',
      status: 'accepted',
      summary: 'Movement accepted',
    })
    expect(listGameCheckpoints(target)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'observation', checkpointId: 'checkpoint-1' }),
      expect.objectContaining({ kind: 'action', commandId: 'command-1', action: 'move_to' }),
    ]))

    createWorkspace(target, 'Other arena', { projectTitle: 'Other arena' })
    expect(listGameCheckpoints(target)).toEqual([])
    openWorkspace(target, first.activeWorkspaceId!)
    expect(listGameCheckpoints(target)).toHaveLength(2)
  })

  it('deduplicates local proposal memory', () => {
    const target = directory('proposal-memory')
    createWorkspace(target, 'Arena', { projectTitle: 'Arena' })
    const candidate = {
      graphFingerprint: '1111111111111111',
      baseGraphFingerprint: '0000000000000000',
      source: 'pipeline' as const,
      title: 'Recover the agent',
      summary: 'Add a reviewed safe-return branch.',
      rationale: 'The latest game checkpoint reports low health.',
    }
    expect(rememberAgentProposal(target, candidate)).toMatchObject({ occurrenceCount: 1 })
    expect(rememberAgentProposal(target, candidate)).toMatchObject({ occurrenceCount: 2 })
    expect(listAgentProposalMemory(target)).toEqual([
      expect.objectContaining({ title: 'Recover the agent', occurrenceCount: 2 }),
    ])
  })

  it('purges removed integration tables and settings from an existing database', () => {
    const target = directory('removed-integration')
    loadWorkspaceManagerState(target)
    closeWorkspaceDatabase()

    const sqlite = new DatabaseSync(join(target, 'game-lab.sqlite'))
    sqlite.exec(`
      CREATE TABLE catalog_checkpoints (
        scope_id TEXT NOT NULL,
        checkpoint_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (scope_id, checkpoint_key)
      );
      CREATE TABLE catalog_checkpoint_values (
        scope_id TEXT NOT NULL,
        checkpoint_key TEXT NOT NULL,
        path TEXT NOT NULL,
        value_type TEXT NOT NULL,
        PRIMARY KEY (scope_id, checkpoint_key, path)
      );
    `)
    sqlite.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'datahub-token',
      'legacy-secret',
      new Date().toISOString(),
    )
    sqlite.close()

    expect(loadAppSetting(target, 'datahub-token')).toBeNull()
    closeWorkspaceDatabase()

    const cleaned = new DatabaseSync(join(target, 'game-lab.sqlite'))
    const tables = (cleaned.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as { name: string }[]).map((row) => row.name)
    expect(tables).not.toContain('catalog_checkpoints')
    expect(tables).not.toContain('catalog_checkpoint_values')
    cleaned.close()
  })
})
