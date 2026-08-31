import { describe, expect, it } from "vitest";
import { buildEngines } from "../benchmark/engines.ts";
import { BENCHMARK_POLICY, OWASP_VECTORS, STACKS, VECTOR_IDS } from "../benchmark/config.ts";
import { SCENARIOS, scenariosForStack } from "../benchmark/scenarios.ts";
import { computeMetrics, leaderboardScore } from "../benchmark/metrics.ts";
import latest from "../benchmark/results/latest.json";
import ollamaE2E from "../benchmark/results/ollama-e2e-latest.json";

function runAll(engineId: string) {
  const engine = buildEngines().find((entry) => entry.id === engineId);
  if (!engine) throw new Error(`Unknown engine ${engineId}`);
  const verdicts = new Map();
  for (const scenario of SCENARIOS) verdicts.set(scenario.id, engine.evaluate(scenario));
  return { engine, verdicts };
}

describe("benchmark corpus", () => {
  it("has unique scenario ids", () => {
    const ids = SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all ten OWASP agentic vectors with at least one attack", () => {
    for (const vector of VECTOR_IDS) {
      const attacks = SCENARIOS.filter((scenario) => scenario.kind === "attack" && scenario.vector === vector);
      expect(attacks.length, `no attack scenario for ${vector}`).toBeGreaterThan(0);
    }
  });

  it("covers every vector in the OWASP mapping table", () => {
    expect(OWASP_VECTORS.map((vector) => vector.id).sort()).toEqual([...VECTOR_IDS].sort());
  });

  it("has attacks and benign controls on every stack", () => {
    for (const stack of STACKS) {
      const scenarios = scenariosForStack(stack.id);
      expect(scenarios.some((scenario) => scenario.kind === "attack"), stack.id).toBe(true);
      expect(scenarios.some((scenario) => scenario.kind === "benign"), stack.id).toBe(true);
    }
  });
});

describe("decision engines", () => {
  it("no-guardrail baseline executes every attack", () => {
    const { verdicts } = runAll("no-guardrail");
    const attacks = SCENARIOS.filter((scenario) => scenario.kind === "attack");
    expect(attacks.every((scenario) => verdicts.get(scenario.id).outcome === "executed")).toBe(true);
  });

  it("static allowlist only checks tool names, so argument-level attacks pass", () => {
    const { verdicts } = runAll("static-allowlist");
    const executed = SCENARIOS.filter(
      (scenario) => scenario.kind === "attack" && verdicts.get(scenario.id).outcome === "executed"
    );
    expect(executed.length).toBeGreaterThan(0);
  });

  it("regex filter misses most argument-level attacks and blocks benign work", () => {
    const { verdicts } = runAll("regex-filter");
    const attacks = SCENARIOS.filter((scenario) => scenario.kind === "attack");
    const benign = SCENARIOS.filter((scenario) => scenario.kind === "benign");
    const asr = attacks.filter((scenario) => verdicts.get(scenario.id).outcome === "executed").length / attacks.length;
    const fpr = benign.filter((scenario) => verdicts.get(scenario.id).outcome === "blocked").length / benign.length;
    expect(asr).toBeGreaterThan(0.5);
    expect(fpr).toBeGreaterThan(0);
  });

  it("aurel stops every attack (blocked or approval) and blocks zero benign actions", () => {
    const { engine, verdicts } = runAll("aurel");
    for (const scenario of SCENARIOS.filter((entry) => entry.kind === "attack")) {
      const verdict = verdicts.get(scenario.id);
      expect(verdict.outcome, `${scenario.id}: ${verdict.reason}`).not.toBe("executed");
      expect(verdict.traceId, `${scenario.id} should carry a trace id`).toBeTruthy();
    }
    for (const scenario of SCENARIOS.filter((entry) => entry.kind === "benign")) {
      expect(verdicts.get(scenario.id).outcome, `${scenario.id} should not be blocked`).not.toBe("blocked");
    }
    expect(engine.auditability).toBe(1);
  });

  it("aurel produces blocked and approval-required verdicts (privilege reduction, not only blocks)", () => {
    const { verdicts } = runAll("aurel");
    const outcomes = SCENARIOS.filter((scenario) => scenario.kind === "attack").map(
      (scenario) => verdicts.get(scenario.id).outcome
    );
    expect(outcomes).toContain("blocked");
    expect(outcomes).toContain("approval");
  });
});

describe("metrics", () => {
  it("computes ASR, FPR and coverage as designed", () => {
    const { engine, verdicts } = runAll("aurel");
    const metrics = computeMetrics({
      engine,
      scenarios: SCENARIOS,
      verdicts,
      baselineMedianMs: 0,
    });
    expect(metrics.attacks).toBe(17);
    expect(metrics.benign).toBe(14);
    expect(metrics.asr).toBe(0);
    expect(metrics.fpr).toBe(0);
    expect(metrics.vectorsCovered).toBe(10);
    expect(metrics.blocked + metrics.approval).toBe(17);
  });

  it("reports zero latency overhead for the no-guardrail baseline", () => {
    const { engine, verdicts } = runAll("no-guardrail");
    for (const scenario of SCENARIOS) verdicts.set(scenario.id, { ...verdicts.get(scenario.id), latencyMs: 0.01 });
    const metrics = computeMetrics({
      engine,
      scenarios: SCENARIOS,
      verdicts,
      baselineMedianMs: 0,
    });
    expect(metrics.overheadMs).toBe(0);
  });

  it("ranks engines by weighted score with a full-spread ordering", () => {
    const score = leaderboardScore({ asr: 0, fpr: 0, friction: 0, vectorsCovered: 10, vectorsTotal: 10, auditability: 1 });
    expect(score).toBe(100);
    const worst = leaderboardScore({ asr: 1, fpr: 1, friction: 1, vectorsCovered: 0, vectorsTotal: 10, auditability: 0 });
    expect(worst).toBe(0);
  });
});

describe("published results", () => {
  it("matches the committed leaderboard shape and edition", () => {
    expect(latest.benchmark).toBe("aurel-agent-security-benchmark");
    expect(latest.leaderboard[0].engine).toBe("aurel");
    expect(latest.leaderboard[0].asr).toBe(0);
    expect(latest.leaderboard[0].fpr).toBe(0);
    expect(latest.runs.length).toBe(STACKS.length * 4);
    expect(latest.runs.filter((run) => run.engine === "no-guardrail").every((run) => run.metrics.overheadMs === 0)).toBe(true);
    for (const run of latest.runs) {
      expect(run.results.length).toBe(scenariosForStack(run.stack).length);
    }
  });

  it("uses the published benchmark policy", () => {
    expect(latest.policy.policy_version).toBe(BENCHMARK_POLICY.policy_version);
  });

  it("includes model-driven Ollama E2E results when generated", () => {
    expect(ollamaE2E.benchmark).toBe("aurel-agent-security-benchmark-ollama-e2e");
    expect(ollamaE2E.scenarios.filter((scenario) => scenario.kind === "attack").length).toBe(10);
    expect(ollamaE2E.scenarios.filter((scenario) => scenario.kind === "benign").length).toBe(5);
    expect(ollamaE2E.modelsRun.length).toBeGreaterThanOrEqual(1);
    for (const summary of ollamaE2E.summaries) {
      expect(summary.attackSuccessRateWithAurel).toBeLessThanOrEqual(summary.attackSuccessRateWithoutAurel);
      expect(summary.benignFalsePositiveRateWithAurel).toBe(0);
    }
  });
});
