import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const launcherPath = join(process.cwd(), "integrations/codex/aurel-codex-plugin/scripts/aurel-protected-mcp.mjs");

describe("Codex Aurel MCP launcher", () => {
  it("can be imported without requiring runtime MCP environment variables", () => {
    const result = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(pathToFileURL(launcherPath).href)})`], {
      encoding: "utf8",
      env: cleanEnv(),
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("builds proxy launch arguments from JSON encoded upstream args", async () => {
    const result = runLauncherExpression(`
      const launch = mod.buildProxyLaunch({
        AUREL_UPSTREAM_MCP_COMMAND: "npx",
        AUREL_UPSTREAM_MCP_ARGS: JSON.stringify(["some-mcp-server", "--flag", "value with spaces"]),
        AUREL_MCP_PROXY_PATH: "proxy.mjs",
      });
      console.log(JSON.stringify(launch));
    `);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      proxyPath: "proxy.mjs",
      command: "npx",
      args: ["some-mcp-server", "--flag", "value with spaces"],
      argv: ["proxy.mjs", "--", "npx", "some-mcp-server", "--flag", "value with spaces"],
    });
  });

  it("rejects missing upstream command with a sanitized configuration error", async () => {
    const result = runLauncherExpression(`
      try {
        mod.buildProxyLaunch({});
      } catch (error) {
        console.log(error instanceof Error ? error.message : String(error));
        process.exit(0);
      }
      process.exit(1);
    `);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("AUREL_UPSTREAM_MCP_COMMAND is required");
  });
});

function runLauncherExpression(expression: string) {
  return spawnSync(
    process.execPath,
    [
      "-e",
      `
        const mod = await import(${JSON.stringify(pathToFileURL(launcherPath).href)});
        ${expression}
      `,
    ],
    { encoding: "utf8", env: cleanEnv() }
  );
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.AUREL_UPSTREAM_MCP_COMMAND;
  delete env.AUREL_UPSTREAM_MCP_ARGS;
  delete env.AUREL_MCP_PROXY_PATH;
  return env;
}
