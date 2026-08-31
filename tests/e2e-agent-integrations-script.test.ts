import { exec } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

describe("agent integrations E2E runner", () => {
  it("is wired into npm and proves protected MCP calls end to end", async () => {
    const { stdout } = await execAsync("npm run test:e2e:agent-integrations", {
      cwd: process.cwd(),
      timeout: 20_000,
    });

    expect(stdout).toContain("PASS allow forwarded upstream");
    expect(stdout).toContain("PASS block stopped before upstream");
    expect(stdout).toContain("PASS approval stopped before upstream");
    expect(stdout).toContain("PASS rewrite forwarded rewritten arguments");
    expect(stdout).toContain("PASS fail-closed outage stopped before upstream");
    expect(stdout).toContain("PASS OpenClaw full agent loop blocked before tool execution");
    expect(stdout).toContain("PASS Hermes full agent loop blocked before tool execution");
    expect(stdout).toContain("PASS prompt injection blocked before action execution");
  });
});
