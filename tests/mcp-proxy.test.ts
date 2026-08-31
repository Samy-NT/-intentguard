import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Aurel MCP proxy", () => {
  it("blocks MCP tools/call before forwarding upstream", async () => {
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-mcp" });
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "terminal", arguments: { command: "rm -rf important-directory" } } });
      proxy.kill();
      expect(readNestedString(output, ["error", "message"])).toContain("Aurel blocked");
    } finally {
      server.close();
    }
  });

  it("forwards allowed MCP tools/call to upstream", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-mcp" }, telemetry);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_file", arguments: { path: "README.md", authorization: "Bearer secret" } } });
      await waitFor(() => telemetry.length > 0);
      proxy.kill();
      expect(output.result).toEqual({ content: [{ type: "text", text: "upstream-ok" }] });
      expect(telemetry.at(-1)).toMatchObject({
        traceId: "trace-mcp",
        metadata: {
          args: { path: "README.md", authorization: "[REDACTED]" },
          resultIncluded: false,
        },
      });
    } finally {
      server.close();
    }
  });

  it("sends idempotency keys for MCP evaluation and telemetry requests", async () => {
    const telemetry: unknown[] = [];
    const evaluations: unknown[] = [];
    const requests: Array<{ url?: string; key?: string }> = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-mcp-keys" }, telemetry, evaluations, requests);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      await request(proxy, { jsonrpc: "2.0", id: "call/key", method: "tools/call", params: { name: "read_file", arguments: { path: "README.md" } } });
      await waitFor(() => telemetry.length > 0);
      proxy.kill();

      expect(requests).toEqual([
        { url: "/api/v1/actions/evaluate", key: "action-evaluate:call%2Fkey" },
        { url: "/api/v1/actions/telemetry", key: "action-telemetry:call%2Fkey:success" },
      ]);
    } finally {
      server.close();
    }
  });

  it("forwards excluded MCP tools without evaluating or reporting telemetry", async () => {
    const telemetry: unknown[] = [];
    const evaluations: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-excluded" }, telemetry, evaluations);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_TOOLS_EXCLUDE: "read_file",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "read_file", arguments: { path: "README.md" } } });
      proxy.kill();
      expect(output.result).toEqual({ content: [{ type: "text", text: "upstream-ok" }] });
      expect(evaluations).toEqual([]);
      expect(telemetry).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("honors numeric false AUREL_ENABLED for MCP tools", async () => {
    const telemetry: unknown[] = [];
    const evaluations: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "block", traceId: "trace-disabled" }, telemetry, evaluations);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_ENABLED: "0",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      proxy.kill();
      expect(output.result).toEqual({ content: [{ type: "text", text: "upstream-ok" }] });
      expect(evaluations).toEqual([]);
      expect(telemetry).toEqual([]);
    } finally {
      server.close();
    }
  });

  it("honors MCP telemetry redaction and payload environment settings", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-mcp-env" }, telemetry);
    const upstream = writeUpstreamServer();
    try {
      const redactionOffProxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_REDACTION_ENABLED: "false",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      await request(redactionOffProxy, { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "read_file", arguments: { path: "README.md", authorization: "Bearer visible" } } });
      await waitFor(() => telemetry.length > 0);
      redactionOffProxy.kill();
      expect(telemetry.at(-1)).toMatchObject({
        metadata: {
          args: { path: "README.md", authorization: "Bearer visible" },
        },
      });

      const boundedProxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_TELEMETRY_MAX_PAYLOAD_BYTES: "1024",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      await request(boundedProxy, { jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "read_file", arguments: { path: "x".repeat(5000) } } });
      await waitFor(() => telemetry.length > 1);
      boundedProxy.kill();
      expect(telemetry.at(-1)).toMatchObject({
        metadata: {
          args: { truncated: true, reason: "payload_limit" },
        },
      });
    } finally {
      server.close();
    }
  });

  it("bounds oversized MCP preflight arguments before sending them to Aurel", async () => {
    const telemetry: unknown[] = [];
    const evaluations: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-mcp-large-preflight" }, telemetry, evaluations);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_MCP_MAX_FRAME_BYTES: String(4 * 1024 * 1024),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      await request(proxy, { jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "terminal", arguments: { command: "x".repeat(2 * 1024 * 1024) } } });
      proxy.kill();
      const evaluation = evaluations[0] as { action: { arguments: { command: string } } };
      expect(new TextEncoder().encode(JSON.stringify(evaluation)).length).toBeLessThan(1024 * 1024);
      expect(evaluation.action.arguments.command).toContain("[truncated]");
    } finally {
      server.close();
    }
  });

  it("bounds total MCP preflight request size while preserving the action envelope", async () => {
    const telemetry: unknown[] = [];
    const evaluations: unknown[] = [];
    const manyLargeFields = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`field_${index}`, "x".repeat(65_536)]));
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-mcp-total-bound" }, telemetry, evaluations);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_MCP_MAX_FRAME_BYTES: String(8 * 1024 * 1024),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      await request(proxy, { jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "terminal", arguments: manyLargeFields } });
      proxy.kill();
      const evaluation = evaluations[0] as { action: { name: string; arguments: unknown } };
      expect(new TextEncoder().encode(JSON.stringify(evaluation)).length).toBeLessThan(1024 * 1024);
      expect(evaluation.action.name).toBe("terminal");
      expect(evaluation.action.arguments).toEqual({ truncated: true, reason: "payload_limit" });
    } finally {
      server.close();
    }
  });

  it("forwards rewritten MCP arguments and reports both original and executed args", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel(
      { decision: "rewrite", traceId: "trace-mcp-rewrite", rewrittenArguments: { command: "pwd" } },
      telemetry
    );
    const upstream = writeEchoUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "terminal", arguments: { command: "rm -rf important-directory", authorization: "Bearer secret" } } });
      await waitFor(() => telemetry.length > 0);
      proxy.kill();
      expect(output.result).toEqual({ content: [{ type: "text", text: "{\"command\":\"pwd\"}" }] });
      expect(telemetry.at(-1)).toMatchObject({
        traceId: "trace-mcp-rewrite",
        metadata: {
          args: { command: "pwd" },
          originalArgs: { command: "rm -rf important-directory", authorization: "[REDACTED]" },
          rewriteApplied: true,
        },
      });
    } finally {
      server.close();
    }
  });

  it("reports MCP approval-required calls as approval requests without forwarding upstream", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "require_approval", traceId: "trace-mcp-approval", riskScore: 71 }, telemetry);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "send_email", arguments: { to: "finance@example.com", token: "secret" } },
      });
      await waitFor(() => telemetry.length > 0);
      proxy.kill();
      expect(readNestedString(output, ["error", "message"])).toContain("human approval");
      expect(telemetry.at(-1)).toMatchObject({
        traceId: "trace-mcp-approval",
        outcome: { status: "approval_requested" },
        metadata: {
          tool: "send_email",
          args: { to: "finance@example.com", token: "[REDACTED]" },
          decision: "require_approval",
          riskScore: 71,
        },
      });
    } finally {
      server.close();
    }
  });

  it("maps legacy MCP flag decisions to approval requests", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "flag", traceId: "trace-mcp-flag", riskScore: 66 }, telemetry);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      try {
        const output = await request(proxy, {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "send_email", arguments: { to: "finance@example.com" } },
        });
        await waitFor(() => telemetry.length > 0);
        expect(readNestedString(output, ["error", "message"])).toContain("human approval");
        expect(telemetry.at(-1)).toMatchObject({
          traceId: "trace-mcp-flag",
          outcome: { status: "approval_requested" },
          metadata: { decision: "require_approval", riskScore: 66 },
        });
      } finally {
        proxy.kill();
      }
    } finally {
      server.close();
    }
  });

  it("keeps prototype-pollution shaped MCP arguments inert in telemetry", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-mcp-proto" }, telemetry);
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const args = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"path":"README.md"}');
      await request(proxy, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read_file", arguments: args } });
      await waitFor(() => telemetry.length > 0);
      proxy.kill();
      const metadata = (telemetry.at(-1) as { metadata: { args: Record<string, unknown> } }).metadata;
      expect(metadata.args).toMatchObject({
        "__proto__": { polluted: true },
        constructor: { prototype: { polluted: true } },
        path: "README.md",
      });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("returns a sanitized parse error for malformed MCP JSON without crashing", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-unused" });
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      try {
        const output = await rawRequest(proxy, "Content-Length: 8\r\n\r\n{\"bad\":}");
        expect(output).toMatchObject({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Invalid MCP message." },
        });
      } finally {
        proxy.kill();
      }
    } finally {
      server.close();
    }
  });

  it("rejects oversized MCP frames before parsing or forwarding", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-unused" });
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000", AUREL_MCP_MAX_FRAME_BYTES: "1024" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      try {
        const output = await rawRequest(proxy, `Content-Length: 1025\r\n\r\n${"x".repeat(1025)}`);
        expect(output).toMatchObject({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Invalid MCP message." },
        });
      } finally {
        proxy.kill();
      }
    } finally {
      server.close();
    }
  });

  it("fails closed when Aurel preflight times out before forwarding upstream", async () => {
    const { server, url } = await hangingAurel();
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "100" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      proxy.kill();
      expect(readNestedString(output, ["error", "message"])).toBe("Aurel security verification is unavailable.");
    } finally {
      server.close();
    }
  });

  it("allows low-risk MCP tools on fail-open Aurel outages", async () => {
    const upstream = writeUpstreamServer();
    const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
      env: { ...process.env, AUREL_API_URL: "http://127.0.0.1:9", AUREL_API_KEY: "test", AUREL_FAIL_MODE: "open", AUREL_TIMEOUT_MS: "100" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const output = await request(proxy, { jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "read_file", arguments: { path: "README.md" } } });
      expect(output.result).toEqual({ content: [{ type: "text", text: "upstream-ok" }] });
    } finally {
      proxy.kill();
    }
  });

  it("blocks privileged MCP tools on fail-open Aurel outages by default", async () => {
    const upstream = writeUpstreamServer();
    const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
      env: { ...process.env, AUREL_API_URL: "http://127.0.0.1:9", AUREL_API_KEY: "test", AUREL_FAIL_MODE: "open", AUREL_TIMEOUT_MS: "100" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const output = await request(proxy, { jsonrpc: "2.0", id: 32, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      expect(readNestedString(output, ["error", "message"])).toBe("Aurel security verification is unavailable.");
    } finally {
      proxy.kill();
    }
  });

  it("can explicitly allow privileged MCP tools on fail-open Aurel outages", async () => {
    const upstream = writeUpstreamServer();
    const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
      env: {
        ...process.env,
        AUREL_API_URL: "http://127.0.0.1:9",
        AUREL_API_KEY: "test",
        AUREL_FAIL_MODE: "open",
        AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS: "allow",
        AUREL_TIMEOUT_MS: "100",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const output = await request(proxy, { jsonrpc: "2.0", id: 33, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      expect(output.result).toEqual({ content: [{ type: "text", text: "upstream-ok" }] });
    } finally {
      proxy.kill();
    }
  });

  it("fails closed on malformed Aurel decision metadata before forwarding upstream", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-bad-metadata", riskScore: 500, ruleIds: "not-an-array" });
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      proxy.kill();
      expect(readNestedString(output, ["error", "message"])).toBe("Aurel security verification is unavailable.");
    } finally {
      server.close();
    }
  });

  it("fails closed on oversized Aurel responses before forwarding upstream", async () => {
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-large", padding: "x".repeat(1024 * 1024) });
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "1000" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      proxy.kill();
      expect(readNestedString(output, ["error", "message"])).toBe("Aurel security verification is unavailable.");
    } finally {
      server.close();
    }
  });

  it("expires stale MCP pending correlations when upstream responds too late", async () => {
    const telemetry: unknown[] = [];
    const { server, url } = await mockAurel({ decision: "allow", traceId: "trace-expired" }, telemetry);
    const upstream = writeDelayedUpstreamServer(1200);
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: {
          ...process.env,
          AUREL_API_URL: url,
          AUREL_API_KEY: "test",
          AUREL_TIMEOUT_MS: "1000",
          AUREL_MCP_PENDING_TTL_MS: "1000",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      try {
        const output = await request(proxy, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "read_file", arguments: { path: "README.md" } } });
        expect(output.result).toEqual({ content: [{ type: "text", text: "delayed-ok" }] });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(telemetry).toEqual([]);
      } finally {
        proxy.kill();
      }
    } finally {
      server.close();
    }
  });

  it("fails closed when Aurel response body stalls after headers", async () => {
    const { server, url } = await bodyStallingAurel();
    const upstream = writeUpstreamServer();
    try {
      const proxy = spawn(process.execPath, [join(process.cwd(), "integrations/mcp/src/aurel-mcp-proxy.mjs"), "--", process.execPath, upstream], {
        env: { ...process.env, AUREL_API_URL: url, AUREL_API_KEY: "test", AUREL_TIMEOUT_MS: "100" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = await request(proxy, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "terminal", arguments: { command: "pwd" } } });
      proxy.kill();
      expect(readNestedString(output, ["error", "message"])).toBe("Aurel security verification is unavailable.");
    } finally {
      server.close();
    }
  });
});

