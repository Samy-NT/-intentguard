import {
  AurelToolBlockedError,
  createAurelToolGuard,
  type AurelToolCall,
  type AurelToolGuardClient,
  type AurelToolGuardConfig,
} from "@/integrations/shared/typescript/aurel-tool-guard";

export interface OpenAIAgentsToolLike {
  name: string;
  execute?: (input: unknown, context?: unknown, details?: unknown) => Promise<unknown> | unknown;
  inputGuardrails?: unknown[];
  outputGuardrails?: unknown[];
  [key: string]: unknown;
}

export function withAurelOpenAIAgentsTool<T extends OpenAIAgentsToolLike>(
  tool: T,
  config: Omit<AurelToolGuardConfig, "integration"> = {},
  client?: AurelToolGuardClient
): T {
  if (typeof tool.execute !== "function") {
    throw new TypeError("OpenAI Agents SDK tool must expose an execute function");
  }
  const guard = createAurelToolGuard({ ...config, integration: "openai-agents", rewriteSupported: true }, client);
  const originalExecute = tool.execute.bind(tool);

  return {
    ...tool,
    async execute(input: unknown, context?: unknown, details?: unknown) {
      return guard.runProtected(
        {
          id: contextValue(details, "toolCallId") ?? contextValue(details, "tool_call_id") ?? contextValue(context, "toolCallId") ?? contextValue(context, "tool_call_id"),
          name: tool.name,
          arguments: input,
          agent: {
            id: contextValue(context, "agentId") ?? contextValue(context, "agent_name"),
            sessionId: contextValue(context, "sessionId"),
            runId: contextValue(context, "runId"),
          },
          context: { metadata: { sdk: "@openai/agents", toolCallId: contextValue(details, "toolCallId") } },
        },
        (args) => originalExecute(args, context, details)
      );
    },
  };
}

export function createAurelOpenAIToolInputGuardrail(
  toolName: string,
  config: Omit<AurelToolGuardConfig, "integration"> = {},
  client?: AurelToolGuardClient
) {
  const guard = createAurelToolGuard({ ...config, integration: "openai-agents", rewriteSupported: false }, client);
  return {
    name: "aurel-tool-input-guardrail",
    async execute(input: unknown, context?: unknown, details?: unknown) {
      const call: AurelToolCall = {
        id: contextValue(details, "toolCallId") ?? contextValue(details, "tool_call_id") ?? contextValue(context, "toolCallId") ?? contextValue(context, "tool_call_id"),
        name: toolName,
        arguments: input,
        agent: {
          id: contextValue(context, "agentId") ?? contextValue(context, "agent_name"),
          sessionId: contextValue(context, "sessionId"),
          runId: contextValue(context, "runId"),
        },
        context: { metadata: { sdk: "@openai/agents", guardrail: true, toolCallId: contextValue(details, "toolCallId") } },
      };
      const decision = await guard.preflight(call);
      if (decision.type === "allow") return { behavior: "allow" };
      void guard.postflight(decision.action, {
        status: decision.type === "require_approval" ? "approval_requested" : "blocked",
        preflightLatencyMs: decision.preflightLatencyMs,
        traceId: decision.decision?.traceId,
        args: input,
      }).catch((error) => {
        console.warn("[aurel-openai-agents] terminal telemetry failed:", error instanceof Error ? error.message : error);
      });
      return {
        behavior: "rejectContent",
        message:
          decision.type === "block"
            ? decision.message
            : "Aurel requires human approval before this action can run.",
      };
    },
  };
}

export { AurelToolBlockedError };

function contextValue(context: unknown, key: string): string | undefined {
  if (!context || typeof context !== "object") return undefined;
  const value = (context as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
