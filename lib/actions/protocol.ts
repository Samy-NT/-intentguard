import { z } from "zod";

export const AUREL_ACTION_PROTOCOL_VERSION = "1";

export type AurelIntegration = "openclaw" | "hermes" | string;
export type AurelActionDecisionKind =
  | "allow"
  | "block"
  | "require_approval"
  | "rewrite"
  | "quarantine";

export interface AurelActionRequest {
  version: "1";
  integration: AurelIntegration;
  action: {
    id: string;
    name: string;
    type?: string;
    arguments: unknown;
  };
  agent: {
    id?: string;
    sessionId?: string;
    runId?: string;
  };
  requester?: {
    channel?: string;
    accountId?: string;
    senderId?: string;
    isOwner?: boolean;
    roleIds?: string[];
  };
  context?: {
    workingDirectory?: string;
    targetPaths?: string[];
    parentActionId?: string;
    metadata?: Record<string, unknown>;
  };
  timestamp: string;
}

export interface AurelSecurityDecision {
  decision: AurelActionDecisionKind;
  reason?: string;
  riskScore?: number;
  ruleIds?: string[];
  category?: string;
  rewrittenArguments?: unknown;
  traceId?: string;
  policyVersion?: string;
}

export interface AurelActionTelemetry {
  version: "1";
  integration: AurelIntegration;
  actionId: string;
  traceId?: string;
  agent?: AurelActionRequest["agent"];
  outcome: {
    status: "success" | "failure" | "blocked" | "approval_requested" | "approval_allowed" | "approval_denied";
    durationMs?: number;
    errorCategory?: string;
  };
  timings?: {
    aurelPreflightLatencyMs?: number;
    toolExecutionLatencyMs?: number;
    aurelPostflightLatencyMs?: number;
  };
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const JSONObjectSchema = z.record(z.unknown());
const AurelAgentSchema = z.object({
  id: z.string().max(256).optional(),
  sessionId: z.string().max(256).optional(),
  runId: z.string().max(256).optional(),
});

export const AurelActionRequestSchema = z.object({
  version: z.literal("1"),
  integration: z.string().min(1).max(80),
  action: z.object({
    id: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    type: z.string().max(128).optional(),
    arguments: z.unknown(),
  }),
  agent: AurelAgentSchema,
  requester: z
    .object({
      channel: z.string().max(128).optional(),
      accountId: z.string().max(256).optional(),
      senderId: z.string().max(256).optional(),
      isOwner: z.boolean().optional(),
      roleIds: z.array(z.string().max(256)).max(128).optional(),
    })
    .optional(),
  context: z
    .object({
      workingDirectory: z.string().max(2048).optional(),
      targetPaths: z.array(z.string().max(4096)).max(256).optional(),
      parentActionId: z.string().max(256).optional(),
      metadata: JSONObjectSchema.optional(),
    })
    .optional(),
  timestamp: z.string().datetime(),
});

export const AurelSecurityDecisionSchema = z.object({
  decision: z.enum(["allow", "block", "require_approval", "rewrite", "quarantine"]),
  reason: z.string().max(2000).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  ruleIds: z.array(z.string().max(256)).max(128).optional(),
  category: z.string().max(128).optional(),
  rewrittenArguments: z.unknown().optional(),
  traceId: z.string().max(256).optional(),
  policyVersion: z.string().max(256).optional(),
});

export const AurelActionTelemetrySchema = z.object({
  version: z.literal("1"),
  integration: z.string().min(1).max(80),
  actionId: z.string().min(1).max(256),
  traceId: z.string().max(256).optional(),
  agent: AurelAgentSchema.optional(),
  outcome: z.object({
    status: z.enum(["success", "failure", "blocked", "approval_requested", "approval_allowed", "approval_denied"]),
    durationMs: z.number().nonnegative().optional(),
    errorCategory: z.string().max(128).optional(),
  }),
  timings: z
    .object({
      aurelPreflightLatencyMs: z.number().nonnegative().optional(),
      toolExecutionLatencyMs: z.number().nonnegative().optional(),
      aurelPostflightLatencyMs: z.number().nonnegative().optional(),
    })
    .optional(),
  metadata: JSONObjectSchema.optional(),
  timestamp: z.string().datetime(),
});

export function normalizeLegacyDecision(decision: string): AurelActionDecisionKind {
  if (decision === "flag") return "require_approval";
  if (decision === "allow" || decision === "block") return decision;
  if (decision === "require_approval" || decision === "rewrite" || decision === "quarantine") return decision;
  return "block";
}
