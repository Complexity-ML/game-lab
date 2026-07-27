export type HumanReviewPolicy = 'frequent' | 'risk-based' | 'critical-only'
export type RiskAnalysisDepth = 'standard' | 'deep' | 'exhaustive'
export type UncertaintyPolicy = 'review' | 'no-change' | 'bounded'
export type GameplayPolicy = 'review-each-action' | 'autonomous-mission'

export interface AutonomyPolicy {
  humanReview: HumanReviewPolicy
  riskAnalysis: RiskAnalysisDepth
  uncertainty: UncertaintyPolicy
  gameplay: GameplayPolicy
}

export const defaultAutonomyPolicy: AutonomyPolicy = {
  humanReview: 'risk-based',
  riskAnalysis: 'deep',
  uncertainty: 'review',
  gameplay: 'autonomous-mission',
}

const humanReviewPolicies = new Set<HumanReviewPolicy>(['frequent', 'risk-based', 'critical-only'])
const riskAnalysisDepths = new Set<RiskAnalysisDepth>(['standard', 'deep', 'exhaustive'])
const uncertaintyPolicies = new Set<UncertaintyPolicy>(['review', 'no-change', 'bounded'])
const gameplayPolicies = new Set<GameplayPolicy>(['review-each-action', 'autonomous-mission'])

export function normalizeAutonomyPolicy(value: unknown): AutonomyPolicy {
  const candidate = value && typeof value === 'object' ? value as Partial<AutonomyPolicy> : {}
  return {
    humanReview: humanReviewPolicies.has(candidate.humanReview as HumanReviewPolicy) ? candidate.humanReview as HumanReviewPolicy : defaultAutonomyPolicy.humanReview,
    riskAnalysis: riskAnalysisDepths.has(candidate.riskAnalysis as RiskAnalysisDepth) ? candidate.riskAnalysis as RiskAnalysisDepth : defaultAutonomyPolicy.riskAnalysis,
    uncertainty: uncertaintyPolicies.has(candidate.uncertainty as UncertaintyPolicy) ? candidate.uncertainty as UncertaintyPolicy : defaultAutonomyPolicy.uncertainty,
    gameplay: gameplayPolicies.has(candidate.gameplay as GameplayPolicy) ? candidate.gameplay as GameplayPolicy : defaultAutonomyPolicy.gameplay,
  }
}

export function autonomyPolicyInstructions(policy: AutonomyPolicy) {
  const review = policy.humanReview === 'frequent'
    ? 'Route every material graph diff through native Human Review before commit.'
    : policy.humanReview === 'critical-only'
      ? 'Require Human Review for critical/high risk, sensitive data, irreversible actions and external mutations; allow bounded reversible low-risk graph changes.'
      : 'Require Human Review when confidence is insufficient or impact is sensitive, structural or downstream.'
  const risk = policy.riskAnalysis === 'exhaustive'
    ? 'Build branch-level Impact Analysis and Risk Assessment for every affected player, mission, world area, server resource and action supported by fresh evidence.'
    : policy.riskAnalysis === 'deep'
      ? 'Follow every material gameplay or server impact with an atomic Risk Assessment covering affected targets, severity, confidence and action.'
      : 'Add Risk Assessment when evidence indicates a material downstream impact.'
  const uncertainty = policy.uncertainty === 'review'
    ? 'When evidence is incomplete or conflicting, stop that branch at Human Review.'
    : policy.uncertainty === 'no-change'
      ? 'When evidence is incomplete or conflicting, report the evidence gap and return no graph mutation.'
      : 'When evidence is incomplete, allow only reversible graph-only low-risk work; never assert a gameplay anomaly without fresh evidence.'
  const gameplay = policy.gameplay === 'autonomous-mission'
    ? 'Run the private-game mission as a continuous observe-act-verify loop. Queue exactly one fresh-checkpoint action per iteration. Navigation, mining, placing, crafting, equipping, item use, waiting and stopping may execute without per-action review while health and threat remain safe. Combat, entity interaction, vehicles, elevated threat, low health and policy changes still require Human Review.'
    : 'Require Human Review before every gameplay action.'
  return { review, risk, uncertainty, gameplay }
}

export function policyForcesProposalReview(policy: AutonomyPolicy, materialChangeCount: number) {
  return policy.humanReview === 'frequent' && materialChangeCount > 0
}
