// Benchmark runner: evaluates the full scenario corpus through every decision
// engine, computes metrics, and writes results/latest.json (+ a dated copy).
//
// Run with: npm run benchmark
//   node --experimental-strip-types --import ./benchmark/register.mjs benchmark/run.ts

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildEngines } from "./engines.ts";
import { BENCHMARK_POLICY, OWASP_VECTORS, STACKS } from "./config.ts";
import { SCENARIOS, scenariosForStack } from "./scenarios.ts";
import { computeMetrics, leaderboardScore, toScenarioResults } from "./metrics.ts";
import type { BenchmarkReport, EngineVerdict, LeaderboardEntry, StackEngineRun } from "./types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = path.join(ROOT, "benchmark", "results");

function measureVerdict(
  _engineId: string,
  evaluate: (scenario: import("./types.ts").Scenario) => EngineVerdict,
  scenario: import("./types.ts").Scenario
): EngineVerdict {
  const started = performance.now();
  const verdict = evaluate(scenario);
  const elapsed = performance.now() - started;
  return { ...verdict, latencyMs: Math.max(0, Number(elapsed.toFixed(4))) };
}

async function main(): Promise<void> {
  const engines = buildEngines(BENCHMARK_POLICY);
  const runs: StackEngineRun[] = [];
  const baselineMedianByStack = new Map<string, number>();

  for (const stack of STACKS) {
    const scenarios = scenariosForStack(stack.id);

    for (const engine of engines) {
      const verdicts = new Map<string, EngineVerdict>();
      for (const scenario of scenarios) {
        verdicts.set(scenario.id, measureVerdict(engine.id, engine.evaluate, scenario));
      }

      const metrics = computeMetrics({
        engine,
        scenarios,
        verdicts,
        baselineMedianMs: baselineMedianByStack.get(stack.id) ?? 0,
      });

      if (engine.id === "no-guardrail") {
        baselineMedianByStack.set(stack.id, metrics.latency.medianMs);
      }

      runs.push({ stack: stack.id, engine: engine.id, metrics, results: toScenarioResults(scenarios, verdicts) });
    }
  }

  const leaderboard: LeaderboardEntry[] = engines
    .map((engine) => {
      const engineRuns = runs.filter((run) => run.engine === engine.id);
      const totals = engineRuns.reduce(
        (acc, run) => ({
          attacks: acc.attacks + run.metrics.attacks,
          executed: acc.executed + run.metrics.executed,
          benign: acc.benign + run.metrics.benign,
          benignBlocked: acc.benignBlocked + run.metrics.benignBlocked,
          benignApproval: acc.benignApproval + run.metrics.benignApproval,
          overheadSum: acc.overheadSum + run.metrics.overheadMs,
        }),
        { attacks: 0, executed: 0, benign: 0, benignBlocked: 0, benignApproval: 0, overheadSum: 0 }
      );
      const vectorsCovered = new Set(
        engineRuns.flatMap((run) =>
          run.results.filter((result) => result.kind === "attack" && result.outcome !== "executed").map((result) => result.vector)
        )
      ).size;
      const aggregate = {
        asr: totals.attacks > 0 ? totals.executed / totals.attacks : 0,
        fpr: totals.benign > 0 ? totals.benignBlocked / totals.benign : 0,
        friction: totals.benign > 0 ? totals.benignApproval / totals.benign : 0,
        vectorsCovered,
        vectorsTotal: OWASP_VECTORS.length,
        auditability: engine.auditability,
      };
      return {
        engine: engine.id,
        label: engine.label,
        ...aggregate,
        coverage: aggregate.vectorsCovered / OWASP_VECTORS.length,
        medianOverheadMs: Number(
          (totals.overheadSum / Math.max(1, engineRuns.length)).toFixed(2)
        ),
        score: leaderboardScore(aggregate),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  const generatedAt = new Date().toISOString();
  const report: BenchmarkReport = {
    benchmark: "aurel-agent-security-benchmark",
    edition: "2026.08",
    generatedAt,
    environment: { node: process.version, platform: process.platform },
    owasp: OWASP_VECTORS,
    stacks: STACKS.map((stack) => ({
      id: stack.id,
      label: stack.label,
      description: stack.description,
      tools: [...new Set(scenariosForStack(stack.id).map((scenario) => scenario.action.name))],
    })),
    policy: BENCHMARK_POLICY as unknown as Record<string, unknown>,
    runs,
    leaderboard,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const latestPath = path.join(RESULTS_DIR, "latest.json");
  const datedPath = path.join(RESULTS_DIR, `${report.edition}-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}.json`);
  await writeFile(latestPath, JSON.stringify(report, null, 2) + "\n");
  await writeFile(datedPath, JSON.stringify(report, null, 2) + "\n");

  // Human-readable summary
  console.log(`\nAurel Agent Security Benchmark ${report.edition}`);
  console.log(`${SCENARIOS.length} scenarios × ${engines.length} engines × ${STACKS.length} stacks\n`);
  for (const entry of leaderboard) {
    console.log(
      `#${entry.rank} ${entry.label.padEnd(28)} ASR ${(entry.asr * 100).toFixed(1)}%  FPR ${(entry.fpr * 100).toFixed(1)}%  coverage ${entry.vectorsCovered}/10  score ${entry.score}`
    );
  }
  console.log(`\nResults written to benchmark/results/latest.json`);
  console.log(`Dated copy written to benchmark/results/${path.basename(datedPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
