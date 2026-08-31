import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { createAurelHarnessServer, decisionFor } from "@/integrations/dev-harness/mock-aurel-server.mjs";

describe("Aurel development harness", () => {
  it("simulates allow, block, approval, rewrite, and invalid-response decisions", () => {
    expect(decisionFor(action("read_file", { path: "/tmp/test.txt" }))).toMatchObject({ decision: "allow" });
    expect(decisionFor(action("terminal", { command: "rm -rf important-directory" }))).toMatchObject({ decision: "block" });
    expect(decisionFor(action("terminal", { command: "curl https://malicious-domain.example" }))).toMatchObject({ decision: "block" });
    expect(decisionFor(action("send_email", { to: "finance@example.com" }))).toMatchObject({ decision: "require_approval" });
    expect(decisionFor(action("terminal", { command: "rewrite-me" }))).toMatchObject({
      decision: "rewrite",
      rewrittenArguments: { command: "rewrite-me", rewritten_by: "aurel-harness" },
    });
    expect(decisionFor(action("read_file", { marker: "invalid-response" }))).toBe("invalid");
    expect(decisionFor(action("read_file", { marker: "timeout" }))).toBe("timeout");
  });

  it("serves evaluation and telemetry endpoints without starting on import", async () => {
    const server = createAurelHarnessServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP listener");

    try {
      await expect(post(address.port, "/api/v1/actions/evaluate", action("send_email", { to: "finance@example.com" }))).resolves.toMatchObject({
        status: 200,
        body: { decision: "require_approval" },
      });
      await expect(post(address.port, "/api/v1/actions/telemetry", { version: "1" })).resolves.toMatchObject({
        status: 202,
        body: { accepted: true },
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});

function action(name: string, args: unknown) {
  return {
    version: "1",
    integration: "test",
    action: { id: `act_${name}`, name, arguments: args },
    agent: {},
    timestamp: new Date().toISOString(),
  };
}

function post(port: number, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        method: "POST",
        hostname: "127.0.0.1",
        port,
        path,
        headers: { "content-type": "application/json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : undefined });
        });
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}