function writeUpstreamServer(): string {
  const dir = mkdtempSync(join(tmpdir(), "aurel-mcp-"));
  const file = join(dir, "upstream.mjs");
  writeFileSync(
    file,
    `
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
  if (headerEnd < 0) return;
  const header = buffer.slice(0, headerEnd).toString("ascii");
  const length = Number(/content-length:\\s*(\\d+)/i.exec(header)[1]);
  const start = headerEnd + 4;
  if (buffer.length < start + length) return;
  const message = JSON.parse(buffer.slice(start, start + length).toString("utf8"));
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "upstream-ok" }] } }));
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
});
`,
    "utf8"
  );
  return file;
}

function writeEchoUpstreamServer(): string {
  const dir = mkdtempSync(join(tmpdir(), "aurel-mcp-"));
  const file = join(dir, "upstream-echo.mjs");
  writeFileSync(
    file,
    `
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
  if (headerEnd < 0) return;
  const header = buffer.slice(0, headerEnd).toString("ascii");
  const length = Number(/content-length:\\s*(\\d+)/i.exec(header)[1]);
  const start = headerEnd + 4;
  if (buffer.length < start + length) return;
  const message = JSON.parse(buffer.slice(start, start + length).toString("utf8"));
  const body = Buffer.from(JSON.stringify({
    jsonrpc: "2.0",
    id: message.id,
    result: { content: [{ type: "text", text: JSON.stringify(message.params.arguments) }] }
  }));
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
});
`,
    "utf8"
  );
  return file;
}

