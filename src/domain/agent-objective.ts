const defaultBlankObjective = 'Start an evidence-backed GAME LAB workflow for an owned or explicitly authorized private game server. Read list_card_kinds before planning. Prefer an existing Game Server card and its versioned telemetry. Diagnose one bounded server incident or evaluate one private Agent Arena replay. Keep all agent actions allowlisted, preserve an immediate emergency stop, require Human Review before a server command or policy promotion, validate post-conditions, and end with a Game Result that records the server, affected players or mission, evidence window, action, rollback and safety verdict. Never target public servers, bypass anti-cheat or invent telemetry.'

const dataIntent = /\b(agent|analyse|analyze|arena|audit|cards?|cartes?|diagnose|diagrams?|fivem|game|graphs?|graphes?|incidents?|latency|mission|monitors?|npc|players?|replay|resources?|risks?|risques?|server|telemetry|validation|workspaces?)\b/i
const graphAction = /\b(add|ajoute|build|compare|continue|corrige|create|cree|detect|discover|fix|improve|investigate|monitor|patch|repair|repare|review|route|run|surveille|trace|upgrade|verify)\b/i

export interface AgentObjectiveResolution {
  accepted: boolean
  objective: string
  defaulted: boolean
}

export function dataHubDiscoveryQuery(objective: string): string {
  const normalized = objective.trim().replace(/\s+/g, ' ')
  if (normalized === defaultBlankObjective) return 'game server'
  if (/\bGAME LAB Control\b/i.test(normalized) && /\b(?:objective|on_review|on_idle)=/i.test(normalized)) return 'game server'
  return normalized
}

export function resolveAgentObjective(rawObjective: string, options: { hasGraph: boolean; matchedSource: boolean }): AgentObjectiveResolution {
  const objective = rawObjective.trim().replace(/\s+/g, ' ')
  if (!objective) return { accepted: true, objective: defaultBlankObjective, defaulted: true }
  const accepted = dataIntent.test(objective)
    || options.matchedSource
    || (options.hasGraph && graphAction.test(objective))
  return { accepted, objective, defaulted: false }
}

export { defaultBlankObjective }
