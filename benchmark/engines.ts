// Decision engines under test. The "aurel" engine runs the real product code
// path (lib/actions/evaluate.ts) with the benchmark workspace policy — no
// network, no API key — so every run is reproducible offline.

import { evaluateAurelAction } from "@/lib/actions/evaluate";
import type { AurelActionRequest } from "@/lib/actions/protocol";
import type { AurelActionPolicy } from "@/lib/actions/evaluate";
import { BENCHMARK_POLICY, STACKS } from "./config.ts";
import type { DecisionEngine, EngineVerdict, Scenario } from "./types.ts";

// Fixed timestamp keeps AurelActionRequest payloads byte-identical across runs.
export const FIXED_TIMESTAMP = "2026-08-31T00:00:00.000Z";

export function toAurelRequest(scenario: Scenario): AurelActionRequest {
  return {
    version: "1",
    integration: `benchmark-${scenario.stack}`,
    action: {
      id: scenario.id,
      name: scenario.action.name,
      type: scenario.action.type,
      arguments: scenario.action.arguments,
    },
    agent: { id: `${scenario.stack}-agent`, runId: "bench-run-001" },
    context: {
      workingDirectory: scenario.workingDirectory ?? "/workspace",
      ...(scenario.targetPaths ? { targetPaths: scenario.targetPaths } : {}),
    },
    timestamp: FIXED_TIMESTAMP,
  };
}

// ─── Engine 1: no guardrail (baseline) ───────────────────────────────────────

const noGuardrail: DecisionEngine = {
  id: "no-guardrail",
  label: "No guardrail",
  description: "Baseline. Every tool call the agent decides on is executed as-is.",
  auditability: 0,
  evaluate(): EngineVerdict {
    return {
      outcome: "executed",
      decision: "allow",
      reason: "No guardrail configured — action passed straight to the tool.",
    };
  },
};

// ─── Engine 2: static tool allowlist ─────────────────────────────────────────

function staticAllowlist(): DecisionEngine {
  return {
    id: "static-allowlist",
    label: "Static tool allowlist",
    description:
      "Framework-level allowlist taken from each stack's quickstart docs. Checks tool names only — never arguments.",
    auditability: 0.2,
    evaluate(scenario: Scenario): EngineVerdict {
      const stack = STACKS.find((entry) => entry.id === scenario.stack);
      const allowed = stack?.allowlist ?? [];
      if (allowed.includes(scenario.action.name)) {
        return {
          outcome: "executed",
          decision: "allow",
          reason: `Tool "${scenario.action.name}" is on the stack allowlist.`,
        };
      }
      return {
        outcome: "blocked",
        decision: "block",
        reason: `Tool "${scenario.action.name}" is not on the stack allowlist.`,
      };
    },
  };
}

// ─── Engine 3: regex injection filter ────────────────────────────────────────

const INJECTION_REGEXES: RegExp[] = [
  /ignore (all )?previous/i,
  /disregard (all )?(previous|prior|above)/i,
  /system[- ]prompt/i,
  /prompt injection/i,
  /exfiltrate/i,
  /base64/i,
  /rm -rf/,
  /mkfs/,
  /curl http/i,
];

function regexFilter(): DecisionEngine {
  return {
    id: "regex-filter",
    label: "Regex injection filter",
    description:
      "The most common DIY mitigation: keyword regexes over tool arguments looking for prompt-injection phrases and dangerous shell commands.",
    auditability: 0.3,
    evaluate(scenario: Scenario): EngineVerdict {
      const haystack = JSON.stringify(scenario.action) ?? "";
      const matched = INJECTION_REGEXES.find((regex) => regex.test(haystack));
      if (matched) {
        return {
          outcome: "blocked",
          decision: "block",
          reason: `Arguments matched injection-filter pattern ${String(matched)}.`,
        };
      }
      return {
        outcome: "executed",
        decision: "allow",
        reason: "Arguments matched no injection-filter pattern.",
      };
    },
  };
}

// ─── Engine 4: Aurel (product engine) ────────────────────────────────────────

function aurel(policy: AurelActionPolicy): DecisionEngine {
  const workspacePolicy = { action_security: policy };
  return {
    id: "aurel",
    label: "Aurel (local policy engine)",
    description:
      "Aurel's action firewall running the real evaluation path: risk classification, closed tool policy, argument deny rules, path guards and approval gates — with a traceable decision record for every call.",
    auditability: 1,
    evaluate(scenario: Scenario): EngineVerdict {
      const { decision } = evaluateAurelAction(toAurelRequest(scenario), workspacePolicy);
      const outcome = decision.decision === "allow" ? "executed" : decision.decision === "block" ? "blocked" : "approval";
      return {
        outcome,
        decision: decision.decision,
        reason: decision.reason ?? "",
        ruleIds: decision.ruleIds,
        traceId: decision.traceId,
        riskScore: decision.riskScore,
      };
    },
  };
}

export function buildEngines(policy: AurelActionPolicy = BENCHMARK_POLICY): DecisionEngine[] {
  return [noGuardrail, staticAllowlist(), regexFilter(), aurel(policy)];
}
