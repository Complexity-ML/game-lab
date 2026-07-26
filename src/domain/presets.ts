import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'

type ScenarioPresetId = 'server-ops' | 'agent-arena' | 'pii-masking' | 'schema-drift' | 'broken-governance' | 'license-reclamation' | 'compliance-exposure' | 'renewal-optimization'

interface ScenarioPreset {
  title: string
  nodes: PipelineNode[]
  edges: Edge[]
}

const fresh = { capturedAt: '2026-07-22T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', stale: false }

export const scenarioPresets: Record<ScenarioPresetId, ScenarioPreset> = {
  'server-ops': {
    title: 'FiveM server incident response',
    nodes: [
      {
        id: 'game-server',
        type: 'pipeline',
        position: { x: 80, y: 220 },
        data: {
          kind: 'server',
          label: 'Los Santos Private',
          description: 'Private FiveM staging server with bounded health, player and resource telemetry. No public-server automation.',
          owner: 'Game Operations',
          status: 'warning',
          schema: [],
          rule: 'transport=read_only | scope=private_server | health=degraded | commands=reviewed',
          serverTelemetry: {
            platform: 'FiveM',
            state: 'degraded',
            endpoint: 'staging.local:30120',
            playersOnline: 42,
            playerCapacity: 128,
            latencyMs: 86,
            cpuPercent: 78,
            memoryMb: 5940,
            resourcesRunning: 37,
            resourcesFailed: 1,
          },
        },
      },
      { id: 'server-monitor', type: 'pipeline', position: { x: 390, y: 220 }, data: { kind: 'monitor', label: 'Watch session health', description: 'Detects a changed server fingerprint, latency regression or failed resource and opens one bounded incident iteration.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'on_change(metadata_fingerprint) | cooldown=60s | max_iterations=10 | alert=severity_increase', monitorMode: 'event-loop' } },
      { id: 'server-analysis', type: 'pipeline', position: { x: 700, y: 220 }, data: { kind: 'analysis', label: 'Diagnose resource hitch', description: 'Correlates the failed inventory resource with the latency spike while preserving the exact telemetry window.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'window=5m | correlate=resource_state,latency,cpu | raw_player_data=excluded' } },
      { id: 'server-risk', type: 'pipeline', position: { x: 1010, y: 220 }, data: { kind: 'risk', label: 'Session stability risk', description: 'One failed resource is degrading the private staging session for the 42 connected test players.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'scope=inventory_resource | risk_domain=reliability | risk_type=data | severity=medium | confidence=0.94 | evidence=fresh | affected_assets=42 | action=review_then_restart_failed_resource' } },
      { id: 'server-decision', type: 'pipeline', position: { x: 1320, y: 220 }, data: { kind: 'decision', label: 'Choose bounded recovery', description: 'Selects a single-resource restart instead of a full server restart, or escalates when the evidence changes.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'prefer=restart_failed_resource | forbid=full_server_restart | fallback=human_review' } },
      { id: 'server-review', type: 'pipeline', position: { x: 1630, y: 220 }, data: { kind: 'review', label: 'Approve resource restart', description: 'A server operator reviews the affected resource, player impact and rollback before any command is sent.', owner: 'Server Operator', status: 'draft', schema: [], rule: 'approve=restart_inventory | reject=observe_only | timeout=manual' } },
      { id: 'server-patch', type: 'pipeline', position: { x: 1940, y: 220 }, data: { kind: 'patch', label: 'Restart inventory only', description: 'Versioned recovery plan scoped to one failed resource; source configuration and player state remain untouched.', owner: 'GAME LAB Agent', status: 'draft', schema: [], rule: 'graph_only: command=restart inventory | rollback=start_previous_version | scope=single_resource', patchScope: 'graph-only' } },
      { id: 'server-validation', type: 'pipeline', position: { x: 2250, y: 220 }, data: { kind: 'validation', label: 'Validate recovery', description: 'Requires inventory=started, latency<50ms and no player disconnect spike before the incident is closed.', owner: 'Game Operations', status: 'draft', schema: [], rule: 'inventory=started AND latency_ms<50 AND disconnect_spike=false' } },
      { id: 'server-output', type: 'pipeline', position: { x: 2560, y: 220 }, data: { kind: 'output', label: 'Server recovery result', description: 'Publishes the reviewed incident result, telemetry evidence and rollback receipt.', owner: 'Game Operations', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'game-e-server-monitor', source: 'game-server', target: 'server-monitor', type: 'elastic' },
      { id: 'game-e-monitor-analysis', source: 'server-monitor', target: 'server-analysis', type: 'elastic' },
      { id: 'game-e-analysis-risk', source: 'server-analysis', target: 'server-risk', type: 'elastic' },
      { id: 'game-e-risk-decision', source: 'server-risk', target: 'server-decision', type: 'elastic' },
      { id: 'game-e-decision-review', source: 'server-decision', target: 'server-review', type: 'elastic' },
      { id: 'game-e-review-patch', source: 'server-review', target: 'server-patch', type: 'elastic' },
      { id: 'game-e-patch-validation', source: 'server-patch', target: 'server-validation', type: 'elastic' },
      { id: 'game-e-validation-output', source: 'server-validation', target: 'server-output', type: 'elastic' },
      { id: 'game-e-output-feedback', source: 'server-output', target: 'server-monitor', sourceHandle: 'feedback', type: 'elastic', label: 'next incident' },
    ],
  },
  'agent-arena': {
    title: 'Private agent driving evaluation',
    nodes: [
      {
        id: 'arena-server',
        type: 'pipeline',
        position: { x: 80, y: 220 },
        data: {
          kind: 'server',
          label: 'Agent Arena',
          description: 'Isolated FiveM evaluation shard with synthetic traffic and no public players.',
          owner: 'Game AI Team',
          status: 'healthy',
          schema: [],
          rule: 'transport=read_only | scope=private_server | isolation=required | commands=reviewed',
          serverTelemetry: { platform: 'FiveM', state: 'online', endpoint: 'arena.local:30121', playersOnline: 1, playerCapacity: 8, latencyMs: 14, cpuPercent: 31, memoryMb: 2780, resourcesRunning: 19, resourcesFailed: 0 },
        },
      },
      { id: 'arena-monitor', type: 'pipeline', position: { x: 390, y: 220 }, data: { kind: 'monitor', label: 'Observe mission telemetry', description: 'Starts a bounded evaluation only for a new replay fingerprint.', owner: 'GAME LAB Agent', status: 'healthy', schema: [], rule: 'on_change(metadata_fingerprint) | cooldown=30s | max_iterations=5 | alert=severity_increase', monitorMode: 'event-loop' } },
      {
        id: 'driving-agent',
        type: 'pipeline',
        position: { x: 700, y: 220 },
        data: {
          kind: 'agent',
          label: 'Driver 01',
          description: 'AI test player follows a fixed delivery route using allowlisted vehicle controls and an immediate emergency stop.',
          owner: 'Game AI Team',
          status: 'healthy',
          schema: [],
          rule: 'environment=private_server | observe=telemetry | act=allowlist | emergency_stop=required',
          agentTelemetry: { mode: 'test-player', state: 'acting', objective: 'Complete the Vespucci delivery route without collisions', safetyMode: 'private-server-only', confidence: 0.91, lastAction: 'brake_before_crosswalk' },
        },
      },
      { id: 'arena-analysis', type: 'pipeline', position: { x: 1010, y: 220 }, data: { kind: 'analysis', label: 'Score the replay', description: 'Scores route completion, collisions, traffic-rule violations and emergency-stop responsiveness.', owner: 'GAME LAB Agent', status: 'healthy', schema: [], rule: 'score=completion,collisions,violations,stop_latency | replay=required' } },
      { id: 'arena-risk', type: 'pipeline', position: { x: 1320, y: 220 }, data: { kind: 'risk', label: 'Agent action risk', description: 'A late braking event needs review before this policy can advance to a larger private evaluation shard.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'scope=driver_01 | risk_domain=reliability | risk_type=data | severity=medium | confidence=0.91 | evidence=fresh | affected_assets=1 | action=review_replay_then_tighten_braking_policy' } },
      { id: 'arena-review', type: 'pipeline', position: { x: 1630, y: 220 }, data: { kind: 'review', label: 'Review driving replay', description: 'A human checks the replay and either approves another private run or keeps the agent blocked.', owner: 'Safety Reviewer', status: 'draft', schema: [], rule: 'approve=next_private_run | reject=block_policy | evidence=replay' } },
      { id: 'arena-validation', type: 'pipeline', position: { x: 1940, y: 220 }, data: { kind: 'validation', label: 'Safety gate', description: 'Requires zero collisions, allowlisted actions and emergency-stop latency below 100 ms.', owner: 'Game AI Team', status: 'draft', schema: [], rule: 'collisions=0 AND actions=allowlisted AND emergency_stop_ms<100' } },
      { id: 'arena-output', type: 'pipeline', position: { x: 2250, y: 220 }, data: { kind: 'output', label: 'Agent evaluation result', description: 'Publishes the reviewed score, safety verdict and replay reference for the next private run.', owner: 'Game AI Team', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'arena-e-server-monitor', source: 'arena-server', target: 'arena-monitor', type: 'elastic' },
      { id: 'arena-e-monitor-agent', source: 'arena-monitor', target: 'driving-agent', type: 'elastic' },
      { id: 'arena-e-agent-analysis', source: 'driving-agent', target: 'arena-analysis', type: 'elastic' },
      { id: 'arena-e-analysis-risk', source: 'arena-analysis', target: 'arena-risk', type: 'elastic' },
      { id: 'arena-e-risk-review', source: 'arena-risk', target: 'arena-review', type: 'elastic' },
      { id: 'arena-e-review-validation', source: 'arena-review', target: 'arena-validation', type: 'elastic' },
      { id: 'arena-e-validation-output', source: 'arena-validation', target: 'arena-output', type: 'elastic' },
      { id: 'arena-e-output-feedback', source: 'arena-output', target: 'arena-monitor', sourceHandle: 'feedback', type: 'elastic', label: 'next replay' },
    ],
  },
  'pii-masking': {
    title: 'PII masking lab',
    nodes: [
      { id: 'pii-source', type: 'pipeline', position: { x: 100, y: 180 }, data: { kind: 'source', label: 'Synthetic customers', description: 'Public synthetic customer fixture with an intentionally exposed email field.', owner: 'Privacy Data', status: 'warning', schema: [{ name: 'customer_id', type: 'string' }, { name: 'email', type: 'string', tags: ['PII'] }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.synthetic_customers,PROD)', datahubTags: ['PII', 'SYNTHETIC'], datahubQuality: 'healthy', datahubFreshness: fresh } },
      { id: 'pii-output', type: 'pipeline', position: { x: 470, y: 180 }, data: { kind: 'output', label: 'Marketing audience', description: 'Intentionally unsafe direct output used to demonstrate the masking proposal.', owner: 'Growth Data', status: 'blocked', schema: [] } },
    ],
    edges: [{ id: 'e-pii-direct', source: 'pii-source', target: 'pii-output', type: 'elastic' }],
  },
  'schema-drift': {
    title: 'ML impact and schema drift',
    nodes: [
      { id: 'drift-source', type: 'pipeline', position: { x: 50, y: 180 }, data: { kind: 'source', label: 'Training customers v2', description: 'The synthetic training table changed customer_age from number to string.', owner: 'Customer Platform', status: 'warning', schema: [{ name: 'customer_id', type: 'string' }, { name: 'customer_age', type: 'string' }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.training_customers_v2,PROD)', datahubTags: ['SYNTHETIC', 'ML_TRAINING'], datahubQuality: 'healthy', datahubFreshness: fresh, datahubDownstream: [{ urn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.customer_features,PROD)', name: 'customer_features', sensitive: false }, { urn: 'urn:li:mlModel:(data_lab_demo,churn_prediction_v3,PROD)', name: 'churn_prediction_v3', sensitive: false }] } },
      { id: 'impact-lineage', type: 'pipeline', position: { x: 345, y: 180 }, data: { kind: 'impact', label: 'Trace ML lineage impact', description: 'Atomic, replayable analysis of training_customers_v2 → customer_features → age_bucket → churn_prediction_v3.', owner: 'GAME LAB Agent', status: 'warning', schema: [{ name: 'customer_id', type: 'string' }, { name: 'customer_age', type: 'string' }], rule: 'scope(customer_age type change) → rank affected features, pipelines, models and deployments → recommend actions' } },
      { id: 'risk-churn-model', type: 'pipeline', position: { x: 665, y: 180 }, data: { kind: 'risk', label: 'Assess churn model risk', description: 'Classifies the verified customer_age drift as a high ML risk across the feature table, age bucket and production model.', owner: 'GAME LAB Agent', status: 'blocked', schema: [], rule: 'scope=churn_prediction_v3 | risk_type=data | severity=high | confidence=0.93 | evidence=fresh | affected_assets=3 | action=repair_age_bucket_then_retrain' } },
      { id: 'drift-contract', type: 'pipeline', position: { x: 985, y: 180 }, data: { kind: 'validation', label: 'Feature schema contract', description: 'The feature pipeline still requires numeric customer_age.', owner: 'ML Platform', status: 'blocked', schema: [], rule: 'schema_contract: customer_id:string, customer_age:number' } },
      { id: 'drift-output', type: 'pipeline', position: { x: 1305, y: 180 }, data: { kind: 'output', label: 'churn_prediction_v3', description: 'Production model deployment at high risk until age_bucket is repaired and the model is retrained.', owner: 'ML Platform', status: 'blocked', schema: [] } },
    ],
    edges: [
      { id: 'e-drift-impact', source: 'drift-source', target: 'impact-lineage', type: 'elastic' },
      { id: 'e-impact-risk', source: 'impact-lineage', target: 'risk-churn-model', type: 'elastic' },
      { id: 'e-drift-contract', source: 'risk-churn-model', target: 'drift-contract', type: 'elastic' },
      { id: 'e-drift-output', source: 'drift-contract', target: 'drift-output', type: 'elastic' },
    ],
  },
  'broken-governance': {
    title: 'Ownership and quality lab',
    nodes: [
      { id: 'governance-source', type: 'pipeline', position: { x: 100, y: 180 }, data: { kind: 'source', label: 'Synthetic orders', description: 'Catalog fixture with no owner and a failing quality assertion.', owner: 'Unassigned', status: 'blocked', schema: [{ name: 'order_id', type: 'string' }, { name: 'amount', type: 'number' }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.synthetic_orders,PROD)', datahubTags: ['SYNTHETIC'], datahubQuality: 'failing', datahubFreshness: fresh } },
      { id: 'governance-output', type: 'pipeline', position: { x: 470, y: 180 }, data: { kind: 'output', label: 'Finance metrics', description: 'Publishing remains blocked until ownership and quality are repaired.', owner: 'Finance Analytics', status: 'blocked', schema: [] } },
    ],
    edges: [{ id: 'e-governance-output', source: 'governance-source', target: 'governance-output', type: 'elastic' }],
  },
  'license-reclamation': {
    title: 'Copilot license optimization',
    nodes: [
      { id: 'sam-license-source', type: 'pipeline', position: { x: 80, y: 210 }, data: { kind: 'source', label: 'Copilot license utilization', description: 'DataHub-backed product snapshot: 300 purchased, 250 assigned and 178 active seats. The source contains aggregates, not GitHub logins or prompts.', owner: 'Developer Platform', status: 'healthy', schema: [{ name: 'product', type: 'string' }, { name: 'purchased_seats', type: 'number' }, { name: 'assigned_seats', type: 'number' }, { name: 'active_seats', type: 'number' }, { name: 'inactive_60d_plus', type: 'number' }, { name: 'never_active', type: 'number' }, { name: 'annual_unit_cost', type: 'number' }, { name: 'annualized_active_gap', type: 'number' }, { name: 'renewal_date', type: 'timestamp' }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:postgres,sam-copilot-demo.sam_copilot.sam_mart.license_utilization,PROD)', datahubPlatform: 'postgres', datahubEnvironment: 'PROD', datahubDomain: 'Software Asset Management', datahubTags: ['SAM', 'SYNTHETIC', 'PSEUDONYMIZED', 'LICENSE_USAGE'], datahubQuality: 'healthy', datahubFreshness: fresh, datahubUpstream: [{ urn: 'urn:li:dataset:(urn:li:dataPlatform:postgres,sam-copilot-demo.sam_copilot.sam_mart.license_assignment_snapshot,PROD)', name: 'license_assignment_snapshot', sensitive: true }], datahubDownstream: [{ urn: 'urn:li:dataset:(urn:li:dataPlatform:postgres,sam-copilot-demo.sam_copilot.sam_mart.reclaim_candidates,PROD)', name: 'reclaim_candidates', sensitive: true }, { urn: 'urn:li:dataset:(urn:li:dataPlatform:postgres,sam-copilot-demo.sam_copilot.sam_mart.renewal_risk,PROD)', name: 'renewal_risk', sensitive: false }] } },
      { id: 'sam-normalize-assets', type: 'pipeline', position: { x: 390, y: 210 }, data: { kind: 'transform', label: 'Validate Copilot evidence', description: 'Checks the contract snapshot, pseudonymous seat keys, activity window and catalog lineage before analysis.', owner: 'GAME LAB Agent', status: 'healthy', schema: [], rule: 'require(contract + seat_assignments + usage_28d + owner + lineage)' } },
      { id: 'sam-usage-analysis', type: 'pipeline', position: { x: 700, y: 210 }, data: { kind: 'analysis', label: 'Find inactive Copilot seats', description: 'Identifies 42 seats inactive for at least 60 days or never used while keeping individual activity behind the review boundary.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'candidate=never_active OR days_since_last_activity>=60' } },
      { id: 'sam-cost-impact', type: 'pipeline', position: { x: 1010, y: 210 }, data: { kind: 'impact', label: 'Calculate Copilot savings', description: 'Values 41 eligible seats at USD 9,348 annually and separates one business-critical investigation.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'eligible_savings=sum(annual_unit_cost where candidate AND NOT critical_access)' } },
      { id: 'sam-reclaim-risk', type: 'pipeline', position: { x: 1320, y: 210 }, data: { kind: 'risk', label: 'Copilot reclamation risk', description: 'Prevents automatic removal and routes critical access, offboarding and ambiguous activity to the correct owner.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'scope=github_copilot_business | risk_domain=governance | risk_type=data | severity=medium | confidence=0.92 | evidence=fresh | affected_assets=42 | action=owner_review_then_reclaim' } },
      { id: 'sam-reclaim-review', type: 'pipeline', position: { x: 1630, y: 210 }, data: { kind: 'review', label: 'Approve Copilot reclamation', description: 'Developer Platform and team owners review the 42 pseudonymous candidates before any external action.', owner: 'Developer Platform', status: 'draft', schema: [], rule: 'approve=41_eligible_reclaims | investigate=1_critical_access | reject=retain_assignments' } },
      { id: 'sam-reclaim-output', type: 'pipeline', position: { x: 1940, y: 210 }, data: { kind: 'output', label: 'Copilot optimization report', description: 'Reviewed reclaim, retain and investigate decisions with a USD 9,348 annual savings target.', owner: 'SAM Team', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'sam-e-license-normalize', source: 'sam-license-source', target: 'sam-normalize-assets', type: 'elastic' },
      { id: 'sam-e-normalize-usage', source: 'sam-normalize-assets', target: 'sam-usage-analysis', type: 'elastic' },
      { id: 'sam-e-usage-impact', source: 'sam-usage-analysis', target: 'sam-cost-impact', type: 'elastic' },
      { id: 'sam-e-impact-risk', source: 'sam-cost-impact', target: 'sam-reclaim-risk', type: 'elastic' },
      { id: 'sam-e-risk-review', source: 'sam-reclaim-risk', target: 'sam-reclaim-review', type: 'elastic' },
      { id: 'sam-e-review-output', source: 'sam-reclaim-review', target: 'sam-reclaim-output', type: 'elastic' },
    ],
  },
  'compliance-exposure': {
    title: 'Entitlement compliance',
    nodes: [
      { id: 'sam-contract-source', type: 'pipeline', position: { x: 90, y: 220 }, data: { kind: 'source', label: 'Contracts and entitlements', description: 'Normalized purchase, assignment and entitlement evidence by software product.', owner: 'Procurement', status: 'healthy', schema: [{ name: 'product', type: 'string' }, { name: 'purchased_seats', type: 'number' }, { name: 'assigned_seats', type: 'number' }, { name: 'contract_end', type: 'timestamp' }] } },
      { id: 'sam-entitlement-analysis', type: 'pipeline', position: { x: 420, y: 220 }, data: { kind: 'analysis', label: 'Compare use to entitlement', description: 'Detects over-assignment, missing contracts and unapproved software records.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'compare(assignments, entitlements, approvals)' } },
      { id: 'sam-compliance-risk', type: 'pipeline', position: { x: 750, y: 220 }, data: { kind: 'risk', label: 'Compliance exposure', description: 'Ranks license and policy exposure using fresh contract evidence.', owner: 'GAME LAB Agent', status: 'blocked', schema: [], rule: 'scope=software_entitlements | risk_domain=governance | risk_type=data | severity=high | confidence=0.95 | evidence=fresh | affected_assets=2 | action=verify_contract_then_remediate' } },
      { id: 'sam-compliance-review', type: 'pipeline', position: { x: 1080, y: 220 }, data: { kind: 'review', label: 'Legal and procurement review', description: 'Approves remediation only after the source contract and ownership are confirmed.', owner: 'Legal & Procurement', status: 'draft', schema: [], rule: 'require=contract_and_owner_confirmation' } },
      { id: 'sam-compliance-output', type: 'pipeline', position: { x: 1410, y: 220 }, data: { kind: 'output', label: 'Compliance action register', description: 'Reviewed exceptions, evidence gaps and remediation owners.', owner: 'SAM Team', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'sam-e-contract-analysis', source: 'sam-contract-source', target: 'sam-entitlement-analysis', type: 'elastic' },
      { id: 'sam-e-analysis-compliance', source: 'sam-entitlement-analysis', target: 'sam-compliance-risk', type: 'elastic' },
      { id: 'sam-e-compliance-review', source: 'sam-compliance-risk', target: 'sam-compliance-review', type: 'elastic' },
      { id: 'sam-e-compliance-output', source: 'sam-compliance-review', target: 'sam-compliance-output', type: 'elastic' },
    ],
  },
  'renewal-optimization': {
    title: 'Renewal optimization',
    nodes: [
      { id: 'sam-renewal-source', type: 'pipeline', position: { x: 100, y: 220 }, data: { kind: 'source', label: 'Renewal calendar', description: 'Upcoming software renewals with contract value, owner and utilization evidence.', owner: 'Procurement', status: 'healthy', schema: [{ name: 'product', type: 'string' }, { name: 'renewal_date', type: 'timestamp' }, { name: 'annual_cost', type: 'number' }, { name: 'utilization_rate', type: 'number' }] } },
      { id: 'sam-renewal-impact', type: 'pipeline', position: { x: 430, y: 220 }, data: { kind: 'impact', label: 'Rank renewal exposure', description: 'Ranks near-term renewals by spend, utilization, dependency and evidence coverage.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'rank(days_to_renewal, annual_cost, utilization_rate, owner_criticality)' } },
      { id: 'sam-renewal-risk', type: 'pipeline', position: { x: 760, y: 220 }, data: { kind: 'risk', label: 'Renewal decision risk', description: 'Prevents autonomous cancellation when usage or ownership evidence is incomplete.', owner: 'GAME LAB Agent', status: 'warning', schema: [], rule: 'scope=renewals_next_90_days | risk_domain=governance | risk_type=data | severity=medium | confidence=0.88 | evidence=fresh | affected_assets=4 | action=collect_owner_intent_then_negotiate' } },
      { id: 'sam-renewal-review', type: 'pipeline', position: { x: 1090, y: 220 }, data: { kind: 'review', label: 'Approve renewal strategy', description: 'Owners approve renew, resize, negotiate or retire recommendations.', owner: 'Budget Owners', status: 'draft', schema: [], rule: 'approve=renewal_strategy | reject=retain_current_terms' } },
      { id: 'sam-renewal-output', type: 'pipeline', position: { x: 1420, y: 220 }, data: { kind: 'output', label: 'Renewal plan', description: 'Reviewed renewal decisions with savings targets and evidence gaps.', owner: 'Procurement', status: 'draft', schema: [] } },
    ],
    edges: [
      { id: 'sam-e-renewal-impact', source: 'sam-renewal-source', target: 'sam-renewal-impact', type: 'elastic' },
      { id: 'sam-e-renewal-risk', source: 'sam-renewal-impact', target: 'sam-renewal-risk', type: 'elastic' },
      { id: 'sam-e-renewal-review', source: 'sam-renewal-risk', target: 'sam-renewal-review', type: 'elastic' },
      { id: 'sam-e-renewal-output', source: 'sam-renewal-review', target: 'sam-renewal-output', type: 'elastic' },
    ],
  },
}
