import type { Edge } from '@xyflow/react'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AgentPlayerState } from '../components/AppHeader'
import type { SettingsSection } from '../components/shared/SettingsModal'
import { materializeAiProposal, type ActiveAiSource } from '../domain/ai'
import { buildPipelineAgentRequest } from '../domain/agent-context'
import { applyAtomicRunState, buildAtomicRunTrace, executePipelineAtomically, type AtomicPipelineRun } from '../domain/atomic-execution'
import { maximumAtomicRepairAttempts, planAtomicRepair, type AtomicRepairState } from '../domain/atomic-repair'
import type { AutonomyPolicy } from '../domain/autonomy-policy'
import { policyForcesProposalReview } from '../domain/autonomy-policy'
import { ensureAutonomousSystemCards } from '../domain/autonomous-system'
import { classifyConnectivityFailure } from '../domain/connectivity'
import { recordDiagnostic } from '../domain/diagnostics'
import type { IncidentEventInput, IncidentSummary } from '../domain/incidents'
import { defaultBlankObjective, resolveAgentObjective } from '../domain/agent-objective'
import { applyProposal, type AgentProposal, type PipelineNode } from '../domain/pipeline'
import { errorMessage, notifyError, notifyToast } from '../domain/toasts'
import { findEquivalentVersion, graphFingerprint, graphsEquivalent, type PipelineVersion } from '../domain/versioning'
import { atomicTransactionBlockers, validatePipeline, type ValidationIssue } from '../validation'
import { repairMonitorWorkBranches } from '../validation/proposal-repair'
import { disconnectedAiStatus, disconnectedChatGPTStatus } from './useAiConnections'

type ContextMenu = { nodeId: string; label: string; x: number; y: number }
type MutableRef<T> = { current: T }

interface AutonomousPlayerOptions {
  active: { connected: boolean; label: string }
  activeAiSource: ActiveAiSource
  activeAtomicRun: MutableRef<AtomicPipelineRun | undefined>
  agentRunId: MutableRef<number>
  autonomyPolicy: AutonomyPolicy
  commitAutonomousProposal(proposal: AgentProposal, options?: { preservePendingReview?: boolean; executionNodes?: PipelineNode[] }): string | undefined
  discardInvalidProposal(blockerIds: string[]): void
  edges: Edge[]
  fitCommittedGraph(nodeIds?: Iterable<string>): void
  incidentSummaries: IncidentSummary[]
  issues: ValidationIssue[]
  language: string
  logIncident(event: IncidentEventInput): Promise<void>
  nodes: PipelineNode[]
  pendingVersionId?: string
  projectTitle: string
  proposal?: AgentProposal
  recordPendingReview(proposal: AgentProposal): string
  rejectProposal(): void
  resumePlayerAfterReview: MutableRef<boolean>
  reviewAssistant: { busy: boolean; stop(): void }
  setActivity(message: string): void
  setContextMenu: Dispatch<SetStateAction<ContextMenu | undefined>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<PipelineNode[]>>
  setProjectTitle: Dispatch<SetStateAction<string>>
  setProposal: Dispatch<SetStateAction<AgentProposal | undefined>>
  setProposalReviewOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setSettingsSection: Dispatch<SetStateAction<SettingsSection>>
  versions: PipelineVersion[]
  approveProposal(): boolean
}

function runtimeEvidence(observation: Awaited<ReturnType<NonNullable<typeof window.gameLab>['getGameObservation']>>) {
  const evidence = [
    `Game Bridge checkpoint ${observation.checkpointId}: mission=${observation.mission.objective}; stage=${observation.mission.stage}; area=${observation.environment.area}; health=${observation.player.health}; armor=${observation.player.armor}; speed=${observation.player.speed}; threat=${observation.environment.threatLevel}; nearby=${observation.nearby.length}.`,
  ]
  if (observation.gameState?.kind === 'minecraft') {
    evidence.unshift(`Minecraft state: version=${observation.gameState.version}; dimension=${observation.gameState.dimension}; food=${observation.gameState.food}/20; experience_level=${observation.gameState.experienceLevel}; inventory=${observation.gameState.inventory.map((item) => `${item.name}x${item.count}`).join(', ') || 'empty'}; nearby_blocks=${[...new Set(observation.gameState.nearbyBlocks.map((block) => block.name))].slice(0, 24).join(', ') || 'none loaded'}.`)
  }
  return evidence
}

