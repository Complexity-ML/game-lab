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
import { autonomousMissionActionBudget, autonomousProposalFingerprint, gameActionRequiresHumanReview, isRecoverableGameActionFailure } from '../domain/game-autonomy'
import type { GameObservation, GameObservationSource } from '../domain/game-bridge'
import { gameMotorCheckpoint, gameMotorMaximumActions, type GameMotorExecutionResult } from '../domain/game-motor'
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
  commitAutonomousProposal(proposal: AgentProposal, options?: { preservePendingReview?: boolean; executionNodes?: PipelineNode[]; resolveReview?: boolean }): string | undefined
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
  recordActivity(message: string): void
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
  if (observation.activity) {
    evidence.unshift(`Game activity: state=${observation.activity.state}; source=${observation.activity.source}; reason=${observation.activity.reason}; last_action=${observation.activity.lastAction}; health_delta=${observation.activity.healthDelta}; hostile_count=${observation.activity.hostileCount}${observation.activity.nearestHostile ? `; nearest_hostile=${observation.activity.nearestHostile.state ?? observation.activity.nearestHostile.id}@${observation.activity.nearestHostile.distance}` : ''}.`)
  }
  if (observation.gameState?.kind === 'minecraft') {
    const map = observation.gameState.localMap
    const hazardCells = map?.cells.filter((cell) => cell.state === 'hazard' || cell.state === 'drop')
      .slice(0, 24)
      .map((cell) => `${cell.state}@${cell.position.x},${cell.position.y},${cell.position.z}${cell.ground ? `:${cell.ground}` : ''}`)
      .join(', ')
    evidence.unshift(`Minecraft state: version=${observation.gameState.version}; dimension=${observation.gameState.dimension}; food=${observation.gameState.food}/20; experience_level=${observation.gameState.experienceLevel}; inventory=${observation.gameState.inventory.map((item) => `${item.name}x${item.count}`).join(', ') || 'empty'}; nearby_blocks=${[...new Set(observation.gameState.nearbyBlocks.map((block) => block.name))].slice(0, 24).join(', ') || 'none loaded'}${map ? `; local_map=${map.diameter}x${map.diameter}; walkable=${map.counts.walkable}; blocked=${map.counts.blocked}; hazards=${map.counts.hazard}; drops=${map.counts.drop}; unsafe_cells=${hazardCells || 'none'}` : ''}.`)
  }
  return evidence
}

