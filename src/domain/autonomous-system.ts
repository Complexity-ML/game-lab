import type { Edge } from '@xyflow/react'
import type { GameBridgeStatus, GameObservation } from './game-bridge'
import { newCard, type PipelineNode } from './pipeline'

interface GameBootstrapContext {
  observation: GameObservation
  status: GameBridgeStatus
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
      description: `Governed test player connected through ${context.status.game ?? 'the local Game Bridge'}. It observes structured state and executes one reviewed allowlisted action at a time.`,
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
      label: 'Review next game action',
      description: 'A human approves or rejects the next checkpoint-bound game action before it reaches the private server.',
      owner: 'Game Operator',
      status: 'draft' as const,
      rule: 'checkpoint=current_game_observation | approve=one_allowlisted_action | reject=observe_only | timeout=manual',
    },
  }
}

export function ensureAutonomousSystemCards(nodes: PipelineNode[], edges: Edge[], context: GameBootstrapContext) {
  let controller = nodes.find((node) => node.data.kind === 'control' && node.data.controlMode === 'autonomous-player')
  const added: PipelineNode[] = []
  if (!controller) {
    const created = newCard('control', nodes.length)
    controller = {
      ...created,
      id: 'game-lab-controller',
      data: {
        ...created.data,
        label: 'GAME LAB Controller',
        description: 'Global private-game policy. It controls review checkpoints, automatic resume and emergency-stop behavior outside the action path.',
        owner: 'GAME LAB Agent',
        status: 'healthy',
        rule: 'objective=operate authorized private game | mode=autonomous | on_review=checkpoint_and_resume | on_idle=observe | emergency_stop=required',
      },
    }
    added.push(controller)
  }

  let agent = nodes.find((node) => node.data.kind === 'agent')
  if (!agent) {
    agent = minecraftAgent([...nodes, ...added], context)
    added.push(agent)
  }

  let review = nodes.find((node) => node.data.kind === 'review')
  if (!review) {
    review = gameReview([...nodes, ...added])
    added.push(review)
  }

  const allEdges = [...edges]
  const addedEdges: Edge[] = []
  if (!allEdges.some((edge) => edge.source === agent.id && edge.target === review.id)) {
    addedEdges.push({
      id: 'game-bridge-agent-review',
      source: agent.id,
      target: review.id,
      type: 'elastic',
    })
  }

  return { added, addedEdges, agent, controller, review }
}