export function useAutonomousPlayer(options: AutonomousPlayerOptions) {
  const {
    active, activeAiSource, activeAtomicRun, agentRunId, autonomyPolicy, commitAutonomousProposal,
    discardInvalidProposal, edges, fitCommittedGraph, incidentSummaries, issues, language, logIncident,
    nodes, pendingVersionId, projectTitle, proposal, recordPendingReview, rejectProposal,
    resumePlayerAfterReview, reviewAssistant, setActivity, setContextMenu, setEdges, setNodes,
    setProjectTitle, setProposal, setProposalReviewOpen, setSettingsOpen, setSettingsSection,
    versions, approveProposal,
  } = options
  const [agentRunning, setAgentRunning] = useState(false)
  const [playerStarting, setPlayerStarting] = useState(false)
  const [playerState, setPlayerState] = useState<AgentPlayerState>('stopped')
  const [proposalApprovalBusy, setProposalApprovalBusy] = useState(false)
  const [autonomousStepRequest, setAutonomousStepRequest] = useState<{ objective: string; sessionId: number; stepId: number }>()
  const [autonomousStepScheduled, setAutonomousStepScheduled] = useState(false)
  const playerSessionId = useRef(0)
  const autonomousStepTimer = useRef<number | undefined>(undefined)
  const autonomousStepId = useRef(0)
  const autonomousSchedulingBlocked = useRef(true)
  const proposalApprovalRunning = useRef(false)
  const atomicRepairState = useRef<AtomicRepairState | undefined>(undefined)

  const queueAutonomousStep = (objective: string, sessionId = playerSessionId.current, delayMs = 650) => {
    if (autonomousSchedulingBlocked.current || playerSessionId.current !== sessionId) return
    if (autonomousStepTimer.current !== undefined) window.clearTimeout(autonomousStepTimer.current)
    const stepId = ++autonomousStepId.current
    setAutonomousStepScheduled(true)
    setActivity(delayMs > 1_000 ? 'Next private-game checkpoint scheduled…' : 'Reading the next private-game checkpoint…')
    autonomousStepTimer.current = window.setTimeout(() => {
      autonomousStepTimer.current = undefined
      if (autonomousSchedulingBlocked.current || playerSessionId.current !== sessionId || autonomousStepId.current !== stepId) {
        if (autonomousStepId.current === stepId) setAutonomousStepScheduled(false)
        return
      }
      setAutonomousStepRequest({ objective, sessionId, stepId })
    }, delayMs)
  }

  const auditWithAgent = async (requestedObjective = defaultBlankObjective, expectedPlayerSessionId?: number) => {
    const objective = resolveAgentObjective(requestedObjective, { hasGraph: nodes.length > 0, matchedSource: nodes.some((node) => node.data.kind === 'server' || node.data.kind === 'agent') })
    if (!objective.accepted) {
      setActivity('Request outside GAME LAB private-game scope · graph unchanged')
      notifyToast('Ask about the private game, mission, agent, server, safety or graph.', 'info', 'No game action detected')
      return
    }
    if (!window.gameLab) {
      setActivity('Game Bridge requires the Electron application')
      return
    }
    setContextMenu(undefined)
    setProposal(undefined)

    const [currentAiStatus, currentChatGPT, bridgeStatus] = await Promise.all([
      window.gameLab.getAiStatus().catch(() => disconnectedAiStatus),
      window.gameLab.getChatGPTStatus().catch(() => disconnectedChatGPTStatus),
      window.gameLab.getGameBridgeStatus().catch((error) => ({
        mode: 'disconnected' as const,
        protocol: 'game-lab.control.v1' as const,
        endpoint: 'http://127.0.0.1:4317',
        message: errorMessage(error, 'Game Bridge status unavailable'),
      })),
    ])
    if (expectedPlayerSessionId !== undefined && playerSessionId.current !== expectedPlayerSessionId) return
    const activeConnected = activeAiSource === 'chatgpt' ? currentChatGPT.connected : currentAiStatus.providers[activeAiSource].connected
    if (!activeConnected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is not connected · open Settings → AI connection`)
      return
    }
    if (bridgeStatus.mode !== 'connected') {
      setSettingsSection('connections')
      setSettingsOpen(true)
      setActivity(`${bridgeStatus.message} · Game Bridge is required`)
      return
    }

    setAgentRunning(true)
    const runId = ++agentRunId.current
    const atomicRun = executePipelineAtomically(nodes, edges)
    activeAtomicRun.current = atomicRun
    const executionNodes = applyAtomicRunState(nodes, atomicRun)
    setNodes((current) => applyAtomicRunState(current, atomicRun))
    try {
      const observation = await window.gameLab.getGameObservation()
      if (agentRunId.current !== runId) return
      const activeModel = activeAiSource === 'chatgpt'
        ? currentChatGPT.selectedModel ?? 'ChatGPT'
        : currentAiStatus.providers[activeAiSource].model
      setActivity(`${activeModel} is analyzing Minecraft checkpoint ${observation.checkpointId}…`)
      const [runtimeDiagnostics, proposalMemory] = await Promise.all([
        window.gameLab.exportDiagnostics()
          .then((bundle) => bundle.events
            .filter((event) => event.status === 'warning' || event.status === 'error')
            .slice(-16)
            .map(({ action, category, status, timestamp }) => ({ action, category, status, timestamp })))
          .catch(() => []),
        window.gameLab.listAgentProposalMemory(),
      ])
      const requestPayload = buildPipelineAgentRequest({
        autonomyPolicy,
        runtimeEvidence: runtimeEvidence(observation),
        edges,
        gameRuntime: {
          connected: true,
          checkpointId: observation.checkpointId,
          observation,
          message: `Fresh structured observation ${observation.observationId} captured at ${observation.capturedAt}.`,
        },
        incidentContext: incidentSummaries,
        issues,
        nodes: executionNodes,
        objective: objective.objective,
        proposalMemory,
        responseLanguage: language === 'fr' ? 'French' : 'English',
        runtimeDiagnostics,
        sourceScope: {
          mode: 'all-candidates',
          sourceIds: nodes.filter((node) => node.data.kind === 'server' || node.data.kind === 'agent').map((node) => node.id),
          evidenceRefs: [],
        },
        versions,
      })
      const response = activeAiSource === 'chatgpt'
        ? await window.gameLab.runChatGPTProposal(requestPayload)
        : await window.gameLab.runAiProposal(requestPayload)
      if (agentRunId.current !== runId) return
      recordDiagnostic({
        category: 'provider',
        action: 'game.proposal',
        status: 'success',
        detail: { source: activeAiSource, model: response.model, checkpointId: observation.checkpointId },
      })
      const nextProposal = materializeAiProposal(response, executionNodes, edges)
      nextProposal.runTrace = buildAtomicRunTrace(nodes, atomicRun)
      const materialChangeCount = nextProposal.addedNodes.length
        + nextProposal.updatedNodes.length
        + nextProposal.addedEdges.length
        + nextProposal.removedEdgeIds.length
        + (nextProposal.gameActions?.length ?? 0)
      if (policyForcesProposalReview(autonomyPolicy, materialChangeCount) || (nextProposal.gameActions?.length ?? 0) > 0) {
        nextProposal.requiresHumanReview = true
      }
      repairMonitorWorkBranches(nextProposal, nodes, edges)
      const preview = applyProposal(executionNodes, edges, nextProposal)
      const proposalFingerprint = graphFingerprint(preview.nodes, preview.edges)
      const remembered = await window.gameLab.rememberAgentProposal({
        graphFingerprint: proposalFingerprint,
        baseGraphFingerprint: graphFingerprint(executionNodes, edges),
        source: 'pipeline',
        title: nextProposal.title,
        summary: nextProposal.summary,
        rationale: nextProposal.rationale,
      })
      const equivalentVersion = findEquivalentVersion(preview.nodes, preview.edges, versions)
      if (remembered.occurrenceCount > 1 || graphsEquivalent(executionNodes, edges, preview.nodes, preview.edges) || equivalentVersion) {
        await window.gameLab.updateAgentProposalMemoryStatus(proposalFingerprint, 'duplicate', equivalentVersion?.id).catch(() => undefined)
        setActivity('Checkpoint already covered · graph unchanged · waiting for a fresh game observation')
        return
      }

      const autonomousSessionActive = expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId
      const touchesReview = nextProposal.addedNodes.some((node) => node.data.kind === 'review')
        || nextProposal.updatedNodes.some((update) => nodes.find((node) => node.id === update.nodeId)?.data.kind === 'review')
      if (touchesReview) nextProposal.requiresHumanReview = true
      if (autonomousSessionActive && !nextProposal.requiresHumanReview) {
        const versionId = commitAutonomousProposal(nextProposal, { executionNodes })
        if (!versionId) {
          const blockers = atomicTransactionBlockers(validatePipeline(preview.nodes, preview.edges))
          const repair = planAtomicRepair(atomicRepairState.current, expectedPlayerSessionId, blockers.map((issue) => issue.id))
          atomicRepairState.current = repair.nextState
          if (repair.shouldRetry) {
            queueAutonomousStep(`Repair the rejected private-game graph diff and resolve only these blockers: ${blockers.map((issue) => `${issue.id}: ${issue.detail}`).join(' | ')}`, expectedPlayerSessionId, 1_200)
            setActivity(`Private-game correction rejected safely · bounded repair 1/${maximumAtomicRepairAttempts} scheduled`)
          } else {
            setActivity('Private-game correction stopped safely · graph unchanged')
          }
          return
        }
        await window.gameLab.updateAgentProposalMemoryStatus(proposalFingerprint, 'committed', versionId).catch(() => undefined)
        if (projectTitle === 'Untitled pipeline') setProjectTitle(nextProposal.title.slice(0, 72))
        fitCommittedGraph(nextProposal.addedNodes.map((node) => node.id))
        setActivity(`Checkpoint committed · ${nextProposal.title} · waiting for Human Review or fresh observation`)
        return
      }

      atomicRepairState.current = undefined
      resumePlayerAfterReview.current = playerState === 'running' && autonomousSessionActive
      setProposal(nextProposal)
      setProposalReviewOpen(true)
      const reviewVersionId = recordPendingReview(nextProposal)
      await window.gameLab.updateAgentProposalMemoryStatus(proposalFingerprint, 'pending-review', reviewVersionId).catch(() => undefined)
      setActivity(`${response.model} proposed ${materialChangeCount} reviewed change(s) · graph unchanged`)
      void window.gameLab.notifyHumanReview({
        cardLabel: 'Minecraft Agent',
        reason: nextProposal.summary,
        versionId: reviewVersionId,
      })
    } catch (error) {
      if (agentRunId.current !== runId) return
      notifyError(error, 'Agent run failed')
      const connectivity = classifyConnectivityFailure(error, active.label)
      if (connectivity) await logIncident({
        incidentKey: `connectivity:provider:${activeAiSource}`,
        transition: 'opened',
        severity: connectivity.kind === 'authentication' ? 'warning' : 'critical',
        title: connectivity.title,
        detail: connectivity.detail,
        sourceSystem: connectivity.sourceSystem,
        fingerprint: connectivity.fingerprint,
      })
      setActivity(`Agent run failed · ${errorMessage(error, 'Unknown provider error')} · graph unchanged`)
    } finally {
      if (agentRunId.current === runId) setAgentRunning(false)
    }
  }

  useEffect(() => {
    if (!autonomousStepRequest) return
    if (autonomousStepRequest.sessionId !== playerSessionId.current || autonomousStepRequest.stepId !== autonomousStepId.current) {
      setAutonomousStepRequest(undefined)
      setAutonomousStepScheduled(false)
      return
    }
    if (playerState !== 'running' || proposal || agentRunning || playerStarting) return
    const request = autonomousStepRequest
    setAutonomousStepRequest(undefined)
    void auditWithAgent(request.objective, request.sessionId).finally(() => {
      if (autonomousStepId.current === request.stepId) setAutonomousStepScheduled(false)
    })
  }, [agentRunning, autonomousStepRequest, playerStarting, playerState, proposal])

  useEffect(() => () => {
    if (autonomousStepTimer.current !== undefined) window.clearTimeout(autonomousStepTimer.current)
  }, [])

  const playAgent = async () => {
    if (agentRunning || playerStarting || reviewAssistant.busy || proposal) return
    if (!active.connected) {
      setSettingsSection('ai')
      setSettingsOpen(true)
      setActivity(`${active.label} is not connected · autonomous player remains stopped`)
      return
    }
    if (!window.gameLab) {
      setActivity('Game Bridge requires the Electron application')
      return
    }
    const bridgeStatus = await window.gameLab.getGameBridgeStatus().catch((error) => ({
      mode: 'disconnected' as const,
      protocol: 'game-lab.control.v1' as const,
      endpoint: 'http://127.0.0.1:4317',
      message: errorMessage(error, 'Game Bridge status unavailable'),
    }))
    if (bridgeStatus.mode !== 'connected') {
      setSettingsSection('connections')
      setSettingsOpen(true)
      setActivity(`${bridgeStatus.message} · connect the local Game Bridge before starting`)
      return
    }
    let observation
    try {
      observation = await window.gameLab.getGameObservation()
    } catch (error) {
      setSettingsSection('connections')
      setSettingsOpen(true)
      setActivity(`${errorMessage(error, 'Game Bridge observation unavailable')} · autonomous player remains stopped`)
      return
    }

    const sessionId = ++playerSessionId.current
    autonomousSchedulingBlocked.current = false
    atomicRepairState.current = undefined
    setAutonomousStepRequest(undefined)
    setAutonomousStepScheduled(false)
    setPlayerStarting(true)
    setPlayerState('running')
    const systemCards = ensureAutonomousSystemCards(nodes, edges, { observation, status: bridgeStatus })
    if (systemCards.added.length || systemCards.addedEdges.length) {
      if (systemCards.added.length) setNodes((current) => [...current, ...systemCards.added])
      if (systemCards.addedEdges.length) setEdges((current) => [...current, ...systemCards.addedEdges])
      setActivity(`${systemCards.added.map((node) => node.data.label).join(' and ')} created · preparing the private-game checkpoint…`)
      setPlayerStarting(false)
      queueAutonomousStep(
        `Execute the persistent GAME LAB private-game policy as coherent checkpoint-bound iterations: ${systemCards.controller.data.rule}`,
        sessionId,
        0,
      )
      return
    }
    setActivity(`Autonomous player started · observing ${bridgeStatus.game ?? 'the private game'}…`)
    void auditWithAgent(
      `Execute the persistent GAME LAB private-game policy exactly and incrementally: ${systemCards.controller.data.rule}`,
      sessionId,
    ).finally(() => setPlayerStarting(false))
  }

  const pauseAgent = () => {
    if (playerState !== 'running') return
    resumePlayerAfterReview.current = false
    autonomousSchedulingBlocked.current = true
    autonomousStepId.current += 1
    setAutonomousStepScheduled(false)
    setAutonomousStepRequest(undefined)
    if (autonomousStepTimer.current !== undefined) window.clearTimeout(autonomousStepTimer.current)
    autonomousStepTimer.current = undefined
    setPlayerState('paused')
    setActivity('Autonomous player paused · no new game action will start')
  }

  const stopAgent = () => {
    const cancellingActiveRun = agentRunning
    setPlayerState('stopped')
    autonomousSchedulingBlocked.current = true
    playerSessionId.current += 1
    agentRunId.current += 1
    autonomousStepId.current += 1
    atomicRepairState.current = undefined
    setPlayerStarting(false)
    setAutonomousStepScheduled(false)
    setAutonomousStepRequest(undefined)
    if (autonomousStepTimer.current !== undefined) window.clearTimeout(autonomousStepTimer.current)
    autonomousStepTimer.current = undefined
    resumePlayerAfterReview.current = false
    setAgentRunning(false)
    reviewAssistant.stop()
    if (cancellingActiveRun) {
      setNodes((current) => current.map((node) => node.data.runState === 'completed'
        ? node
        : { ...node, data: { ...node.data, runState: 'stopped' } }))
      activeAtomicRun.current = undefined
    }
    setActivity(cancellingActiveRun
      ? 'Emergency stop · current agent run cancelled'
      : 'Autonomous player stopped · graph unchanged')
    void window.gameLab?.cancelAiProposal()
    void window.gameLab?.cancelChatGPTProposal()
    if (nodes.some((node) => node.data.kind === 'server' || node.data.kind === 'agent')) {
      void window.gameLab?.emergencyStopGameBridge().then((result) => {
        if (!result.stopped) notifyToast(result.summary, 'error', 'Game Bridge stop failed')
      })
    }
  }

  const rejectAgentProposal = () => {
    const rejected = proposal
    rejectProposal()
    if (rejected?.incidentKey) void logIncident({
      incidentKey: rejected.incidentKey,
      transition: 'worsened',
      severity: 'warning',
      title: `${rejected.title} · rejected`,
      detail: 'Human Review rejected the proposed private-game action. The game state and graph remain unchanged.',
      versionId: pendingVersionId,
    })
  }

  const approveAgentProposal = async () => {
    if (proposalApprovalRunning.current) return false
    proposalApprovalRunning.current = true
    setProposalApprovalBusy(true)
    try {
      const currentProposal = proposal
      const revisionId = pendingVersionId
      if (!currentProposal) return false
      const preview = applyProposal(nodes, edges, currentProposal)
      const approvalBlockers = atomicTransactionBlockers(validatePipeline(preview.nodes, preview.edges))
      if (approvalBlockers.length) {
        await window.gameLab?.updateAgentProposalMemoryStatus(graphFingerprint(preview.nodes, preview.edges), 'invalid', revisionId).catch(() => undefined)
        discardInvalidProposal(approvalBlockers.map((issue) => issue.id))
        setProposalReviewOpen(false)
        setActivity(`Approval blocked safely · ${approvalBlockers.length} graph issue${approvalBlockers.length === 1 ? '' : 's'} · game unchanged`)
        return true
      }
      if (!approveProposal()) return false
      await window.gameLab?.updateAgentProposalMemoryStatus(graphFingerprint(preview.nodes, preview.edges), 'committed', revisionId).catch(() => undefined)
      if (currentProposal.gameActions?.length) {
        if (!window.gameLab) throw new Error('Approved gameplay actions require the Electron Game Bridge')
        for (const gameAction of currentProposal.gameActions) {
          const receipt = await window.gameLab.executeGameAction(gameAction).catch((error) => ({
            commandId: gameAction.commandId,
            checkpointId: gameAction.checkpointId,
            action: gameAction.action,
            status: 'failed' as const,
            summary: errorMessage(error, 'Game Bridge action failed'),
            receivedAt: new Date().toISOString(),
          }))
          setNodes((current) => current.map((node) => node.id === gameAction.agentNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  agentTelemetry: node.data.agentTelemetry
                    ? {
                        ...node.data.agentTelemetry,
                        state: receipt.status === 'accepted' ? 'acting' : receipt.status === 'completed' ? 'observing' : 'blocked',
                        lastAction: `${receipt.action} · ${receipt.status} · ${receipt.summary}`,
                      }
                    : node.data.agentTelemetry,
                },
              }
            : node))
          if (!['accepted', 'completed'].includes(receipt.status)) {
            setPlayerState('paused')
            autonomousSchedulingBlocked.current = true
            setActivity(`Game action ${receipt.action} ${receipt.status} · ${receipt.summary} · player paused`)
            notifyToast(receipt.summary, 'error', `Game action ${receipt.status}`)
            return true
          }
        }
      }
      atomicRepairState.current = undefined
      if (projectTitle === 'Untitled pipeline') setProjectTitle(currentProposal.title.slice(0, 72))
      fitCommittedGraph([
        ...currentProposal.addedNodes.map((node) => node.id),
        ...currentProposal.updatedNodes.map((node) => node.nodeId),
        ...currentProposal.addedEdges.flatMap((edge) => [edge.source, edge.target]),
      ])
      const shouldResume = playerState === 'running' || resumePlayerAfterReview.current
      if (shouldResume) {
        resumePlayerAfterReview.current = false
        autonomousSchedulingBlocked.current = false
        setPlayerState('running')
        queueAutonomousStep(`Human Review approved "${currentProposal.title}". Read a fresh Game Bridge observation before proposing another action.`, playerSessionId.current, 800)
        setActivity('Human Review approved · action completed · fresh checkpoint scheduled')
      } else {
        setActivity('Human Review approved · action completed')
      }
      return true
    } catch (error) {
      notifyError(error, 'Unable to apply the reviewed game action')
      setActivity(`Approval failed · ${errorMessage(error)} · game and graph preserved`)
      return false
    } finally {
      proposalApprovalRunning.current = false
      setProposalApprovalBusy(false)
    }
  }

  return {
    agentRunning,
    approveAgentProposal,
    auditWithAgent,
    pauseAgent,
    playAgent,
    playerSessionId,
    playerStarting,
    playerState,
    proposalApprovalBusy,
    queueAutonomousStep,
    rejectAgentProposal,
    setAgentRunning,
    stepPending: autonomousStepScheduled || Boolean(autonomousStepRequest),
    stopAgent,
  }
}