export function useAutonomousPlayer(options: AutonomousPlayerOptions) {
  const {
    active, activeAiSource, activeAtomicRun, agentRunId, autonomyPolicy, commitAutonomousProposal,
    discardInvalidProposal, edges, fitCommittedGraph, incidentSummaries, issues, language, logIncident,
    nodes, pendingVersionId, projectTitle, proposal, recordActivity, recordPendingReview, rejectProposal,
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
  const autonomousActionCount = useRef(0)
  const autonomousNoProgressCount = useRef(0)
  const nextObservationSource = useRef<GameObservationSource>('autonomous_loop')

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

  const executeGameActions = async (
    gameActions: NonNullable<AgentProposal['gameActions']>,
    expectedPlayerSessionId?: number,
    initialObservation?: GameObservation,
  ): Promise<GameMotorExecutionResult> => {
    if (!window.gameLab) throw new Error('Gameplay actions require the Electron Game Bridge')
    const plan = gameActions.slice(0, gameMotorMaximumActions)
    let latestObservation = initialObservation
    let completedActions = 0
    recordActivity(`GAME LAB Motor started · ${plan.length} bounded action${plan.length === 1 ? '' : 's'} · one GPT planning turn`)
    for (const [index, plannedAction] of plan.entries()) {
      if (expectedPlayerSessionId !== undefined
        && (playerSessionId.current !== expectedPlayerSessionId || autonomousSchedulingBlocked.current)) {
        return {
          completed: false,
          completedActions,
          interrupted: true,
          observation: latestObservation,
          receipt: {
            commandId: plannedAction.commandId,
            checkpointId: latestObservation?.checkpointId ?? plannedAction.checkpointId,
            action: plannedAction.action,
            status: 'stopped',
            summary: 'GAME LAB Motor stopped by the operator before the next action',
            receivedAt: new Date().toISOString(),
          },
        }
      }
      if (latestObservation) {
        const checkpoint = gameMotorCheckpoint(latestObservation, plannedAction.action)
        if (!checkpoint.continue) {
          recordActivity(`GAME LAB Motor checkpoint · plan interrupted before ${plannedAction.action.replaceAll('_', ' ')} · ${checkpoint.reason}`)
          return {
            completed: false,
            completedActions,
            interrupted: true,
            observation: latestObservation,
            missionCompleted: latestObservation.mission.completed,
            receipt: {
              commandId: plannedAction.commandId,
              checkpointId: latestObservation.checkpointId,
              action: plannedAction.action,
              status: 'stopped',
              summary: checkpoint.reason,
              receivedAt: new Date().toISOString(),
            },
          }
        }
      }
      const gameAction = {
        ...plannedAction,
        commandId: `${plannedAction.commandId}-motor-${index + 1}`,
        checkpointId: latestObservation?.checkpointId ?? plannedAction.checkpointId,
        requestedAt: new Date().toISOString(),
      }
      setActivity(`GAME LAB Motor · action ${index + 1}/${plan.length} · ${gameAction.action.replaceAll('_', ' ')}`)
      recordActivity(`Motor action ${index + 1}/${plan.length} queued · ${gameAction.action.replaceAll('_', ' ')} · checkpoint ${gameAction.checkpointId}`)
      const receipt = await window.gameLab.executeGameAction(gameAction).catch((error) => ({
        commandId: gameAction.commandId,
        checkpointId: gameAction.checkpointId,
        action: gameAction.action,
        status: 'failed' as const,
        summary: errorMessage(error, 'Game Bridge action failed'),
        receivedAt: new Date().toISOString(),
      }))
      recordActivity(`Motor action ${index + 1}/${plan.length} ${receipt.status} · ${receipt.action.replaceAll('_', ' ')} · ${receipt.summary}`)
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
        recordActivity('Defensive safety remains armed · only the operator Stop control can disable combat and retreat reflexes')
        return { completed: false, completedActions, receipt, observation: latestObservation }
      }
      completedActions += 1
      if (receipt.status === 'completed' && plan.length === 1) {
        notifyToast(receipt.summary, 'success', `${receipt.action.replaceAll('_', ' ')} completed`)
      }
      try {
        latestObservation = await window.gameLab.getGameObservation('post_action')
        recordActivity(`Motor validation ${index + 1}/${plan.length} · checkpoint ${latestObservation.checkpointId} · health ${latestObservation.player.health} · threat ${latestObservation.environment.threatLevel} · ${latestObservation.activity?.state ?? latestObservation.mission.stage}`)
      } catch (error) {
        return {
          completed: false,
          completedActions,
          observation: latestObservation,
          receipt: {
            commandId: gameAction.commandId,
            checkpointId: gameAction.checkpointId,
            action: gameAction.action,
            status: 'failed',
            summary: `Post-action validation failed: ${errorMessage(error, 'Game Bridge observation unavailable')}`,
            receivedAt: new Date().toISOString(),
          },
        }
      }
      if (latestObservation.mission.completed) {
        recordActivity(`GAME LAB Motor completed the mission after ${completedActions}/${plan.length} planned actions`)
        return { completed: true, completedActions, missionCompleted: true, observation: latestObservation }
      }
    }
    nextObservationSource.current = 'post_action'
    if (plan.length > 1) {
      notifyToast(`${completedActions} actions completed and validated locally.`, 'success', 'GAME LAB Motor completed')
    }
    recordActivity(`GAME LAB Motor plan completed · ${completedActions}/${plan.length} actions validated · GPT checkpoint ready`)
    return { completed: true, completedActions, observation: latestObservation }
  }

  const waitForGameBridgeRecovery = async (expectedPlayerSessionId: number, attempts = 30) => {
    if (!window.gameLab) return false
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (playerSessionId.current !== expectedPlayerSessionId || autonomousSchedulingBlocked.current) return false
      await new Promise((resolve) => window.setTimeout(resolve, 1_000))
      const recovered = await window.gameLab.getGameBridgeStatus()
        .then((status) => status.mode === 'connected')
        .catch(() => false)
      if (recovered) {
        recordActivity(`Game Bridge reconnected · attempt ${attempt} · fresh observation scheduled`)
        return true
      }
      if (attempt === 1 || attempt % 5 === 0) {
        setActivity(`Minecraft reconnecting… ${attempt}s · autonomous mission waiting safely`)
      }
    }
    return false
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
      const observationSource = nextObservationSource.current
      nextObservationSource.current = 'autonomous_loop'
      const observation = await window.gameLab.getGameObservation(observationSource)
      recordActivity(`Observation captured · checkpoint ${observation.checkpointId} · ${observation.activity?.state ?? observation.mission.stage} · ${observation.activity?.reason ?? observation.mission.objective} · health ${observation.player.health}${observation.activity ? ` · ${observation.activity.hostileCount} hostile` : ''}`)
      if (agentRunId.current !== runId) return
      if (expectedPlayerSessionId !== undefined && observation.mission.completed) {
        autonomousSchedulingBlocked.current = true
        setPlayerState('stopped')
        setActivity(`Mission completed · ${observation.mission.objective}`)
        return
      }
      if (expectedPlayerSessionId !== undefined && autonomousActionCount.current >= autonomousMissionActionBudget) {
        autonomousSchedulingBlocked.current = true
        setPlayerState('paused')
        setActivity(`Autonomous mission paused after ${autonomousMissionActionBudget} actions · press Play to authorize a new session`)
        return
      }
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
      const graphChangeCount = nextProposal.addedNodes.length
        + nextProposal.updatedNodes.length
        + nextProposal.addedEdges.length
        + nextProposal.removedEdgeIds.length
      const materialChangeCount = graphChangeCount + (nextProposal.gameActions?.length ?? 0)
      const gameActions = nextProposal.gameActions ?? []
      const autonomousGameplayAllowed = expectedPlayerSessionId !== undefined
        && gameActions.length > 0
        && gameActions.length <= gameMotorMaximumActions
        && gameActions.every((action) => !gameActionRequiresHumanReview(autonomyPolicy, action.action, observation))
        && autonomousActionCount.current + gameActions.length <= autonomousMissionActionBudget
      if (policyForcesProposalReview(autonomyPolicy, materialChangeCount) || (gameActions.length > 0 && !autonomousGameplayAllowed)) {
        nextProposal.requiresHumanReview = true
      }
      repairMonitorWorkBranches(nextProposal, nodes, edges)
      const preview = applyProposal(executionNodes, edges, nextProposal)
      const previewGraphFingerprint = graphFingerprint(preview.nodes, preview.edges)
      const proposalFingerprint = gameActions.length
        ? autonomousProposalFingerprint(previewGraphFingerprint, gameActions)
        : previewGraphFingerprint
      const remembered = await window.gameLab.rememberAgentProposal({
        graphFingerprint: proposalFingerprint,
        baseGraphFingerprint: graphFingerprint(executionNodes, edges),
        source: 'pipeline',
        title: nextProposal.title,
        summary: nextProposal.summary,
        rationale: nextProposal.rationale,
      })
      const equivalentVersion = findEquivalentVersion(preview.nodes, preview.edges, versions)
      if (remembered.occurrenceCount > 1 || (!gameActions.length && (graphsEquivalent(executionNodes, edges, preview.nodes, preview.edges) || equivalentVersion))) {
        await window.gameLab.updateAgentProposalMemoryStatus(proposalFingerprint, 'duplicate', equivalentVersion?.id).catch(() => undefined)
        if (expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId) {
          autonomousNoProgressCount.current += 1
          if (autonomousNoProgressCount.current <= 3) {
            setActivity(`No useful action selected · retrying from a fresh checkpoint (${autonomousNoProgressCount.current}/3)`)
            queueAutonomousStep(
              `The previous turn made no gameplay progress. Read the fresh Minecraft observation and queue a concrete bounded GAME LAB Motor plan of up to ${gameMotorMaximumActions} nearby, low-risk allowlisted actions that advances "${observation.mission.objective}". Use fewer steps when the evidence cannot safely support a longer sequence. Do not create or update graph cards merely to justify ordinary motor actions.`,
              expectedPlayerSessionId,
              1_200,
            )
          } else {
            autonomousSchedulingBlocked.current = true
            setPlayerState('paused')
            setActivity('Autonomous mission paused after 3 no-progress turns · press Play to start a fresh session')
          }
        } else {
          setActivity('Checkpoint already covered · graph unchanged')
        }
        return
      }

      const autonomousSessionActive = expectedPlayerSessionId !== undefined && playerSessionId.current === expectedPlayerSessionId
      const touchesReview = nextProposal.addedNodes.some((node) => node.data.kind === 'review')
        || nextProposal.updatedNodes.some((update) => nodes.find((node) => node.id === update.nodeId)?.data.kind === 'review')
      if (touchesReview) nextProposal.requiresHumanReview = true
      if (autonomousSessionActive && !nextProposal.requiresHumanReview) {
        let versionId: string | undefined
        if (graphChangeCount > 0) {
          versionId = commitAutonomousProposal(nextProposal, { executionNodes, resolveReview: gameActions.length === 0 })
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
        }
        await window.gameLab.updateAgentProposalMemoryStatus(proposalFingerprint, 'committed', versionId).catch(() => undefined)
        if (gameActions.length) {
          setActivity(`${response.model} planned ${gameActions.length} GAME LAB Motor action${gameActions.length === 1 ? '' : 's'} · executing locally from action ${autonomousActionCount.current + 1}/${autonomousMissionActionBudget}…`)
          const execution = await executeGameActions(gameActions, expectedPlayerSessionId, observation)
          if (agentRunId.current !== runId) return
          autonomousActionCount.current += execution.completedActions
          if (execution.missionCompleted) {
            autonomousSchedulingBlocked.current = true
            setPlayerState('stopped')
            setActivity(`Mission completed · ${observation.mission.objective} · ${execution.completedActions} motor actions in the final plan`)
            notifyToast(observation.mission.objective, 'success', 'Mission completed')
            return
          }
          if (!execution.completed) {
            if (execution.interrupted && autonomousSchedulingBlocked.current) {
              recordActivity(`GAME LAB Motor paused by operator · ${execution.completedActions}/${gameActions.length} actions completed`)
              setActivity(`Autonomous player paused · motor stopped after ${execution.completedActions}/${gameActions.length} actions`)
              return
            }
            if (execution.interrupted && expectedPlayerSessionId !== undefined
              && playerSessionId.current === expectedPlayerSessionId
              && !autonomousSchedulingBlocked.current) {
              autonomousNoProgressCount.current = execution.completedActions > 0 ? 0 : autonomousNoProgressCount.current + 1
              const reason = execution.receipt?.summary ?? 'Fresh game state requires replanning'
              recordActivity(`GAME LAB Motor yielded to GPT · ${execution.completedActions}/${gameActions.length} actions completed · ${reason}`)
              setActivity(`GAME LAB Motor checkpoint · ${execution.completedActions}/${gameActions.length} actions complete · replanning once`)
              queueAutonomousStep(
                `The local GAME LAB Motor completed ${execution.completedActions}/${gameActions.length} planned actions, then yielded safely because: ${reason}. Read the fresh checkpoint and create the next bounded motor plan toward "${observation.mission.objective}". Do not repeat completed steps.`,
                expectedPlayerSessionId,
                250,
              )
              return
            }
            const recoverableDisconnect = /not connected|disconnect|reconnect|socket|ended/i.test(execution.receipt?.summary ?? '')
            if (recoverableDisconnect && expectedPlayerSessionId !== undefined) {
              setActivity('Minecraft connection lost · waiting for automatic Game Bridge recovery…')
              recordActivity(`Game Bridge recovery started · ${execution.receipt?.summary ?? 'Minecraft disconnected'}`)
              const recovered = await waitForGameBridgeRecovery(expectedPlayerSessionId)
              if (recovered) {
                autonomousNoProgressCount.current = 0
                setActivity('Minecraft reconnected · reading a fresh checkpoint before resuming')
                queueAutonomousStep(
                  `Minecraft reconnected after an interrupted action. Read a fresh observation and safely resume "${observation.mission.objective}" without assuming the failed action completed.`,
                  expectedPlayerSessionId,
                  350,
                )
                return
              }
              if (playerSessionId.current !== expectedPlayerSessionId) return
            }
            const failureSummary = execution.receipt?.summary ?? 'Game Bridge failure'
            const recoverableObstacle = isRecoverableGameActionFailure(failureSummary)
            if (recoverableObstacle && expectedPlayerSessionId !== undefined) {
              autonomousNoProgressCount.current += 1
              if (autonomousNoProgressCount.current <= 3) {
                const attempt = autonomousNoProgressCount.current
                recordActivity(`Action blocked · ${execution.receipt?.action ?? 'unknown'} · replanning from a fresh 5-block local map (${attempt}/3)`)
                setActivity(`Minecraft route or target blocked · safe replan ${attempt}/3 from a fresh checkpoint`)
                queueAutonomousStep(
                  `The prior GAME LAB Motor action "${execution.receipt?.action ?? 'Minecraft'}" failed safely after ${execution.completedActions}/${gameActions.length} completed steps: ${failureSummary}. Capture a fresh observation, inspect the 5-block localMap, and create a different bounded recovery plan. Prefer alternate reachable coordinates or targets. Do not assume the failed action completed and do not repeat completed or stale targets.`,
                  expectedPlayerSessionId,
                  500,
                )
                return
              }
              recordActivity(`Safe replan limit reached · ${failureSummary} · operator intervention required`)
            }
            autonomousSchedulingBlocked.current = true
            setPlayerState('paused')
            setActivity(`Autonomous action ${execution.receipt?.action ?? 'unknown'} failed · ${failureSummary} · mission paused`)
            notifyToast(failureSummary, 'error', 'Mission paused')
            return
          }
          autonomousNoProgressCount.current = 0
        }
        if (projectTitle === 'Untitled pipeline') setProjectTitle(nextProposal.title.slice(0, 72))
        fitCommittedGraph(nextProposal.addedNodes.map((node) => node.id))
        setActivity(gameActions.length
          ? `GAME LAB Motor completed · ${gameActions.length} actions validated locally · reading one GPT checkpoint`
          : `Checkpoint committed · ${nextProposal.title} · continuing the autonomous mission`)
        queueAutonomousStep(
          gameActions.length
            ? `The GAME LAB Motor completed and locally validated ${gameActions.length} actions. Read the changed Minecraft state once, assess progress, and prepare the next bounded 5-to-${gameMotorMaximumActions}-step motor plan toward "${observation.mission.objective}". Use fewer steps if fresh evidence supports fewer.`
            : `Continue the autonomous private-game mission toward "${observation.mission.objective}" from a fresh checkpoint. Prefer one bounded GAME LAB Motor plan instead of a single micro-action.`,
          expectedPlayerSessionId,
          gameActions.length ? 300 : 650,
        )
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
      observation = await window.gameLab.getGameObservation('startup')
    } catch (error) {
      setSettingsSection('connections')
      setSettingsOpen(true)
      setActivity(`${errorMessage(error, 'Game Bridge observation unavailable')} · autonomous player remains stopped`)
      return
    }

    const sessionId = ++playerSessionId.current
    autonomousSchedulingBlocked.current = false
    atomicRepairState.current = undefined
    autonomousActionCount.current = 0
    autonomousNoProgressCount.current = 0
    nextObservationSource.current = 'autonomous_loop'
    setAutonomousStepRequest(undefined)
    setAutonomousStepScheduled(false)
    setPlayerStarting(true)
    setPlayerState('running')
    const systemCards = ensureAutonomousSystemCards(nodes, edges, { observation, status: bridgeStatus })
    if (systemCards.added.length || systemCards.updated.length || systemCards.addedEdges.length) {
      if (systemCards.added.length || systemCards.updated.length) setNodes((current) => {
        const replacements = new Map(systemCards.updated.map((node) => [node.id, node]))
        return [...current.map((node) => replacements.get(node.id) ?? node), ...systemCards.added]
      })
      if (systemCards.addedEdges.length) setEdges((current) => [...current, ...systemCards.addedEdges])
      const changedLabels = [...systemCards.added, ...systemCards.updated].map((node) => node.data.label)
      setActivity(`${changedLabels.join(' and ')} ${systemCards.added.length ? 'prepared' : 'upgraded'} · preparing the private-game checkpoint…`)
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
    autonomousActionCount.current = 0
    autonomousNoProgressCount.current = 0
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
        const execution = await executeGameActions(currentProposal.gameActions)
        autonomousActionCount.current += execution.completedActions
        if (execution.missionCompleted) {
          autonomousSchedulingBlocked.current = true
          setPlayerState('stopped')
          setActivity(`Mission completed · ${execution.completedActions} reviewed motor actions executed`)
          notifyToast('The reviewed GAME LAB Motor plan completed the mission.', 'success', 'Mission completed')
          return true
        }
        if (!execution.completed) {
          setPlayerState('paused')
          autonomousSchedulingBlocked.current = true
          setActivity(`GAME LAB Motor stopped after ${execution.completedActions}/${currentProposal.gameActions.length} actions · ${execution.receipt?.summary ?? 'Game Bridge failure'} · player paused`)
          notifyToast(execution.receipt?.summary ?? 'The reviewed game action failed.', 'error', 'Game action failed')
          return true
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
