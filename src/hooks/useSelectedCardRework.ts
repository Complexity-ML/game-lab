import type { Edge } from '@xyflow/react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { buildCardReworkRequest } from '../domain/agent-context'
import { materializeAiProposal } from '../domain/ai'
import type { ActiveAiSource } from '../domain/ai'
import { applyAtomicRunState, buildAtomicRunTrace, executePipelineAtomically, type AtomicPipelineRun } from '../domain/atomic-execution'
import type { GameEvidence } from '../domain/game-evidence'
import { applyProposal, type AgentProposal, type PipelineNode } from '../domain/pipeline'
import { errorMessage, notifyError } from '../domain/toasts'
import { findEquivalentVersion, graphFingerprint, graphsEquivalent, type PipelineVersion } from '../domain/versioning'
import { repairMonitorWorkBranches } from '../validation/proposal-repair'
import type { ValidationIssue } from '../validation/types'
import { disconnectedAiStatus, disconnectedChatGPTStatus } from './useAiConnections'

export function useSelectedCardRework(options: {
  active: { connected: boolean; label: string; model: string }
  activeAiSource: ActiveAiSource
  activeAtomicRun: MutableRefObject<AtomicPipelineRun | undefined>
  agentRunId: MutableRefObject<number>
  edges: Edge[]
  issues: ValidationIssue[]
  language: 'en' | 'fr'
  nodes: PipelineNode[]
  openAiSettings(): void
  recordPendingReview(proposal: AgentProposal): string
  resumePlayerAfterReview: MutableRefObject<boolean>
  selected?: PipelineNode
  setActivity(value: string): void
  setAgentRunning(value: boolean): void
  setContextMenu: Dispatch<SetStateAction<{ nodeId: string; label: string; x: number; y: number } | undefined>>
  setNodes: Dispatch<SetStateAction<PipelineNode[]>>
  setProposal: Dispatch<SetStateAction<AgentProposal | undefined>>
  setProposalReviewOpen(value: boolean): void
  versions: PipelineVersion[]
}) {
  return async (targetNodeId?: string, objective?: string) => {
    const selected = targetNodeId
      ? options.nodes.find((node) => node.id === targetNodeId)
      : options.selected
    if (!selected) return
    options.setContextMenu(undefined)
    if (!window.gameLab) {
      options.setActivity('AI provider unavailable in web preview · launch the Electron application')
      return
    }
    const [status, currentChatGPT] = await Promise.all([window.gameLab.getAiStatus().catch(() => disconnectedAiStatus), window.gameLab.getChatGPTStatus().catch(() => disconnectedChatGPTStatus)])
    const activeConnected = options.activeAiSource === 'chatgpt' ? currentChatGPT.connected : status.providers[options.activeAiSource].connected
    if (!activeConnected) {
      options.openAiSettings()
      options.setActivity(`${options.active.label} is not connected · no card action was generated`)
      return
    }
    options.setAgentRunning(true)
    const runId = ++options.agentRunId.current
    const atomicRun = executePipelineAtomically(options.nodes, options.edges)
    options.activeAtomicRun.current = atomicRun
    options.setNodes((current) => applyAtomicRunState(current, atomicRun))
    const activeModel = options.activeAiSource === 'chatgpt' ? currentChatGPT.selectedModel ?? 'ChatGPT' : status.providers[options.activeAiSource].model
    options.setActivity(`${activeModel} is reviewing ${selected.data.label} with version context…`)
    try {
      const observation = await window.gameLab.getGameObservation()
      if (options.agentRunId.current !== runId) return
      const evidenceEntries: GameEvidence[] = [{
        tool: 'game_bridge.observation',
        source: observation.observationId,
        capturedAt: observation.capturedAt,
        expiresAt: new Date(Date.parse(observation.capturedAt) + 60_000).toISOString(),
        status: 'ok',
        summary: `Checkpoint ${observation.checkpointId}: ${observation.mission.objective}; stage=${observation.mission.stage}; health=${observation.player.health}; nearby=${observation.nearby.length}.`,
        cached: false,
        stale: false,
      }]
      const requestPayload = buildCardReworkRequest({
        runtimeEvidence: evidenceEntries,
        edges: options.edges,
        focusNodeId: selected.id,
        issues: options.issues,
        nodes: options.nodes,
        objective,
        proposalMemory: await window.gameLab.listAgentProposalMemory(),
        responseLanguage: options.language === 'fr' ? 'French' : 'English',
        versions: options.versions,
      })
      const response = options.activeAiSource === 'chatgpt' ? await window.gameLab.runChatGPTProposal(requestPayload) : await window.gameLab.runAiProposal(requestPayload)
      if (options.agentRunId.current !== runId) return
      const nextProposal = materializeAiProposal(response, options.nodes, options.edges)
      repairMonitorWorkBranches(nextProposal, options.nodes, options.edges)
      nextProposal.runTrace = buildAtomicRunTrace(options.nodes, atomicRun)
      const preview = applyProposal(options.nodes, options.edges, nextProposal)
      const proposalGraphFingerprint = graphFingerprint(preview.nodes, preview.edges)
      const rememberedProposal = await window.gameLab.rememberAgentProposal({
        graphFingerprint: proposalGraphFingerprint,
        baseGraphFingerprint: graphFingerprint(options.nodes, options.edges),
        source: 'card-rework',
        title: nextProposal.title,
        summary: nextProposal.summary,
        rationale: nextProposal.rationale,
      })
      if (rememberedProposal.occurrenceCount > 1) {
        options.setActivity(`Repeated card graph blocked by SQLite memory · "${rememberedProposal.title}" was already attempted ${rememberedProposal.occurrenceCount - 1} time${rememberedProposal.occurrenceCount === 2 ? '' : 's'} · no revision created`)
        return
      }
      const equivalentVersion = findEquivalentVersion(preview.nodes, preview.edges, options.versions)
      if (graphsEquivalent(options.nodes, options.edges, preview.nodes, preview.edges) || equivalentVersion) {
        await window.gameLab.updateAgentProposalMemoryStatus(proposalGraphFingerprint, 'duplicate', equivalentVersion?.id).catch(() => undefined)
        options.setActivity(`Card proposal blocked as equivalent to ${equivalentVersion ? `${equivalentVersion.label} (${equivalentVersion.status ?? 'committed'})` : 'the current graph'} · no revision created`)
        return
      }
      nextProposal.evidence = evidenceEntries
      options.resumePlayerAfterReview.current = false
      options.setProposal(nextProposal)
      options.setProposalReviewOpen(true)
      const reviewVersionId = options.recordPendingReview(nextProposal)
      await window.gameLab.updateAgentProposalMemoryStatus(proposalGraphFingerprint, 'pending-review', reviewVersionId).catch(() => undefined)
      options.setActivity(`${response.model} proposed a card-level diff${nextProposal.requiresHumanReview ? ' · human review required' : ' · agent is confident'}`)
      if (nextProposal.requiresHumanReview) void window.gameLab.notifyHumanReview({ cardLabel: selected.data.label, reason: nextProposal.summary, versionId: reviewVersionId })
    } catch (error) {
      notifyError(error, 'Card analysis failed')
      if (options.agentRunId.current !== runId) return
      options.setActivity(`Card analysis failed · ${errorMessage(error, 'Unknown provider error')} · card unchanged`)
    } finally {
      if (options.agentRunId.current === runId) options.setAgentRunning(false)
    }
  }
}
