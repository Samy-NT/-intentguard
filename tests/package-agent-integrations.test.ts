import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("agent integrations package", () => {
  it("contains the shared protocol adapters, primary plugins, next integrations, and harness", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "aurel-agent-integrations-"));
    const archive = join(tempDir, "agent-integrations.zip");

    try {
      execFileSync("npm", ["run", "package:agent-integrations"], {
        cwd: process.cwd(),
        env: { ...process.env, AUREL_AGENT_INTEGRATIONS_ARCHIVE: archive },
        shell: process.platform === "win32",
        stdio: "ignore",
      });

      const listing = execFileSync(
        "tar",
        ["-tf", process.platform === "win32" ? archive.replaceAll("\\", "/") : archive, ...tarForceLocalFlags()],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          shell: process.platform === "win32",
        }
      );

      for (const expected of [
        "integrations/shared/typescript/aurel-tool-guard.ts",
        "integrations/openclaw/openclaw.plugin.json",
        "integrations/hermes/plugin.yaml",
        "integrations/openai-agents/src/index.ts",
        "integrations/langgraph/src/index.ts",
        "integrations/claude-code/hooks/aurel-hook.mjs",
        "integrations/mcp/src/aurel-mcp-proxy.mjs",
        "integrations/crewai/aurel_crewai/guard.py",
        "integrations/codex/aurel-codex-plugin/.codex-plugin/plugin.json",
        "integrations/dev-harness/mock-aurel-server.mjs",
        "docs/AGENT_INTEGRATIONS.md",
      ]) {
        expect(listing).toContain(expected);
      }

      expect(listing).not.toMatch(/__pycache__|\.pyc|\.tsbuildinfo|node_modules|(^|\/)\.env($|\.)/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function tarForceLocalFlags(): string[] {
  if (process.platform !== "win32") return [];
  const help = execFileSync("tar", ["--help"], { encoding: "utf8", shell: true });
  return help.includes("--force-local") ? ["--force-local"] : [];
}
