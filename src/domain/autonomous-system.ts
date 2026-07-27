import type { Edge } from '@xyflow/react'
import type { GameActionCommand, GameActionReceipt, GameBridgeStatus, GameObservation } from './game-bridge'
import { newCard, type PipelineNode } from './pipeline'

export const currentGameActionCardId = 'game-bridge-current-action'

interface GameBootstrapContext {
  observation: GameObservation
  status: GameBridgeStatus
}

function autonomousController(nodes: PipelineNode[]) {
  const created = newCard('control', nodes.length)
  return {
    ...created,
    id: 'game-lab-controller',
    data: {
      ...created.data,
      label: 'GAME LAB Controller',
      description: 'Global private-game policy. It controls the continuous observe-act-verify loop, sensitive-action review, action budget and emergency stop.',
      owner: 'GAME LAB Agent',
      status: 'healthy' as const,
      rule: 'objective=operate authorized private game | mode=autonomous_mission | loop=observe_act_verify | action_budget=96 | on_review=sensitive_only | on_idle=continue | emergency_stop=required',
    },
  }
}

function minecraftAgent(nodes: PipelineNode[], context: GameBootstrapContext) {
  const created = newCard('agent', nodes.length)
  const observation = context.observation
  return {
    ...created,
    id: 'game-bridge-agent',
    data: {
      ...created.data,
      label: observation.gameState?.kind === 'minecraft' ? 'Minecraft Agent' : `${context.status.game ?? 'Game'} Agent`,
      description: `Autonomous test player connected through ${context.status.game ?? 'the local Game Bridge'}. It continuously observes, executes one checkpoint-bound allowlisted action, verifies the result and plans the next step.`,
      owner: 'GAME LAB Agent',
      status: 'healthy' as const,
      rule: 'environment=private_server | observe=structured_state | act=allowlist | checkpoint=current_observation | emergency_stop=required',
      agentTelemetry: {
        mode: 'test-player' as const,
        state: observation.mission.completed ? 'idle' as const : 'observing' as const,
        objective: observation.mission.objective,
        safetyMode: 'private-server-only' as const,
        confidence: 1,
        lastAction: `Observed ${observation.environment.area} at ${observation.checkpointId}`,
      },
    },
  }
}

function gameReview(nodes: PipelineNode[]) {
  const created = newCard('review', nodes.length)
  return {
    ...created,
    id: 'game-bridge-review',
    data: {
      ...created.data,
      label: 'Review sensitive game action',
      description: 'Low-risk mission actions continue autonomously. A human approves combat, entity or vehicle interaction, low-health recovery and policy changes.',
      owner: 'Game Operator',
      status: 'draft' as const,
      rule: 'checkpoint=sensitive_game_action | approve=one_allowlisted_action | reject=observe_only | timeout=manual',
    },
  }
}

function currentGameAction(nodes: PipelineNode[], agent: PipelineNode, context: GameBootstrapContext) {
  const created = newCard('profile', nodes.length)
  return {
    ...created,
    id: currentGameActionCardId,
    position: {
      x: agent.position.x,
      y: agent.position.y + 250,
    },
    data: {
      ...created.data,
      label: 'Current action',
      description: `Waiting for the next action from ${context.observation.checkpointId}. This card is reused so the graph keeps one readable live action instead of one card per movement.`,
      owner: 'GAME LAB Agent',
      status: 'healthy' as const,
      evidenceRef: context.observation.checkpointId,
      rule: `action=waiting | status=idle | checkpoint=${context.observation.checkpointId}`,
      runState: 'idle' as const,
    },
  }
}

function actionLabel(action: GameActionCommand['action']) {
  return action.replaceAll('_', ' ')
}

export function updateCurrentGameAction(
  nodes: PipelineNode[],
  command: GameActionCommand,
  receipt?: GameActionReceipt,
) {
  const running = !receipt || receipt.status === 'accepted'
  const failed = receipt && ['failed', 'rejected'].includes(receipt.status)
  const stopped = receipt?.status === 'stopped'
  const state: NonNullable<PipelineNode['data']['runState']> = running ? 'running' : failed ? 'failed' : stopped ? 'stopped' : 'completed'
  const status = failed || stopped ? 'blocked' as const : 'healthy' as const
  const summary = receipt?.summary
    ?? `${actionLabel(command.action)} queued against ${command.checkpointId}`
  return nodes.map((node) => node.id === currentGameActionCardId
    ? {
        ...node,
        data: {
          ...node.data,
          description: summary,
          evidenceRef: command.checkpointId,
          status,
          rule: `action=${command.action} | status=${receipt?.status ?? 'running'} | checkpoint=${command.checkpointId}`,
          runState: state,
          runSequence: running ? (node.data.runSequence ?? 0) + 1 : node.data.runSequence,
        },
      }
    : node)
}

export function ensureAutonomousSystemCards(nodes: PipelineNode[], edges: Edge[], context: GameBootstrapContext) {
  let controller = nodes.find((node) => node.id === 'game-lab-controller')
    ?? nodes.find((node) => node.data.kind === 'control' && node.data.controlMode === 'autonomous-player')
  const added: PipelineNode[] = []
  const updated: PipelineNode[] = []
  if (!controller) {
    controller = autonomousController(nodes)
    added.push(controller)
  } else if (controller.id === 'game-lab-controller') {
    const template = autonomousController(nodes)
    controller = { ...controller, data: { ...controller.data, ...template.data } }
    if (!nodes.some((node) => node.id === controller!.id && node.data.description === controller!.data.description && node.data.rule === controller!.data.rule)) {
      updated.push(controller)
    }
  }

  let agent = nodes.find((node) => node.id === 'game-bridge-agent')
    ?? nodes.find((node) => node.data.kind === 'agent')
  if (!agent) {
    agent = minecraftAgent([...nodes, ...added], context)
    added.push(agent)
  } else if (agent.id === 'game-bridge-agent') {
    const template = minecraftAgent(nodes, context)
    agent = { ...agent, data: { ...agent.data, ...template.data } }
    if (!nodes.some((node) => node.id === agent!.id && node.data.description === agent!.data.description && node.data.rule === agent!.data.rule)) {
      updated.push(agent)
    }
  }

  let action = nodes.find((node) => node.id === currentGameActionCardId)
  if (!action) {
    action = currentGameAction([...nodes, ...added], agent, context)
    added.push(action)
  }

  let review = nodes.find((node) => node.id === 'game-bridge-review')
    ?? nodes.find((node) => node.data.kind === 'review')
  if (!review) {
    review = gameReview([...nodes, ...added])
    added.push(review)
  } else if (review.id === 'game-bridge-review') {
    const template = gameReview(nodes)
    review = { ...review, data: { ...review.data, ...template.data } }
    if (!nodes.some((node) => node.id === review!.id && node.data.label === review!.data.label && node.data.description === review!.data.description && node.data.rule === review!.data.rule)) {
      updated.push(review)
    }
  }

  const allEdges = [...edges]
  const addedEdges: Edge[] = []
  if (!allEdges.some((edge) => edge.source === agent.id && edge.target === action.id)) {
    addedEdges.push({
      id: 'game-bridge-agent-current-action',
      source: agent.id,
      target: action.id,
      type: 'elastic',
    })
  }
  if (!allEdges.some((edge) => edge.source === agent.id && edge.target === review.id)) {
    addedEdges.push({
      id: 'game-bridge-agent-review',
      source: agent.id,
      target: review.id,
      type: 'elastic',
    })
  }

  return { added, updated, addedEdges, action, agent, controller, review }
}
