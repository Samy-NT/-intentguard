import type { WorkspacePolicy } from "@/lib/policies/evaluate";
import type { AurelActionRequest, AurelSecurityDecision, AurelActionDecisionKind } from "@/lib/actions/protocol";
import { classifyActionRisk, type LocalRiskClassification } from "@/lib/actions/risk";

export interface AurelActionPolicy {
  default_decision?: "allow" | "require_approval" | "block";
  allowed_tools?: string[];
  blocked_tools?: string[];
  approval_required_tools?: string[];
  strict_tools?: boolean;
  high_risk?: "allow" | "require_approval" | "block";
  medium_risk?: "allow" | "require_approval" | "block";
  blocked_argument_patterns?: string[];
  approval_argument_patterns?: string[];
  blocked_paths?: string[];
  approval_paths?: string[];
  max_risk_score?: number;
  policy_version?: string;
}

const MAX_PATTERN_LENGTH = 512;
const MAX_POLICY_PATTERNS = 128;
const MAX_PATTERN_INPUT_LENGTH = 16_384;

export interface AurelActionEvaluation {
  decision: AurelSecurityDecision;
  risk: LocalRiskClassification;
}

export function evaluateAurelAction(
  action: AurelActionRequest,
  workspacePolicy?: WorkspacePolicy | null,
  traceId = crypto.randomUUID()
): AurelActionEvaluation {
  const risk = classifyActionRisk(action);
  const policy = workspacePolicy?.action_security;
  const decision = evaluateConfiguredPolicy(action, risk, policy, traceId) ?? evaluateDefaultPolicy(action, risk, traceId);
  return { decision, risk };
}

function evaluateConfiguredPolicy(
  action: AurelActionRequest,
  risk: LocalRiskClassification,
  policy: AurelActionPolicy | undefined,
  traceId: string
): AurelSecurityDecision | null {
  if (!policy) return null;
  const tool = action.action.name;

  if (matchesAny(tool, policy.blocked_tools)) {
    return decision("block", "Action tool is blocked by workspace policy", 100, ["action.blocked_tool"], "tool", traceId, policy);
  }

  if (policy.strict_tools && !matchesAny(tool, policy.allowed_tools)) {
    return decision("block", "Action tool is outside the workspace allowlist", 95, ["action.strict_tools"], "tool", traceId, policy);
  }

  const paths = action.context?.targetPaths ?? [];
  if (paths.some((path) => matchesAny(path, policy.blocked_paths))) {
    return decision("block", "Action targets a blocked path", 95, ["action.blocked_path"], "path", traceId, policy);
  }

  const args = boundedJson(action.action.arguments);
  if (matchesAny(args, policy.blocked_argument_patterns)) {
    return decision("block", "Action arguments match a blocked policy pattern", 95, ["action.blocked_arguments"], "arguments", traceId, policy);
  }

  if (typeof policy.max_risk_score === "number" && risk.score > policy.max_risk_score) {
    return decision("block", "Action risk exceeds workspace policy threshold", risk.score, ["action.max_risk_score"], risk.category, traceId, policy);
  }

  if (matchesAny(tool, policy.approval_required_tools)) {
    return decision("require_approval", "Action tool requires approval by workspace policy", Math.max(risk.score, 60), ["action.approval_tool"], "tool", traceId, policy);
  }

  if (paths.some((path) => matchesAny(path, policy.approval_paths))) {
    return decision("require_approval", "Action targets a path that requires approval", Math.max(risk.score, 60), ["action.approval_path"], "path", traceId, policy);
  }

  if (matchesAny(args, policy.approval_argument_patterns)) {
    return decision("require_approval", "Action arguments require approval by workspace policy", Math.max(risk.score, 60), ["action.approval_arguments"], "arguments", traceId, policy);
  }

  const riskPolicy = risk.category === "high" ? policy.high_risk : risk.category === "medium" ? policy.medium_risk : undefined;
  if (riskPolicy && riskPolicy !== "allow") {
    return decision(riskPolicy, "Action risk category matched workspace policy", risk.score, [`action.${risk.category}_risk`], risk.category, traceId, policy);
  }

  if (policy.default_decision && policy.default_decision !== "allow") {
    return decision(policy.default_decision, "Workspace action policy requires additional control", risk.score, ["action.default"], risk.category, traceId, policy);
  }

  return {
    decision: "allow",
    reason: "Action allowed by workspace policy",
    riskScore: risk.score,
    ruleIds: risk.matched.length ? [`risk.${risk.category}`] : undefined,
    category: risk.category === "low" ? undefined : risk.category,
    traceId,
    policyVersion: policy.policy_version,
  };
}

function evaluateDefaultPolicy(
  _action: AurelActionRequest,
  risk: LocalRiskClassification,
  traceId: string
): AurelSecurityDecision {
  if (risk.category === "high") {
    return {
      decision: "require_approval",
      reason: "High-risk action requires approval by default",
      riskScore: risk.score,
      ruleIds: ["action.high_risk_default"],
      category: "high",
      traceId,
    };
  }

  return {
    decision: "allow",
    reason: "Action allowed by default policy",
    riskScore: risk.score,
    ruleIds: risk.matched.length ? [`risk.${risk.category}`] : undefined,
    category: risk.category === "low" ? undefined : risk.category,
    traceId,
  };
}

function decision(
  kind: AurelActionDecisionKind,
  reason: string,
  riskScore: number,
  ruleIds: string[],
  category: string,
  traceId: string,
  policy?: AurelActionPolicy
): AurelSecurityDecision {
  return {
    decision: kind,
    reason,
    riskScore,
    ruleIds,
    category,
    traceId,
    policyVersion: policy?.policy_version,
  };
}

function matchesAny(value: string, patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  const boundedValue = value.slice(0, MAX_PATTERN_INPUT_LENGTH);
  return patterns.slice(0, MAX_POLICY_PATTERNS).some((pattern) => matchesPattern(boundedValue, pattern));
}

function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const lastSlash = pattern.lastIndexOf("/");
    const source = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1).replace(/[^imsu]/g, "");
    if (isUnsafeRegexSource(source)) return false;
    try {
      return new RegExp(source, flags).test(value);
    } catch {
      return false;
    }
  }
  return value.toLowerCase().includes(pattern.toLowerCase());
}

function isUnsafeRegexSource(source: string): boolean {
  if (source.length > MAX_PATTERN_LENGTH) return true;
  if (/\\[1-9]/.test(source)) return true;
  if (/\(\?<[!=]/.test(source)) return true;
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)(?:[+*?]|\{\d+,?\d*\})/.test(source)) return true;
  if (/(?:\.\*|\.\+).*(?:\.\*|\.\+)/.test(source)) return true;
  return false;
}

function boundedJson(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, MAX_PATTERN_INPUT_LENGTH) ?? "";
  } catch {
    return "";
  }
}
