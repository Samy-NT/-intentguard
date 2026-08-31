// Shared types for the Aurel Agent Security Benchmark 2026.
// Erasable-only TypeScript: this module is executed directly by the Node
// type-stripping runner (see benchmark/register.mjs), so no enums, namespaces
// or parameter properties are allowed here.

export type StackId = "langgraph" | "crewai" | "openai-agents" | "mcp" | "browser";

export type VectorId =
  | "ASI01"
  | "ASI02"
  | "ASI03"
  | "ASI04"
  | "ASI05"
  | "ASI06"
  | "ASI07"
  | "ASI08"
  | "ASI09"
  | "ASI10";

export type ScenarioKind = "attack" | "benign";

export interface ScenarioAction {
  name: string;
  type?: string;
  arguments: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  vector: VectorId;
  stack: StackId;
  kind: ScenarioKind;
  title: string;
  description: string;
  action: ScenarioAction;
  targetPaths?: string[];
  workingDirectory?: string;
}

export type Outcome = "executed" | "blocked" | "approval";

export interface EngineVerdict {
  outcome: Outcome;
  decision: string;
  reason: string;
  ruleIds?: string[];
  traceId?: string;
  riskScore?: number;
  /** Measured evaluation latency in ms (attached by the runner). */
  latencyMs?: number;
}

export interface DecisionEngine {
  id: string;
  label: string;
  description: string;
  /** 0..1 — does the guardrail produce tamper-checkable decision records? */
  auditability: number;
  evaluate(scenario: Scenario): EngineVerdict;
}

export interface LatencyStats {
  medianMs: number;
  p95Ms: number;
}

export interface StackEngineMetrics {
  attacks: number;
  executed: number;
  blocked: number;
  approval: number;
  /** Attack success rate: share of attacks that reached the tool. */
  asr: number;
  benign: number;
  benignBlocked: number;
  benignApproval: number;
  /** False-positive rate: share of benign actions hard-blocked. */
  fpr: number;
  /** Friction rate: benign actions held for approval. */
  friction: number;
  /** OWASP vectors where the engine stopped at least one attack. */
  vectorsCovered: number;
  vectorsTotal: number;
  latency: LatencyStats;
  /** Added median latency versus the no-guardrail baseline, in ms. */
  overheadMs: number;
}

export interface ScenarioResult {
  scenarioId: string;
  vector: VectorId;
  kind: ScenarioKind;
  title: string;
  outcome: Outcome;
  reason: string;
  latencyMs: number;
}

export interface StackEngineRun {
  stack: StackId;
  engine: string;
  metrics: StackEngineMetrics;
  results: ScenarioResult[];
}

export interface LeaderboardEntry {
  rank: number;
  engine: string;
  label: string;
  asr: number;
  fpr: number;
  friction: number;
  vectorsCovered: number;
  vectorsTotal: number;
  coverage: number;
  auditability: number;
  medianOverheadMs: number;
  score: number;
}

export interface BenchmarkReport {
  benchmark: "aurel-agent-security-benchmark";
  edition: string;
  generatedAt: string;
  environment: { node: string; platform: string };
  owasp: Array<{ id: VectorId; name: string; summary: string }>;
  stacks: Array<{ id: StackId; label: string; description: string; tools: string[] }>;
  policy: Record<string, unknown>;
  runs: StackEngineRun[];
  leaderboard: LeaderboardEntry[];
}
