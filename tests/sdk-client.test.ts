import { describe, expect, it } from "vitest";
import { AurelProtocolError, AurelTimeoutError, createAurelClient } from "@/lib/sdk";

describe("Aurel SDK action client hardening", () => {
  it("rejects non-http API URLs", () => {
    expect(() => createAurelClient({ apiKey: "test", baseUrl: "file:///tmp/aurel" })).toThrow("http or https");
  });

  it("rejects API URLs with embedded credentials", () => {
    expect(() => createAurelClient({ apiKey: "test", baseUrl: "https://user:pass@example.com" })).toThrow("must not contain credentials");
  });

  it("clamps invalid timeout values to a safe timeout", async () => {
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      timeoutMs: 0,
      fetchImpl: async () => new Promise<Response>(() => undefined),
    });
    await expect(
      client.evaluateAction({
        version: "1",
        integration: "test",
        action: { id: "act", name: "read_file", arguments: {} },
        agent: {},
        timestamp: new Date().toISOString(),
      })
    ).rejects.toBeInstanceOf(AurelTimeoutError);
  });

  it("times out if the Aurel response body stalls after headers", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"decision":'));
      },
    });
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      timeoutMs: 100,
      fetchImpl: async () => new Response(stream, { status: 200, headers: { "content-type": "application/json" } }),
    });

    await expect(
      client.evaluateAction({
        version: "1",
        integration: "test",
        action: { id: "act", name: "read_file", arguments: {} },
        agent: {},
        timestamp: new Date().toISOString(),
      })
    ).rejects.toBeInstanceOf(AurelTimeoutError);
  });

  it("strips query strings and fragments from the Aurel base URL", async () => {
    const seen: string[] = [];
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test/base?token=secret#fragment",
      fetchImpl: async (input) => {
        seen.push(String(input));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "read_file", arguments: {} },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(seen[0]).toBe("https://aurel.test/base/api/v1/actions/evaluate");
  });

  it("sends deterministic idempotency keys for action evaluation and telemetry", async () => {
    const seen: Array<{ url: string; key: string | null }> = [];
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        seen.push({ url: String(input), key: headers.get("idempotency-key") });
        return new Response(JSON.stringify(String(input).endsWith("/telemetry") ? { accepted: true } : { decision: "allow" }), {
          status: 200,
        });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act/1", name: "read_file", arguments: {} },
      agent: {},
      timestamp: new Date().toISOString(),
    });
    await client.recordActionTelemetry({
      version: "1",
      integration: "test",
      actionId: "act/1",
      outcome: { status: "success" },
      timestamp: new Date().toISOString(),
    });

    expect(seen).toEqual([
      { url: "https://aurel.test/api/v1/actions/evaluate", key: "action-evaluate:act%2F1" },
      { url: "https://aurel.test/api/v1/actions/telemetry", key: "action-telemetry:act%2F1:success" },
    ]);
  });

  it("rejects malformed Aurel decision metadata", async () => {
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async () =>
        new Response(JSON.stringify({ decision: "allow", riskScore: 500, ruleIds: "not-an-array" }), {
          status: 200,
        }),
    });

    await expect(
      client.evaluateAction({
        version: "1",
        integration: "test",
        action: { id: "act", name: "read_file", arguments: {} },
        agent: {},
        timestamp: new Date().toISOString(),
      })
    ).rejects.toBeInstanceOf(AurelProtocolError);
  });

  it("rejects oversized Aurel JSON responses before accepting a decision", async () => {
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async () =>
        new Response(JSON.stringify({ decision: "allow", padding: "x".repeat(1024 * 1024) }), {
          status: 200,
        }),
    });

    await expect(
      client.evaluateAction({
        version: "1",
        integration: "test",
        action: { id: "act", name: "read_file", arguments: {} },
        agent: {},
        timestamp: new Date().toISOString(),
      })
    ).rejects.toBeInstanceOf(AurelProtocolError);
  });

  it("serializes circular action arguments without mutating the caller input", async () => {
    const seenBodies: string[] = [];
    const circular: Record<string, unknown> = { command: "pwd" };
    circular.self = circular;
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "terminal", arguments: circular },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(circular.self).toBe(circular);
    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({ command: "pwd", self: "[Circular]" });
  });

  it("preserves repeated non-circular action argument references", async () => {
    const seenBodies: string[] = [];
    const shared = { path: "README.md" };
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "read_file", arguments: { first: shared, second: shared } },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({
      first: { path: "README.md" },
      second: { path: "README.md" },
    });
  });

  it("serializes throwing action argument accessors as inert values", async () => {
    const seenBodies: string[] = [];
    const args: Record<string, unknown> = { command: "pwd" };
    Object.defineProperty(args, "token", {
      enumerable: true,
      get() {
        throw new Error("getter should not escape");
      },
    });
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "terminal", arguments: args },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({
      command: "pwd",
      token: "[UnserializableProperty]",
    });
  });

  it("serializes throwing action argument enumeration as an inert object", async () => {
    const seenBodies: string[] = [];
    const args = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("ownKeys should not escape");
        },
      }
    );
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "terminal", arguments: args },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toBe("[UnserializableObject]");
  });

  it("bounds oversized action arguments before sending Aurel preflight", async () => {
    const seenBodies: string[] = [];
    const giant = "x".repeat(2 * 1024 * 1024);
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "terminal", arguments: { command: giant } },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(new TextEncoder().encode(seenBodies[0]).length).toBeLessThan(1024 * 1024);
    expect(JSON.parse(seenBodies[0]).action.arguments.command).toContain("[truncated]");
  });

  it("bounds total Aurel preflight request size while preserving the action envelope", async () => {
    const seenBodies: string[] = [];
    const manyLargeFields = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`field_${index}`, "x".repeat(65_536)]));
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act-total-bound", name: "terminal", arguments: manyLargeFields },
      agent: { id: "agent-1" },
      timestamp: new Date().toISOString(),
    });

    const sent = JSON.parse(seenBodies[0]);
    expect(new TextEncoder().encode(seenBodies[0]).length).toBeLessThan(1024 * 1024);
    expect(sent.action).toMatchObject({ id: "act-total-bound", name: "terminal" });
    expect(sent.agent).toEqual({ id: "agent-1" });
    expect(sent.action.arguments).toEqual({ truncated: true, reason: "payload_limit" });
  });

  it("preserves non-finite action numbers as explicit markers", async () => {
    const seenBodies: string[] = [];
    const client = createAurelClient({
      apiKey: "test",
      baseUrl: "https://aurel.test",
      fetchImpl: async (_input, init) => {
        seenBodies.push(String(init?.body));
        return new Response(JSON.stringify({ decision: "allow" }), { status: 200 });
      },
    });

    await client.evaluateAction({
      version: "1",
      integration: "test",
      action: { id: "act", name: "terminal", arguments: { risk: Number.NaN, limit: Number.POSITIVE_INFINITY } },
      agent: {},
      timestamp: new Date().toISOString(),
    });

    expect(JSON.parse(seenBodies[0]).action.arguments).toEqual({
      risk: "[NonFiniteNumber]",
      limit: "[NonFiniteNumber]",
    });
  });
});
