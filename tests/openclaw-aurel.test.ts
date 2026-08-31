import { describe, expect, it, vi } from "vitest";
import manifest from "@/integrations/openclaw/openclaw.plugin.json";
import {
  createAurelHttpClient,
  createOpenClawAurelHandlers,
  loadConfig,
  normalizeOpenClawAction,
  type AurelHttpClient,
  type AurelSecurityDecision,
  type OpenClawAfterToolEvent,
  type OpenClawBeforeToolEvent,
} from "@/integrations/openclaw/src/security";

function cfg(overrides: Record<string, unknown> = {}) {
  return loadConfig({
    apiKey: "test-key",
    apiUrl: "https://aurel.test",
    ...overrides,
  });
}

function client(decisions: AurelSecurityDecision[]): AurelHttpClient & { telemetry: unknown[] } {
  const telemetry: unknown[] = [];
  return {
    telemetry,
    evaluateAction: vi.fn(async () => decisions.shift() ?? ({ decision: "allow", traceId: "trace-default" } satisfies AurelSecurityDecision)),
    recordTelemetry: vi.fn(async (payload) => {
      telemetry.push(payload);
    }),
  };
}

describe("OpenClaw Aurel plugin", () => {
  it("exposes safety switches in the OpenClaw manifest schema", () => {
    expect(manifest.configSchema.properties.approval.properties.nativeDirective).toMatchObject({
      type: "boolean",
      default: false,
    });
  });

  it("registers native hooks through api.on when available", async () => {
    const entry = (await import("@/integrations/openclaw/src/index")).default;
    const on = vi.fn();
    entry.register({ on, getConfig: () => ({ apiKey: "test-key", apiUrl: "https://aurel.test" }) });
    expect(on).toHaveBeenCalledWith("before_tool_call", expect.any(Function), expect.objectContaining({ registrationId: "aurel-tool-security" }));
    expect(on).toHaveBeenCalledWith("after_tool_call", expect.any(Function), expect.objectContaining({ registrationId: "aurel-tool-security" }));
  });

  it("sends deterministic idempotency keys from the OpenClaw HTTP client", async () => {
    const seen: Array<{ url: string; key: string | null }> = [];
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (input, init) => {
        seen.push({ url: String(input), key: new Headers(init?.headers).get("idempotency-key") });
        return new Response(JSON.stringify(String(input).endsWith("/telemetry") ? { accepted: true } : { decision: "allow" }), {
          status: 200,
        });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call/1", name: "read_file", arguments: {} },
      agent: {},
      timestamp: new Date().toISOString(),
    });
    await http.recordTelemetry({
      version: "1",
      integration: "openclaw",
      actionId: "call/1",
      outcome: { status: "success" },
      timestamp: new Date().toISOString(),
    });

    expect(seen).toEqual([
      { url: "https://aurel.test/api/v1/actions/evaluate", key: "action-evaluate:call%2F1" },
      { url: "https://aurel.test/api/v1/actions/telemetry", key: "action-telemetry:call%2F1:success" },
    ]);
  });

  it("serializes circular OpenClaw action arguments without mutating tool params", async () => {
    const seenBodies: string[] = [];
    const params: Record<string, unknown> = { command: "pwd" };
    params.self = params;
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-circular", name: "exec", arguments: params },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(params.self).toBe(params);
    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({ command: "pwd", self: "[Circular]" });
  });

  it("preserves repeated non-circular OpenClaw action argument references", async () => {
    const seenBodies: string[] = [];
    const shared = { path: "README.md" };
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-repeated-ref", name: "read_file", arguments: { first: shared, second: shared } },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({
      first: { path: "README.md" },
      second: { path: "README.md" },
    });
  });

  it("serializes throwing OpenClaw action argument accessors as inert values", async () => {
    const seenBodies: string[] = [];
    const params: Record<string, unknown> = { command: "pwd" };
    Object.defineProperty(params, "token", {
      enumerable: true,
      get() {
        throw new Error("getter should not escape");
      },
    });
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-throwing-getter", name: "exec", arguments: params },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({
      command: "pwd",
      token: "[UnserializableProperty]",
    });
  });

  it("serializes throwing OpenClaw action argument enumeration as an inert object", async () => {
    const seenBodies: string[] = [];
    const params = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("ownKeys should not escape");
        },
      }
    );
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-throwing-ownkeys", name: "exec", arguments: params },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toBe("[UnserializableObject]");
  });

  it("bounds oversized OpenClaw action arguments before sending Aurel preflight", async () => {
    const seenBodies: string[] = [];
    const giant = "x".repeat(2 * 1024 * 1024);
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-large", name: "exec", arguments: { command: giant } },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(new TextEncoder().encode(seenBodies[0]).length).toBeLessThan(1024 * 1024);
    expect(JSON.parse(seenBodies[0]).action.arguments.command).toContain("[truncated]");
  });

  it("bounds total OpenClaw preflight request size while preserving the action envelope", async () => {
    const seenBodies: string[] = [];
    const manyLargeFields = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`field_${index}`, "x".repeat(65_536)]));
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-total-bound", name: "exec", arguments: manyLargeFields },
      agent: { id: "agent-1" },
      timestamp: new Date().toISOString(),
    });

    const sent = JSON.parse(seenBodies[0]);
    expect(new TextEncoder().encode(seenBodies[0]).length).toBeLessThan(1024 * 1024);
    expect(sent.action).toMatchObject({ id: "call-total-bound", name: "exec" });
    expect(sent.agent).toEqual({ id: "agent-1" });
    expect(sent.action.arguments).toEqual({ truncated: true, reason: "payload_limit" });
  });

  it("preserves non-finite OpenClaw action numbers as explicit markers", async () => {
    const seenBodies: string[] = [];
    const http = createAurelHttpClient(
      cfg(),
      vi.fn(async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as typeof fetch
    );

    await http.evaluateAction({
      version: "1",
      integration: "openclaw",
      action: { id: "call-non-finite", name: "exec", arguments: { risk: Number.NaN, limit: Number.NEGATIVE_INFINITY } },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({
      risk: "[NonFiniteNumber]",
      limit: "[NonFiniteNumber]",
    });
  });

  it("falls back to OpenClaw registerHook for older installed runtimes", async () => {
    const entry = (await import("@/integrations/openclaw/src/index")).default;
    const registerHook = vi.fn();
    entry.register({ registerHook, getConfig: () => ({ apiKey: "test-key", apiUrl: "https://aurel.test" }) });
    expect(registerHook).toHaveBeenCalledWith("before_tool_call", expect.any(Function), expect.objectContaining({ registrationId: "aurel-tool-security" }));
    expect(registerHook).toHaveBeenCalledWith("after_tool_call", expect.any(Function), expect.objectContaining({ registrationId: "aurel-tool-security" }));
  });

  it("converts approval decisions to explicit blocks on current OpenClaw hook contract", async () => {
    const entry = (await import("@/integrations/openclaw/src/index")).default;
    const registerHook = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ decision: "require_approval", traceId: "legacy" }))) as typeof fetch;
    try {
      entry.register({ registerHook, getConfig: () => ({ apiKey: "test-key", apiUrl: "https://aurel.test" }) });
      const before = registerHook.mock.calls.find(([hook]) => hook === "before_tool_call")?.[1];
      await expect(before({ toolName: "send_email", params: {} })).resolves.toEqual({
        block: true,
        blockReason: "Aurel blocked this action because it violates the active security policy.",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes OpenClaw tool calls into the common Aurel action model", () => {
    const action = normalizeOpenClawAction(
      {
        toolName: "exec",
        params: { command: "pwd" },
        toolKind: "code_mode_exec",
        toolInputKind: "powershell",
        derivedPaths: ["C:/repo"],
        runId: 7,
        toolCallId: "call_1",
      },
      {
        agentId: "agent_1",
        sessionKey: "session_key",
        requester: { channel: "slack", accountId: "acct", senderId: "u1", senderIsOwner: true, roleIds: ["admin"] },
      }
    );

    expect(action.integration).toBe("openclaw");
    expect(action.action).toMatchObject({ id: "call_1", name: "exec", type: "code_mode_exec" });
    expect(action.agent).toMatchObject({ id: "agent_1", sessionId: "session_key", runId: "7" });
    expect(action.requester?.isOwner).toBe(true);
    expect(action.context?.targetPaths).toEqual(["C:/repo"]);
  });

  it("allows safe actions without interfering", async () => {
    const handlers = createOpenClawAurelHandlers(cfg(), client([{ decision: "allow", traceId: "tr_allow" }]));
    await expect(handlers.beforeToolCall({ toolName: "read_file", params: { path: "README.md" }, toolCallId: "safe" })).resolves.toBeUndefined();
  });

  it("blocks malicious actions with a sanitized reason", async () => {
    const c = client([{ decision: "block", reason: "internal rule details", traceId: "tr_block", riskScore: 99 }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "rm -rf important-directory", authorization: "Bearer secret" }, toolCallId: "bad" });
    expect(result).toEqual({
      block: true,
      blockReason: "Aurel blocked this action because it violates the active security policy.",
    });
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "tr_block",
      outcome: { status: "blocked" },
      timings: {
        aurelPostflightLatencyMs: expect.any(Number),
      },
      metadata: {
        tool: "exec",
        params: { command: "rm -rf important-directory", authorization: "[REDACTED]" },
        decision: "block",
        riskScore: 99,
      },
    });
  });

  it("does not duplicate telemetry if a blocked OpenClaw call later emits after_tool_call", async () => {
    const c = client([{ decision: "block", traceId: "tr_block_once" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    await handlers.beforeToolCall({ toolName: "exec", params: { command: "rm -rf important-directory" }, toolCallId: "blocked-once" });
    await handlers.afterToolCall({ toolName: "exec", params: {}, toolCallId: "blocked-once", result: "should-not-run" });
    await Promise.resolve();
    expect(c.telemetry).toHaveLength(1);
    expect(c.telemetry[0]).toMatchObject({ outcome: { status: "blocked" } });
  });

  it("blocks approval-required actions when native approval is unavailable", async () => {
    const c = client([{ decision: "require_approval", riskScore: 70, traceId: "tr_approval" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    const result = await handlers.beforeToolCall({ toolName: "send_email", params: { to: "finance@example.com", token: "secret" }, toolCallId: "mail" });
    expect(result).toEqual({
      block: true,
      blockReason: "Aurel blocked this action because it violates the active security policy.",
    });
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "tr_approval",
      outcome: { status: "blocked" },
      timings: {
        aurelPostflightLatencyMs: expect.any(Number),
      },
      metadata: {
        tool: "send_email",
        params: { to: "finance@example.com", token: "[REDACTED]" },
        riskScore: 70,
      },
    });
  });

  it("maps suspicious actions to native approval when explicitly enabled for a future host", async () => {
    const c = client([{ decision: "require_approval", riskScore: 70, traceId: "tr_approval" }]);
    const handlers = createOpenClawAurelHandlers(cfg({ approval: { nativeDirective: true } }), c);
    const result = await handlers.beforeToolCall({ toolName: "send_email", params: { to: "finance@example.com", token: "secret" }, toolCallId: "mail" });
    expect(result?.requireApproval?.severity).toBe("warning");
    expect(result?.requireApproval?.description).toContain("human approval");
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "tr_approval",
      outcome: { status: "approval_requested" },
      metadata: {
        tool: "send_email",
        params: { to: "finance@example.com", token: "[REDACTED]" },
        riskScore: 70,
      },
    });
  });

  it("rewrites params when OpenClaw supports parameter rewrites", async () => {
    const handlers = createOpenClawAurelHandlers(
      cfg(),
      client([{ decision: "rewrite", rewrittenArguments: { command: "curl --head https://example.com" }, traceId: "tr_rewrite" }])
    );
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "curl https://example.com" }, supportsParamRewrite: true });
    expect(result).toEqual({ params: { command: "curl --head https://example.com" } });
  });

  it("falls back to block when rewrite is unsupported and native approval is unavailable", async () => {
    const handlers = createOpenClawAurelHandlers(
      cfg(),
      client([{ decision: "rewrite", rewrittenArguments: { command: "safe" }, traceId: "tr_no_rewrite" }])
    );
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "unsafe" }, supportsParamRewrite: false });
    expect(result?.block).toBe(true);
  });

  it("can fall back to native approval for unsupported rewrites when explicitly enabled", async () => {
    const handlers = createOpenClawAurelHandlers(
      cfg({ approval: { nativeDirective: true } }),
      client([{ decision: "rewrite", rewrittenArguments: { command: "safe" }, traceId: "tr_no_rewrite" }])
    );
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "unsafe" }, supportsParamRewrite: false });
    expect(result?.requireApproval?.title).toBe("Aurel approval required");
  });

  it("can block unsupported rewrites when configured", async () => {
    const handlers = createOpenClawAurelHandlers(
      cfg({ rewrite: { unsupportedFallback: "block" } }),
      client([{ decision: "rewrite", rewrittenArguments: { command: "safe" }, traceId: "tr_block_rewrite" }])
    );
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "unsafe" }, supportsParamRewrite: false });
    expect(result?.block).toBe(true);
  });

  it("allows through when Aurel is unavailable and failMode=open", async () => {
    const failingClient = client([]);
    vi.mocked(failingClient.evaluateAction).mockRejectedValueOnce(new Error("down"));
    const handlers = createOpenClawAurelHandlers(cfg({ failMode: "open" }), failingClient);
    await expect(handlers.beforeToolCall({ toolName: "read_file", params: { path: "README.md" } })).resolves.toBeUndefined();
  });

  it("blocks privileged actions when Aurel is unavailable even in failMode=open by default", async () => {
    const failingClient = client([]);
    vi.mocked(failingClient.evaluateAction).mockRejectedValueOnce(new Error("down"));
    const handlers = createOpenClawAurelHandlers(cfg({ failMode: "open" }), failingClient);
    await expect(handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } })).resolves.toEqual({
      block: true,
      blockReason: "Aurel security verification is unavailable.",
    });
  });

  it("can explicitly allow privileged actions when Aurel is unavailable in failMode=open", async () => {
    const failingClient = client([]);
    vi.mocked(failingClient.evaluateAction).mockRejectedValueOnce(new Error("down"));
    const handlers = createOpenClawAurelHandlers(cfg({ failMode: "open", failOpenPrivilegedActions: "allow" }), failingClient);
    await expect(handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } })).resolves.toBeUndefined();
  });

  it("explicitly blocks when Aurel is unavailable and failMode=closed", async () => {
    const failingClient = client([]);
    vi.mocked(failingClient.evaluateAction).mockRejectedValueOnce(new Error("down"));
    const handlers = createOpenClawAurelHandlers(cfg({ failMode: "closed" }), failingClient);
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(result).toEqual({ block: true, blockReason: "Aurel security verification is unavailable." });
  });

  it("treats timeouts as fail-closed blocks", async () => {
    const failingClient = client([]);
    vi.mocked(failingClient.evaluateAction).mockRejectedValueOnce(new Error("timeout"));
    const handlers = createOpenClawAurelHandlers(cfg(), failingClient);
    const result = await handlers.beforeToolCall({ toolName: "browser.open", params: { url: "https://example.com" } });
    expect(result?.blockReason).toBe("Aurel security verification is unavailable.");
  });

  it("fails closed on malformed Aurel responses from the HTTP client", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ decision: "surprise" }), { status: 200 }));
    const handlers = createOpenClawAurelHandlers(cfg(), createAurelHttpClient(cfg(), fetchImpl as unknown as typeof fetch));
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(result?.block).toBe(true);
  });

  it("fails closed on malformed Aurel decision metadata from the HTTP client", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ decision: "allow", riskScore: 500, ruleIds: "not-an-array" }), { status: 200 }));
    const handlers = createOpenClawAurelHandlers(cfg(), createAurelHttpClient(cfg(), fetchImpl as unknown as typeof fetch));
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(result).toEqual({ block: true, blockReason: "Aurel security verification is unavailable." });
  });

  it("fails closed on oversized Aurel JSON responses from the HTTP client", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ decision: "allow", padding: "x".repeat(1024 * 1024) }), { status: 200 }));
    const handlers = createOpenClawAurelHandlers(cfg(), createAurelHttpClient(cfg(), fetchImpl as unknown as typeof fetch));
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(result).toEqual({ block: true, blockReason: "Aurel security verification is unavailable." });
  });

  it("strips query strings and fragments from the configured OpenClaw Aurel URL", async () => {
    const seen: string[] = [];
    const config = cfg({ apiUrl: "https://aurel.test/base?token=secret#fragment" });
    const client = createAurelHttpClient(
      config,
      (async (input: RequestInfo | URL) => {
        seen.push(String(input));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      }) as unknown as typeof fetch
    );
    const handlers = createOpenClawAurelHandlers(config, client);
    await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(seen[0]).toBe("https://aurel.test/base/api/v1/actions/evaluate");
  });

  it("enforces the OpenClaw HTTP timeout even if fetch ignores AbortSignal", async () => {
    const fetchImpl = vi.fn(async () => new Promise<Response>(() => undefined));
    const config = cfg({ timeoutMs: 100 });
    const handlers = createOpenClawAurelHandlers(config, createAurelHttpClient(config, fetchImpl as unknown as typeof fetch));
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(result).toEqual({ block: true, blockReason: "Aurel security verification is unavailable." });
  });

  it("enforces the OpenClaw HTTP timeout if the response body stalls", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"decision":'));
      },
    });
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "application/json" } }));
    const config = cfg({ timeoutMs: 100 });
    const handlers = createOpenClawAurelHandlers(config, createAurelHttpClient(config, fetchImpl as unknown as typeof fetch));
    const result = await handlers.beforeToolCall({ toolName: "exec", params: { command: "pwd" } });
    expect(result).toEqual({ block: true, blockReason: "Aurel security verification is unavailable." });
  });

  it("keeps concurrent tool-call trace IDs isolated", async () => {
    const c = client([
      { decision: "allow", traceId: "trace-a" },
      { decision: "allow", traceId: "trace-b" },
    ]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    await Promise.all([
      handlers.beforeToolCall({ toolName: "read_file", toolCallId: "a", params: { path: "a" } }),
      handlers.beforeToolCall({ toolName: "read_file", toolCallId: "b", params: { path: "b" } }),
    ]);
    await handlers.afterToolCall({ toolName: "read_file", toolCallId: "a", result: "ok", durationMs: 5 });
    await handlers.afterToolCall({ toolName: "read_file", toolCallId: "b", result: "ok", durationMs: 6 });
    await Promise.resolve();
    expect(c.telemetry.map((entry) => (entry as { traceId?: string }).traceId).sort()).toEqual(["trace-a", "trace-b"]);
  });

  it("correlates post-call telemetry without an explicit OpenClaw toolCallId", async () => {
    const c = client([{ decision: "allow", traceId: "trace-run-fallback" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    await handlers.beforeToolCall({ toolName: "read_file", runId: 7, params: { path: "README.md" } });
    await handlers.afterToolCall({ toolName: "read_file", runId: 7, result: "ok", durationMs: 5 });
    await Promise.resolve();
    expect(c.telemetry[0]).toMatchObject({
      traceId: "trace-run-fallback",
      actionId: expect.stringMatching(/^oc-act_/),
    });
  });

  it("does not let an older cleanup timer delete newer fallback correlation state", async () => {
    vi.useFakeTimers();
    try {
      const c = client([
        { decision: "allow", traceId: "trace-old" },
        { decision: "allow", traceId: "trace-new" },
      ]);
      const handlers = createOpenClawAurelHandlers(cfg(), c);
      await handlers.beforeToolCall({ toolName: "read_file", runId: 7, params: { path: "old" } });
      vi.advanceTimersByTime(10 * 60 * 1000 - 1);
      await handlers.beforeToolCall({ toolName: "read_file", runId: 7, params: { path: "new" } });
      vi.advanceTimersByTime(1);
      await handlers.afterToolCall({ toolName: "read_file", runId: 7, params: { path: "new" }, result: "ok", durationMs: 5 });
      await Promise.resolve();
      expect(c.telemetry[0]).toMatchObject({
        traceId: "trace-new",
        metadata: { params: { path: "new" } },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("redacts credentials from post-tool telemetry without altering preflight args", async () => {
    const c = client([{ decision: "allow", traceId: "trace-redact" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    const params = { authorization: "Bearer secret", nested: { api_key: "sk_live" }, command: "echo ok" };
    await handlers.beforeToolCall({ toolName: "exec", toolCallId: "redact", params });
    expect(vi.mocked(c.evaluateAction).mock.calls[0][0].action.arguments).toBe(params);
    await handlers.afterToolCall({ toolName: "exec", toolCallId: "redact", params, result: "ok" });
    await Promise.resolve();
    const sent = c.telemetry[0] as { metadata: { params: Record<string, unknown> } };
    expect(sent.metadata.params.authorization).toBe("[REDACTED]");
    expect(sent.metadata.params.nested).toEqual({ api_key: "[REDACTED]" });
  });

  it("preserves repeated non-circular references in OpenClaw telemetry redaction", async () => {
    const c = client([{ decision: "allow", traceId: "trace-repeated-telemetry" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    const shared = { path: "README.md" };
    const params = { first: shared, second: shared };
    await handlers.beforeToolCall({ toolName: "read_file", toolCallId: "repeat-telemetry", params });
    await handlers.afterToolCall({ toolName: "read_file", toolCallId: "repeat-telemetry", params, result: "ok" });
    await Promise.resolve();

    expect((c.telemetry[0] as { metadata: { params: unknown } }).metadata.params).toEqual({
      first: { path: "README.md" },
      second: { path: "README.md" },
    });
  });

  it("redacts throwing OpenClaw telemetry accessors as inert values", async () => {
    const c = client([{ decision: "allow", traceId: "trace-throwing-telemetry" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    const params: Record<string, unknown> = { command: "pwd" };
    Object.defineProperty(params, "authorization", {
      enumerable: true,
      get() {
        throw new Error("getter should not escape");
      },
    });
    await handlers.beforeToolCall({ toolName: "exec", toolCallId: "throwing-telemetry", params: { command: "pwd" } });
    await handlers.afterToolCall({ toolName: "exec", toolCallId: "throwing-telemetry", params, result: "ok" });
    await Promise.resolve();

    expect((c.telemetry[0] as { metadata: { params: unknown } }).metadata.params).toEqual({
      command: "pwd",
      authorization: "[REDACTED]",
    });
  });

  it("redacts throwing OpenClaw telemetry enumeration as an inert object", async () => {
    const c = client([{ decision: "allow", traceId: "trace-ownkeys-telemetry" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    const params = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("ownKeys should not escape");
        },
      }
    );
    await handlers.beforeToolCall({ toolName: "exec", toolCallId: "ownkeys-telemetry", params: { command: "pwd" } });
    await handlers.afterToolCall({ toolName: "exec", toolCallId: "ownkeys-telemetry", params, result: "ok" });
    await Promise.resolve();

    expect((c.telemetry[0] as { metadata: { params: unknown } }).metadata.params).toBe("[UnserializableObject]");
  });

  it("records approval resolution telemetry", async () => {
    const c = client([{ decision: "require_approval", traceId: "trace-approval" }]);
    const handlers = createOpenClawAurelHandlers(cfg({ approval: { nativeDirective: true } }), c);
    const result = await handlers.beforeToolCall({ toolName: "send_email", toolCallId: "approve", params: {} });
    await result?.requireApproval?.onResolution?.("deny");
    expect(c.telemetry.at(-1)).toMatchObject({ outcome: { status: "approval_denied" } });
  });

  it("does not recursively intercept Aurel internal tools", async () => {
    const c = client([{ decision: "block" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    await handlers.beforeToolCall({ toolName: "aurel.telemetry", params: { nested: true } });
    expect(c.evaluateAction).not.toHaveBeenCalled();
  });

  it("does not send full tool results unless configured", async () => {
    const c = client([{ decision: "allow", traceId: "trace-no-result" }]);
    const handlers = createOpenClawAurelHandlers(cfg(), c);
    await handlers.beforeToolCall({ toolName: "read_file", toolCallId: "no-result", params: {} });
    await handlers.afterToolCall({ toolName: "read_file", toolCallId: "no-result", result: "large output" } as OpenClawAfterToolEvent);
    await Promise.resolve();
    expect((c.telemetry[0] as { metadata: Record<string, unknown> }).metadata.result).toBeUndefined();
  });

  it("respects tool include/exclude configuration", async () => {
    const c = client([{ decision: "block" }]);
    const handlers = createOpenClawAurelHandlers(cfg({ tools: { include: ["exec"], exclude: ["read_file"] } }), c);
    await handlers.beforeToolCall({ toolName: "read_file", params: {} } as OpenClawBeforeToolEvent);
    await handlers.beforeToolCall({ toolName: "exec", params: {} } as OpenClawBeforeToolEvent);
    expect(c.evaluateAction).toHaveBeenCalledTimes(1);
  });

  it("honors OpenClaw environment toggles and tool filters", async () => {
    const previous = {
      enabled: process.env.AUREL_ENABLED,
      include: process.env.AUREL_TOOLS_INCLUDE,
      exclude: process.env.AUREL_TOOLS_EXCLUDE,
      includeResults: process.env.AUREL_TELEMETRY_INCLUDE_RESULTS,
      redaction: process.env.AUREL_REDACTION_ENABLED,
    };
    process.env.AUREL_ENABLED = "0";
    process.env.AUREL_TOOLS_INCLUDE = "exec,send_email";
    process.env.AUREL_TOOLS_EXCLUDE = "read_file";
    process.env.AUREL_TELEMETRY_INCLUDE_RESULTS = "true";
    process.env.AUREL_REDACTION_ENABLED = "false";
    try {
      const config = loadConfig({ apiKey: "test-key", apiUrl: "https://aurel.test" });
      expect(config.enabled).toBe(false);
      expect(config.tools.include).toEqual(["exec", "send_email"]);
      expect(config.tools.exclude).toEqual(["read_file"]);
      expect(config.telemetry.includeResults).toBe(true);
      expect(config.redaction.enabled).toBe(false);
    } finally {
      for (const [key, value] of Object.entries({
        AUREL_ENABLED: previous.enabled,
        AUREL_TOOLS_INCLUDE: previous.include,
        AUREL_TOOLS_EXCLUDE: previous.exclude,
        AUREL_TELEMETRY_INCLUDE_RESULTS: previous.includeResults,
        AUREL_REDACTION_ENABLED: previous.redaction,
      })) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("keeps explicit OpenClaw config ahead of environment fallbacks", async () => {
    const previous = {
      failMode: process.env.AUREL_FAIL_MODE,
      rewriteFallback: process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK,
    };
    process.env.AUREL_FAIL_MODE = "open";
    process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK = "block";
    try {
      const config = loadConfig({
        apiKey: "test-key",
        apiUrl: "https://aurel.test",
        failMode: "closed",
        rewrite: { unsupportedFallback: "approval" },
      });
      expect(config.failMode).toBe("closed");
      expect(config.rewrite.unsupportedFallback).toBe("approval");
    } finally {
      for (const [key, value] of Object.entries({
        AUREL_FAIL_MODE: previous.failMode,
        AUREL_REWRITE_UNSUPPORTED_FALLBACK: previous.rewriteFallback,
      })) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("falls back to warn for invalid OpenClaw log level environment values", () => {
    const previous = process.env.AUREL_LOG_LEVEL;
    process.env.AUREL_LOG_LEVEL = "verbose";
    try {
      const config = loadConfig({ apiKey: "test-key", apiUrl: "https://aurel.test" });
      expect(config.logLevel).toBe("warn");
    } finally {
      if (previous === undefined) {
        delete process.env.AUREL_LOG_LEVEL;
      } else {
        process.env.AUREL_LOG_LEVEL = previous;
      }
    }
  });
});
