import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Claude Code Aurel hook", () => {
  it("denies blocked PreToolUse decisions before execution", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-claude", riskScore: 90 }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          prompt_id: "prompt-1",
          cwd: "C:/repo",
          tool_name: "Bash",
          tool_use_id: "toolu_1",
          tool_input: { command: "rm -rf important-directory", authorization: "Bearer secret" },
        },
        url
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
        },
      });
      expect(received.at(-1)).toMatchObject({
        traceId: "trace-claude",
        outcome: { status: "blocked" },
        metadata: {
          tool: "Bash",
          args: { command: "rm -rf important-directory", authorization: "[REDACTED]" },
          decision: "block",
          riskScore: 90,
          resultIncluded: false,
        },
      });
    } finally {
      server.close();
    }
  });

  it("sends telemetry for PostToolUse", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-claude" }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PostToolUse",
          session_id: "session-1",
          prompt_id: "prompt-1",
          cwd: "C:/repo",
          tool_name: "Read",
          tool_use_id: "toolu_2",
          tool_input: { file_path: "C:/repo/README.md", authorization: "secret" },
          tool_response: { success: true },
          duration_ms: 12,
        },
        url
      );
      expect(result.code).toBe(0);
      expect(received.at(-1)).toMatchObject({
        integration: "claude-code",
        actionId: "toolu_2",
        outcome: { status: "success", durationMs: 12 },
      });
    } finally {
      server.close();
    }
  });

  it("sends idempotency keys for Claude Code evaluation and telemetry requests", async () => {
    const received: unknown[] = [];
    const requests: Array<{ url?: string; key?: string }> = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-keys" }, received, requests);
    try {
      await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          prompt_id: "prompt-1",
          tool_name: "Bash",
          tool_use_id: "toolu/key",
          tool_input: { command: "rm -rf important-directory" },
        },
        url
      );

      expect(requests).toEqual([
        { url: "/api/v1/actions/evaluate", key: "action-evaluate:toolu%2Fkey" },
        { url: "/api/v1/actions/telemetry", key: "action-telemetry:toolu%2Fkey:blocked" },
      ]);
    } finally {
      server.close();
    }
  });

  it("records approval-request telemetry for ask decisions", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "require_approval", traceId: "trace-ask", riskScore: 72 }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          prompt_id: "prompt-1",
          tool_name: "SendEmail",
          tool_use_id: "toolu_ask",
          tool_input: { to: "finance@example.com", token: "secret" },
        },
        url
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
        },
      });
      expect(received.at(-1)).toMatchObject({
        traceId: "trace-ask",
        outcome: { status: "approval_requested" },
        metadata: {
          tool: "SendEmail",
          args: { to: "finance@example.com", token: "[REDACTED]" },
          riskScore: 72,
          resultIncluded: false,
        },
      });
    } finally {
      server.close();
    }
  });

  it("maps legacy Claude Code flag decisions to approval requests", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "flag", traceId: "trace-flag", riskScore: 64 }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "SendEmail",
          tool_use_id: "toolu_flag",
          tool_input: { to: "finance@example.com" },
        },
        url
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
        },
      });
      expect(received.at(-1)).toMatchObject({
        traceId: "trace-flag",
        outcome: { status: "approval_requested" },
        metadata: { decision: "require_approval", riskScore: 64 },
      });
    } finally {
      server.close();
    }
  });

  it("skips excluded Claude Code tools without contacting Aurel", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-excluded" }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_excluded",
          tool_input: { command: "pwd" },
        },
        url,
        { AUREL_TOOLS_EXCLUDE: "Bash" }
      );
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
      expect(received).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("honors numeric false AUREL_ENABLED for Claude Code hooks", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-disabled" }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_disabled",
          tool_input: { command: "pwd" },
        },
        url,
        { AUREL_ENABLED: "0" }
      );
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
      expect(received).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("honors Claude Code telemetry redaction and payload environment settings", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-redaction-off" }, received);
    try {
      const redactionOff = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_redaction_off",
          tool_input: { authorization: "Bearer visible", command: "pwd" },
        },
        url,
        { AUREL_REDACTION_ENABLED: "false" }
      );
      expect(redactionOff.code).toBe(0);
      expect(received.at(-1)).toMatchObject({
        metadata: {
          args: { authorization: "Bearer visible", command: "pwd" },
        },
      });

      await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_payload_bound",
          tool_input: { command: "x".repeat(5000) },
        },
        url,
        { AUREL_TELEMETRY_MAX_PAYLOAD_BYTES: "1024" }
      );
      expect(received.at(-1)).toMatchObject({
        metadata: {
          args: { truncated: true, reason: "payload_limit" },
        },
      });
    } finally {
      server.close();
    }
  });

  it("bounds oversized Claude Code preflight arguments before sending them to Aurel", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-large-preflight" }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          tool_name: "Bash",
          tool_use_id: "toolu_large_preflight",
          tool_input: { command: "x".repeat(2 * 1024 * 1024) },
        },
        url,
        { AUREL_HOOK_MAX_STDIN_BYTES: String(4 * 1024 * 1024) }
      );
      expect(result.code).toBe(0);
      const evaluation = received[0] as { action: { arguments: { command: string } } };
      expect(new TextEncoder().encode(JSON.stringify(evaluation)).length).toBeLessThan(1024 * 1024);
      expect(evaluation.action.arguments.command).toContain("[truncated]");
    } finally {
      server.close();
    }
  });

  it("bounds total Claude Code preflight request size while preserving the action envelope", async () => {
    const received: unknown[] = [];
    const manyLargeFields = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`field_${index}`, "x".repeat(65_536)]));
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-total-bound" }, received);
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          tool_name: "Bash",
          tool_use_id: "toolu_total_bound",
          tool_input: manyLargeFields,
        },
        url,
        { AUREL_HOOK_MAX_STDIN_BYTES: String(8 * 1024 * 1024) }
      );
      expect(result.code).toBe(0);
      const evaluation = received[0] as { action: { id: string; name: string; arguments: unknown }; agent: unknown };
      expect(new TextEncoder().encode(JSON.stringify(evaluation)).length).toBeLessThan(1024 * 1024);
      expect(evaluation.action).toMatchObject({ id: "toolu_total_bound", name: "Bash" });
      expect(evaluation.agent).toEqual(expect.objectContaining({ sessionId: "session-1" }));
      expect(evaluation.action.arguments).toEqual({ truncated: true, reason: "payload_limit" });
    } finally {
      server.close();
    }
  });

  it("keeps prototype-pollution shaped Claude Code arguments inert in telemetry", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-proto" }, received);
    try {
      const toolInput = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"command":"pwd"}');
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_proto",
          tool_input: toolInput,
        },
        url
      );
      expect(result.code).toBe(0);
      const metadata = (received.at(-1) as { metadata: { args: Record<string, unknown> } }).metadata;
      expect(metadata.args).toMatchObject({
        "__proto__": { polluted: true },
        constructor: { prototype: { polluted: true } },
        command: "pwd",
      });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("fails closed on malformed Claude Code hook input", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-unused" });
    try {
      const result = await runHookRaw("{bad-json", url);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Aurel security verification is unavailable.",
        },
      });
    } finally {
      server.close();
    }
  });

  it("fails closed on malformed Aurel decision metadata", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-bad-metadata", riskScore: 500, ruleIds: "not-an-array" });
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          tool_name: "Bash",
          tool_use_id: "toolu_bad_metadata",
          tool_input: { command: "pwd" },
        },
        url
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Aurel security verification is unavailable.",
        },
      });
    } finally {
      server.close();
    }
  });

  it("allows low-risk Claude Code tools on fail-open Aurel outages", async () => {
    const result = await runHook(
      {
        hook_event_name: "PreToolUse",
        session_id: "session-1",
        tool_name: "Read",
        tool_use_id: "toolu_fail_open_read",
        tool_input: { file_path: "README.md" },
      },
      "http://127.0.0.1:9",
      { AUREL_FAIL_MODE: "open", AUREL_TIMEOUT_MS: "100" }
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    });
  });

  it("blocks privileged Claude Code tools on fail-open Aurel outages by default", async () => {
    const result = await runHook(
      {
        hook_event_name: "PreToolUse",
        session_id: "session-1",
        tool_name: "Bash",
        tool_use_id: "toolu_fail_open_bash",
        tool_input: { command: "pwd" },
      },
      "http://127.0.0.1:9",
      { AUREL_FAIL_MODE: "open", AUREL_TIMEOUT_MS: "100" }
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Aurel security verification is unavailable.",
      },
    });
  });

  it("can explicitly allow privileged Claude Code tools on fail-open Aurel outages", async () => {
    const result = await runHook(
      {
        hook_event_name: "PreToolUse",
        session_id: "session-1",
        tool_name: "Bash",
        tool_use_id: "toolu_fail_open_bash_optout",
        tool_input: { command: "pwd" },
      },
      "http://127.0.0.1:9",
      { AUREL_FAIL_MODE: "open", AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS: "allow", AUREL_TIMEOUT_MS: "100" }
    );

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    });
  });

  it("fails closed on oversized Aurel responses", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-large", padding: "x".repeat(1024 * 1024) });
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          tool_name: "Bash",
          tool_use_id: "toolu_large_response",
          tool_input: { command: "pwd" },
        },
        url
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Aurel security verification is unavailable.",
        },
      });
    } finally {
      server.close();
    }
  });

  it("fails closed on oversized Claude Code hook input", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-unused" });
    try {
      const result = await runHookRaw(JSON.stringify({ padding: "x".repeat(2048) }), url, { AUREL_HOOK_MAX_STDIN_BYTES: "1024" });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Aurel security verification is unavailable.",
        },
      });
    } finally {
      server.close();
    }
  });

  it("correlates PostToolUse telemetry with the PreToolUse Aurel trace", async () => {
    const received: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-correlated" }, received);
    const stateDir = mkdtempSync(join(tmpdir(), "aurel-claude-test-"));
    try {
      const pre = await runHook(
        {
          hook_event_name: "PreToolUse",
          session_id: "session-1",
          prompt_id: "prompt-1",
          tool_name: "Read",
          tool_use_id: "toolu_correlated",
          tool_input: { file_path: "README.md" },
        },
        url,
        { AUREL_STATE_DIR: stateDir }
      );
      expect(JSON.parse(pre.stdout)).toMatchObject({
        hookSpecificOutput: { permissionDecision: "allow" },
      });

      await runHook(
        {
          hook_event_name: "PostToolUse",
          session_id: "session-1",
          prompt_id: "prompt-1",
          tool_name: "Read",
          tool_use_id: "toolu_correlated",
          tool_input: { file_path: "README.md" },
          duration_ms: 5,
        },
        url,
        { AUREL_STATE_DIR: stateDir }
      );

      expect(received.at(-1)).toMatchObject({
        traceId: "trace-correlated",
        actionId: "toolu_correlated",
        timings: { toolExecutionLatencyMs: 5 },
      });
      expect((received.at(-1) as { timings: { aurelPreflightLatencyMs?: number } }).timings.aurelPreflightLatencyMs).toEqual(expect.any(Number));
    } finally {
      server.close();
    }
  });

  it("fails closed when Aurel preflight times out", async () => {
    const { server, url } = await hangingAurel();
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_timeout",
          tool_input: { command: "pwd" },
        },
        url,
        { AUREL_TIMEOUT_MS: "100" }
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Aurel security verification is unavailable.",
        },
      });
    } finally {
      server.close();
    }
  });

  it("fails closed when Aurel response body stalls after headers", async () => {
    const { server, url } = await bodyStallingAurel();
    try {
      const result = await runHook(
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_use_id: "toolu_body_timeout",
          tool_input: { command: "pwd" },
        },
        url,
        { AUREL_TIMEOUT_MS: "100" }
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Aurel security verification is unavailable.",
        },
      });
    } finally {
      server.close();
    }
  });

  it("fails closed for malformed hook input even when fail-open is configured", async () => {
    const result = await runHookRaw("{bad json", "http://127.0.0.1:9", { AUREL_FAIL_MODE: "open" });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Aurel security verification is unavailable.",
      },
    });
  });

  it("fails closed for oversized hook input even when fail-open is configured", async () => {
    const result = await runHookRaw("x".repeat(2048), "http://127.0.0.1:9", {
      AUREL_FAIL_MODE: "open",
      AUREL_HOOK_MAX_STDIN_BYTES: "1024",
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Aurel security verification is unavailable.",
      },
    });
  });
});

async function runHook(input: unknown, apiUrl: string, env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runHookRaw(JSON.stringify(input), apiUrl, env);
}

async function runHookRaw(input: string, apiUrl: string, env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [join(process.cwd(), "integrations/claude-code/hooks/aurel-hook.mjs")], {
    env: { ...process.env, AUREL_API_URL: apiUrl, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000", ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdin.end(input);
  const [code] = (await once(child, "exit")) as [number | null];
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function mockAurel(
  decision: Record<string, unknown>,
  telemetry: unknown[] = [],
  requests: Array<{ url?: string; key?: string }> = []
): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    requests.push({ url: req.url, key: req.headers["idempotency-key"]?.toString() });
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      telemetry.push(body);
      if (req.url?.endsWith("/telemetry")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ accepted: true }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(decision));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind test server");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function hangingAurel(): Promise<{ server: Server; url: string }> {
  const server = createServer((req) => {
    req.resume();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind test server");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function bodyStallingAurel(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"decision":');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind test server");
  return { server, url: `http://127.0.0.1:${address.port}` };
}
