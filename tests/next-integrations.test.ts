import { describe, expect, it, vi } from "vitest";
import { withAurelOpenAIAgentsTool, createAurelOpenAIToolInputGuardrail } from "@/integrations/openai-agents/src";
import { wrapLangGraphTool } from "@/integrations/langgraph/src";
import { AurelToolBlockedError, type AurelToolGuardClient } from "@/integrations/shared/typescript/aurel-tool-guard";
import type { AurelActionTelemetry, AurelSecurityDecision } from "@/lib/sdk";

function client(decisions: AurelSecurityDecision[]): AurelToolGuardClient & { telemetry: AurelActionTelemetry[] } {
  const telemetry: AurelActionTelemetry[] = [];
  return {
    telemetry,
    evaluateAction: vi.fn(async () => decisions.shift() ?? ({ decision: "allow" } satisfies AurelSecurityDecision)),
    recordActionTelemetry: vi.fn(async (entry) => {
      telemetry.push(entry);
    }),
  };
}

describe("next framework integrations", () => {
  it("wraps OpenAI Agents SDK tools before execution", async () => {
    const c = client([{ decision: "allow", traceId: "trace-openai" }]);
    const tool = withAurelOpenAIAgentsTool(
      {
        name: "terminal",
        execute: vi.fn(async (input) => `ran ${(input as { command: string }).command}`),
      },
      { apiKey: "test", apiUrl: "https://aurel.test" },
      c
    );
    await expect(tool.execute?.({ command: "pwd" })).resolves.toBe("ran pwd");
    expect(c.evaluateAction).toHaveBeenCalledWith(expect.objectContaining({ integration: "openai-agents" }), undefined);
  });

  it("blocks OpenAI Agents SDK tools before execution", async () => {
    const c = client([{ decision: "block", traceId: "trace-block" }]);
    const execute = vi.fn();
    const tool = withAurelOpenAIAgentsTool({ name: "terminal", execute }, { apiKey: "test", apiUrl: "https://aurel.test" }, c);
    await expect(tool.execute?.({ command: "rm -rf important-directory" })).rejects.toBeInstanceOf(AurelToolBlockedError);
    expect(execute).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-block",
      outcome: { status: "blocked" },
    });
  });

  it("exposes OpenAI Agents SDK input guardrail behavior", async () => {
    const c = client([{ decision: "block", traceId: "trace-guardrail" }]);
    const guardrail = createAurelOpenAIToolInputGuardrail("send_email", { apiKey: "test", apiUrl: "https://aurel.test" }, c);
    await expect(guardrail.execute({ to: "x@example.com" })).resolves.toMatchObject({
      behavior: "rejectContent",
    });
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-guardrail",
      outcome: { status: "blocked" },
      metadata: { tool: "send_email" },
    });
  });

  it("records approval-request telemetry for OpenAI Agents SDK wrappers without native approval", async () => {
    const c = client([{ decision: "require_approval", traceId: "trace-wrapper-approval", riskScore: 72 }]);
    const execute = vi.fn();
    const tool = withAurelOpenAIAgentsTool({ name: "send_email", execute }, { apiKey: "test", apiUrl: "https://aurel.test" }, c);

    await expect(tool.execute?.({ to: "finance@example.com", token: "secret" })).rejects.toBeInstanceOf(AurelToolBlockedError);
    expect(execute).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-wrapper-approval",
      outcome: { status: "approval_requested" },
      metadata: {
        tool: "send_email",
        args: { to: "finance@example.com", token: "[REDACTED]" },
      },
    });
  });

  it("records approval-request telemetry for OpenAI input guardrails", async () => {
    const c = client([{ decision: "require_approval", traceId: "trace-guardrail-approval" }]);
    const guardrail = createAurelOpenAIToolInputGuardrail("send_email", { apiKey: "test", apiUrl: "https://aurel.test" }, c);

    await expect(guardrail.execute({ to: "finance@example.com" })).resolves.toMatchObject({
      behavior: "rejectContent",
    });
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-guardrail-approval",
      outcome: { status: "approval_requested" },
      metadata: { tool: "send_email" },
    });
  });

  it("wraps LangGraph tools before ToolNode execution", async () => {
    const c = client([{ decision: "rewrite", rewrittenArguments: { command: "pwd" }, traceId: "trace-langgraph" }]);
    const tool = wrapLangGraphTool(
      {
        name: "terminal",
        invoke: vi.fn(async (input) => (input as { command: string }).command),
      },
      { apiKey: "test", apiUrl: "https://aurel.test" },
      c
    );
    await expect(tool.invoke?.({ command: "rewrite-me" })).resolves.toBe("pwd");
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-langgraph",
      metadata: {
        args: { command: "pwd" },
        originalArgs: { command: "rewrite-me" },
        rewriteApplied: true,
      },
    });
  });

  it("redacts shared wrapper telemetry", async () => {
    const c = client([{ decision: "allow", traceId: "trace-redact" }]);
    const tool = withAurelOpenAIAgentsTool(
      {
        name: "terminal",
        execute: vi.fn(async (input: unknown) => {
          void input;
          return "ok";
        }),
      },
      { apiKey: "test", apiUrl: "https://aurel.test", includeResults: true },
      c
    );
    await tool.execute?.({ command: "echo ok", authorization: "Bearer secret" });
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-redact",
      metadata: {
        args: { command: "echo ok", authorization: "[REDACTED]" },
        result: "ok",
      },
    });
  });

  it("preserves repeated non-circular references in shared wrapper telemetry", async () => {
    const c = client([{ decision: "allow", traceId: "trace-repeated-telemetry" }]);
    const shared = { path: "README.md" };
    const tool = withAurelOpenAIAgentsTool(
      {
        name: "read_file",
        execute: vi.fn(async (input: unknown) => input),
      },
      { apiKey: "test", apiUrl: "https://aurel.test" },
      c
    );
    await tool.execute?.({ first: shared, second: shared });
    await Promise.resolve();

    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-repeated-telemetry",
      metadata: {
        args: {
          first: { path: "README.md" },
          second: { path: "README.md" },
        },
      },
    });
  });

  it("records shared wrapper timing metadata", async () => {
    const c = client([{ decision: "allow", traceId: "trace-timing" }]);
    const tool = withAurelOpenAIAgentsTool(
      {
        name: "terminal",
        execute: vi.fn(async (input: unknown) => {
          void input;
          return "ok";
        }),
      },
      { apiKey: "test", apiUrl: "https://aurel.test" },
      c
    );
    await tool.execute?.({ command: "pwd" });
    await Promise.resolve();
    expect(c.telemetry[0].timings).toEqual(
      expect.objectContaining({
        aurelPreflightLatencyMs: expect.any(Number),
        aurelPostflightLatencyMs: expect.any(Number),
      })
    );
  });

  it("does not leak unhandled rejections when shared wrapper telemetry fails", async () => {
    const c = client([{ decision: "block", traceId: "trace-telemetry-fail" }]);
    vi.mocked(c.recordActionTelemetry).mockRejectedValueOnce(new Error("telemetry down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tool = withAurelOpenAIAgentsTool({ name: "terminal", execute: vi.fn() }, { apiKey: "test", apiUrl: "https://aurel.test" }, c);

    try {
      await expect(tool.execute?.({ command: "rm -rf important-directory" })).rejects.toBeInstanceOf(AurelToolBlockedError);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(warn).toHaveBeenCalledWith("[aurel] postflight telemetry failed:", "telemetry down");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not leak unhandled rejections when OpenAI input guardrail telemetry fails", async () => {
    const c = client([{ decision: "block", traceId: "trace-guardrail-telemetry-fail" }]);
    vi.mocked(c.recordActionTelemetry).mockRejectedValueOnce(new Error("telemetry down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const guardrail = createAurelOpenAIToolInputGuardrail("terminal", { apiKey: "test", apiUrl: "https://aurel.test" }, c);

    try {
      await expect(guardrail.execute({ command: "rm -rf important-directory" })).resolves.toMatchObject({
        behavior: "rejectContent",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(warn).toHaveBeenCalledWith("[aurel-openai-agents] terminal telemetry failed:", "telemetry down");
    } finally {
      warn.mockRestore();
    }
  });

  it("clamps shared wrapper payload limits to keep telemetry bounded", async () => {
    const c = client([{ decision: "allow", traceId: "trace-bounds" }]);
    const tool = withAurelOpenAIAgentsTool(
      {
        name: "terminal",
        execute: vi.fn(async (input: unknown) => {
          void input;
          return "ok";
        }),
      },
      { apiKey: "test", apiUrl: "https://aurel.test", maxPayloadBytes: 0 },
      c
    );
    await tool.execute?.({ command: "x".repeat(5000) });
    await Promise.resolve();
    expect(c.telemetry[0].metadata?.args).toMatchObject({
      truncated: true,
      reason: "payload_limit",
    });
  });

  it("does not evaluate or report telemetry for excluded shared-wrapper tools", async () => {
    const c = client([{ decision: "block", traceId: "trace-excluded" }]);
    const tool = wrapLangGraphTool(
      {
        name: "read_file",
        invoke: vi.fn(async (input) => (input as { path: string }).path),
      },
      { apiKey: "test", apiUrl: "https://aurel.test", tools: { exclude: ["read_file"] } },
      c
    );

    await expect(tool.invoke?.({ path: "README.md" })).resolves.toBe("README.md");
    expect(c.evaluateAction).not.toHaveBeenCalled();
    expect(c.recordActionTelemetry).not.toHaveBeenCalled();
  });

  it("honors shared-wrapper include and exclude environment lists", async () => {
    const previousInclude = process.env.AUREL_TOOLS_INCLUDE;
    const previousExclude = process.env.AUREL_TOOLS_EXCLUDE;
    process.env.AUREL_TOOLS_INCLUDE = "terminal,send_email";
    process.env.AUREL_TOOLS_EXCLUDE = "send_email";
    const c = client([{ decision: "block", traceId: "trace-env-filters" }]);
    try {
      const readTool = wrapLangGraphTool(
        {
          name: "read_file",
          invoke: vi.fn(async (input) => (input as { path: string }).path),
        },
        { apiKey: "test", apiUrl: "https://aurel.test" },
        c
      );
      const emailTool = wrapLangGraphTool(
        {
          name: "send_email",
          invoke: vi.fn(async (input) => (input as { to: string }).to),
        },
        { apiKey: "test", apiUrl: "https://aurel.test" },
        c
      );
      const terminalTool = wrapLangGraphTool(
        {
          name: "terminal",
          invoke: vi.fn(async (input) => (input as { command: string }).command),
        },
        { apiKey: "test", apiUrl: "https://aurel.test" },
        c
      );

      await expect(readTool.invoke?.({ path: "README.md" })).resolves.toBe("README.md");
      await expect(emailTool.invoke?.({ to: "finance@example.com" })).resolves.toBe("finance@example.com");
      await expect(terminalTool.invoke?.({ command: "pwd" })).rejects.toBeInstanceOf(AurelToolBlockedError);
      expect(c.evaluateAction).toHaveBeenCalledTimes(1);
    } finally {
      if (previousInclude === undefined) {
        delete process.env.AUREL_TOOLS_INCLUDE;
      } else {
        process.env.AUREL_TOOLS_INCLUDE = previousInclude;
      }
      if (previousExclude === undefined) {
        delete process.env.AUREL_TOOLS_EXCLUDE;
      } else {
        process.env.AUREL_TOOLS_EXCLUDE = previousExclude;
      }
    }
  });

  it("does not evaluate or report telemetry when shared wrapper protection is disabled", async () => {
    const c = client([{ decision: "block", traceId: "trace-disabled" }]);
    const tool = wrapLangGraphTool(
      {
        name: "terminal",
        invoke: vi.fn(async (input) => (input as { command: string }).command),
      },
      { apiKey: "test", apiUrl: "https://aurel.test", enabled: false },
      c
    );

    await expect(tool.invoke?.({ command: "pwd" })).resolves.toBe("pwd");
    expect(c.evaluateAction).not.toHaveBeenCalled();
    expect(c.recordActionTelemetry).not.toHaveBeenCalled();
  });

  it("blocks privileged shared-wrapper actions on fail-open Aurel outages by default", async () => {
    const c: AurelToolGuardClient = {
      evaluateAction: vi.fn(async () => {
        throw new Error("down");
      }),
      recordActionTelemetry: vi.fn(async () => undefined),
    };
    const execute = vi.fn();
    const tool = withAurelOpenAIAgentsTool({ name: "terminal", execute }, { apiKey: "test", apiUrl: "https://aurel.test", failMode: "open" }, c);

    await expect(tool.execute?.({ command: "pwd" })).rejects.toBeInstanceOf(AurelToolBlockedError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows low-risk shared-wrapper actions on fail-open Aurel outages", async () => {
    const c: AurelToolGuardClient = {
      evaluateAction: vi.fn(async () => {
        throw new Error("down");
      }),
      recordActionTelemetry: vi.fn(async () => undefined),
    };
    const tool = withAurelOpenAIAgentsTool(
      { name: "read_file", execute: vi.fn(async (input) => (input as { path: string }).path) },
      { apiKey: "test", apiUrl: "https://aurel.test", failMode: "open" },
      c
    );

    await expect(tool.execute?.({ path: "README.md" })).resolves.toBe("README.md");
  });

  it("honors numeric false telemetry env values in shared wrappers", async () => {
    const previous = process.env.AUREL_TELEMETRY_ENABLED;
    process.env.AUREL_TELEMETRY_ENABLED = "0";
    const c = client([{ decision: "allow", traceId: "trace-no-telemetry" }]);
    try {
      const tool = withAurelOpenAIAgentsTool(
        {
          name: "terminal",
          execute: vi.fn(async (input) => (input as { command: string }).command),
        },
        { apiKey: "test", apiUrl: "https://aurel.test" },
        c
      );

      await expect(tool.execute?.({ command: "pwd" })).resolves.toBe("pwd");
      expect(c.evaluateAction).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(c.recordActionTelemetry).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.AUREL_TELEMETRY_ENABLED;
      } else {
        process.env.AUREL_TELEMETRY_ENABLED = previous;
      }
    }
  });

  it("honors shared-wrapper telemetry payload and redaction environment settings", async () => {
    const previous = {
      includeResults: process.env.AUREL_TELEMETRY_INCLUDE_RESULTS,
      maxPayloadBytes: process.env.AUREL_TELEMETRY_MAX_PAYLOAD_BYTES,
      redaction: process.env.AUREL_REDACTION_ENABLED,
    };
    process.env.AUREL_TELEMETRY_INCLUDE_RESULTS = "true";
    process.env.AUREL_TELEMETRY_MAX_PAYLOAD_BYTES = "1024";
    process.env.AUREL_REDACTION_ENABLED = "false";
    const c = client([{ decision: "allow", traceId: "trace-env-telemetry" }]);
    try {
      const tool = withAurelOpenAIAgentsTool(
        {
          name: "terminal",
          execute: vi.fn(async (input: unknown) => {
            void input;
            return { token: "visible-when-redaction-disabled" };
          }),
        },
        { apiKey: "test", apiUrl: "https://aurel.test" },
        c
      );

      await tool.execute?.({ authorization: "Bearer visible-when-redaction-disabled" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(c.telemetry[0]).toMatchObject({
        metadata: {
          args: { authorization: "Bearer visible-when-redaction-disabled" },
          result: { token: "visible-when-redaction-disabled" },
          resultIncluded: true,
        },
      });
    } finally {
      if (previous.includeResults === undefined) {
        delete process.env.AUREL_TELEMETRY_INCLUDE_RESULTS;
      } else {
        process.env.AUREL_TELEMETRY_INCLUDE_RESULTS = previous.includeResults;
      }
      if (previous.maxPayloadBytes === undefined) {
        delete process.env.AUREL_TELEMETRY_MAX_PAYLOAD_BYTES;
      } else {
        process.env.AUREL_TELEMETRY_MAX_PAYLOAD_BYTES = previous.maxPayloadBytes;
      }
      if (previous.redaction === undefined) {
        delete process.env.AUREL_REDACTION_ENABLED;
      } else {
        process.env.AUREL_REDACTION_ENABLED = previous.redaction;
      }
    }
  });

  it("honors shared-wrapper rewrite fallback environment settings", async () => {
    const previous = process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK;
    process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK = "block";
    const c = client([{ decision: "rewrite", rewrittenArguments: { command: "pwd" }, traceId: "trace-env-rewrite" }]);
    try {
      const guardrail = createAurelOpenAIToolInputGuardrail("terminal", { apiKey: "test", apiUrl: "https://aurel.test" }, c);
      await expect(guardrail.execute({ command: "unsafe" })).resolves.toMatchObject({
        behavior: "rejectContent",
        message: "Aurel blocked this action because it violates the active security policy.",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(c.telemetry[0]).toMatchObject({
        outcome: { status: "blocked" },
      });
    } finally {
      if (previous === undefined) {
        delete process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK;
      } else {
        process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK = previous;
      }
    }
  });
});
