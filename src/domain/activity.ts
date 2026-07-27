import type { GameCheckpointSummary } from './game-bridge'

const agentActivityTerms = /\b(agent|autonomous|player|proposal|review|controller|iteration|graph|catalog|monitor|checkpoint|atomic|incident|gpt|chatgpt|claude|kimi|model)\b/i

/**
 * The Actions panel is intentionally narrower than the complete Live log, but
 * it must retain every lifecycle message that can replace a scheduled step.
 * Otherwise a completed "Graph is current" turn appears permanently stuck on
 * the older "iteration scheduled" entry.
 */
export function isAgentActionActivity(message: string) {
  return agentActivityTerms.test(message)
}

function readableAction(value?: string) {
  return value?.replaceAll('_', ' ') ?? 'game action'
}

export function gameCheckpointActivityMessage(checkpoint: GameCheckpointSummary) {
  const status = checkpoint.status.replaceAll('_', ' ')
  const summary = checkpoint.summary
    .replace(new RegExp(`^${checkpoint.status}\\s*[·:-]?\\s*`, 'i'), '')
    .trim()
  const subject = checkpoint.kind === 'action'
    ? `Action ${readableAction(checkpoint.action)}`
    : 'Observation'
  return `${subject} ${status}${summary ? ` · ${summary}` : ''}`.slice(0, 640)
}