function writeDelayedUpstreamServer(delayMs: number): string {
  const dir = mkdtempSync(join(tmpdir(), "aurel-mcp-"));
  const file = join(dir, "upstream-delayed.mjs");
  writeFileSync(
    file,
    `
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
  if (headerEnd < 0) return;
  const header = buffer.slice(0, headerEnd).toString("ascii");
  const length = Number(/content-length:\\s*(\\d+)/i.exec(header)[1]);
  const start = headerEnd + 4;
  if (buffer.length < start + length) return;
  const message = JSON.parse(buffer.slice(start, start + length).toString("utf8"));
  setTimeout(() => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "delayed-ok" }] } }));
    process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
    process.stdout.write(body);
  }, ${delayMs});
});
`,
    "utf8"
  );
  return file;
}

async function request(child: ReturnType<typeof spawn>, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (!child.stdin || !child.stdout) throw new Error("MCP proxy stdio streams are unavailable");
  const stdout = child.stdout;
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
  let buffer = Buffer.alloc(0);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP proxy")), 3000);
    stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.slice(0, headerEnd).toString("ascii");
      const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1]);
      const start = headerEnd + 4;
      if (!Number.isFinite(length) || buffer.length < start + length) return;
      clearTimeout(timer);
      resolve(JSON.parse(buffer.slice(start, start + length).toString("utf8")));
    });
    child.on("error", reject);
  });
}

async function rawRequest(child: ReturnType<typeof spawn>, frame: string): Promise<Record<string, unknown>> {
  if (!child.stdin || !child.stdout) throw new Error("MCP proxy stdio streams are unavailable");
  const stdout = child.stdout;
  child.stdin.write(frame);
  let buffer = Buffer.alloc(0);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP proxy")), 3000);
    stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.slice(0, headerEnd).toString("ascii");
      const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1]);
      const start = headerEnd + 4;
      if (!Number.isFinite(length) || buffer.length < start + length) return;
      clearTimeout(timer);
      resolve(JSON.parse(buffer.slice(start, start + length).toString("utf8")));
    });
    child.on("error", reject);
  });
}

function readNestedString(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

async function mockAurel(
  decision: Record<string, unknown>,
  telemetry: unknown[] = [],
  evaluations: unknown[] = [],
  requests: Array<{ url?: string; key?: string }> = []
): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    requests.push({ url: req.url, key: req.headers["idempotency-key"]?.toString() });
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (req.url?.endsWith("/telemetry")) {
        telemetry.push(body);
      } else {
        evaluations.push(body);
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url?.endsWith("/telemetry") ? { accepted: true } : decision));
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

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
