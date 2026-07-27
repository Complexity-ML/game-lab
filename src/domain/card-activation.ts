import type { Edge } from '@xyflow/react'
import { cardRoleContracts } from './agent-runner'
import type { CardKind, PipelineNode } from './pipeline'

export type CardActivationState = 'host-owned' | 'present' | 'recommended' | 'available'

export interface CardActivationRecommendation {
  kind: CardKind
  state: CardActivationState
  reason: string
}

interface FindingLike {
  detail?: string
  severity?: string
  title?: string
}

const cardKinds = Object.keys(cardRoleContracts) as CardKind[]

export function buildCardActivationPlan(
  nodes: PipelineNode[],
  edges: Edge[],
  findings: FindingLike[] = [],
  incidentCount = 0,
): CardActivationRecommendation[] {
  const present = new Set(nodes.map((node) => node.data.kind))
  const blocked = findings.some((finding) => finding.severity === 'error' || finding.severity === 'blocking')
  const text = findings.map((finding) => `${finding.title ?? ''} ${finding.detail ?? ''}`).join(' ').toLowerCase()
  const hasFeedback = edges.some((edge) => edge.sourceHandle === 'feedback')
  const branchCount = Math.max(incidentCount, nodes.filter((node) => node.data.kind === 'risk').length)

  const reason = (kind: CardKind): string | undefined => {
    switch (kind) {
      case 'control': return nodes.length === 0 ? 'The autonomous player needs one host-owned controller.' : undefined
      case 'server': return !present.has('server') ? 'Connect one authorized private game server.' : undefined
      case 'agent': return present.has('server') && !present.has('agent') ? 'Add one governed test player for the private world.' : undefined
      case 'explorer': return present.has('agent') && !present.has('explorer') ? 'Explore only the bounded nearby game world from fresh observations.' : undefined
      case 'query': return present.has('server') && !present.has('query') ? 'Read one structured Game Bridge observation.' : undefined
      case 'source': return present.has('query') && !present.has('source') ? 'Keep a bounded game-evidence reference for the current checkpoint.' : undefined
      case 'profile': return present.has('source') && !present.has('profile') ? 'Summarize the current health, inventory and nearby world state.' : undefined
      case 'analysis': return (present.has('agent') || present.has('profile')) && !present.has('analysis') ? 'Interpret mission progress from fresh structured evidence.' : undefined
      case 'impact': return present.has('analysis') && !present.has('impact') ? 'Bound player, world and server impact before action.' : undefined
      case 'risk': return (blocked || present.has('impact')) && !present.has('risk') ? 'Material game impact needs an explicit operational risk decision.' : undefined
      case 'decision': return present.has('analysis') && !present.has('decision') ? 'Choose a bounded action or stop for review.' : undefined
      case 'review': return (present.has('decision') || present.has('risk')) && !present.has('review') ? 'A material game action needs Human Review.' : undefined
      case 'patch': return present.has('review') && !present.has('patch') ? 'Describe the reviewed allowlisted action and rollback.' : undefined
      case 'validation': return (present.has('patch') || present.has('review')) && !present.has('validation') ? 'Require a fresh post-action observation.' : undefined
      case 'output': return present.has('validation') && !present.has('output') ? 'Store the reviewed mission or recovery result.' : undefined
      case 'monitor': return present.has('output') && !hasFeedback ? 'Watch for a new game checkpoint after the terminal result.' : undefined
      case 'parallel': return branchCount > 1 && !present.has('parallel') ? 'Run independent incident branches with bounded context.' : undefined
      case 'diagram': return branchCount > 1 && !present.has('diagram') ? 'Group multiple game incident branches.' : undefined
      case 'split': return present.has('risk') && !present.has('split') ? 'Separate approved action and stop outcomes.' : undefined
      case 'transform': return /\b(convert|map|normalize)\b/.test(text) && !present.has('transform') ? 'Normalize one action argument before review.' : undefined
      case 'worker': return branchCount > 1 && !present.has('worker') ? 'Execute bounded independent mission work.' : undefined
      default: return undefined
    }
  }

  return cardKinds.map((kind) => ({
    kind,
    state: ['control', 'explorer', 'worker'].includes(kind)
      ? 'host-owned'
      : present.has(kind)
        ? 'present'
        : reason(kind)
          ? 'recommended'
          : 'available',
    reason: reason(kind) ?? (present.has(kind) ? 'Already present in the graph.' : 'Available when the mission requires it.'),
  }))
}
