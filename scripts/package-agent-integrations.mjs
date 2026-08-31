#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const archivePath = resolve(process.env.AUREL_AGENT_INTEGRATIONS_ARCHIVE ?? "outputs/aurel-agent-integrations.zip");
mkdirSync(dirname(archivePath), { recursive: true });

// On Windows, GNU tar parses "C:\..." archive paths as host:path. Prefer a
// forward-slash absolute path, and only pass --force-local to tar builds that
// advertise it.
const tarArchivePath = process.platform === "win32" ? archivePath.replaceAll("\\", "/") : archivePath;
const tarFlags = process.platform === "win32" && tarSupportsForceLocal() ? ["--force-local"] : [];

execFileSync(
  "tar",
  [
    "--exclude=__pycache__",
    "--exclude=*.pyc",
    "--exclude=*.tsbuildinfo",
    "--exclude=node_modules",
    "--exclude=.env",
    "--exclude=.env.*",
    ...tarFlags,
    "-acf",
    tarArchivePath,
    "integrations/shared",
    "integrations/openclaw",
    "integrations/hermes",
    "integrations/openai-agents",
    "integrations/langgraph",
    "integrations/claude-code",
    "integrations/mcp",
    "integrations/crewai",
    "integrations/codex",
    "integrations/dev-harness",
    "docs/AGENT_INTEGRATIONS.md",
  ],
  { cwd: process.cwd(), stdio: "inherit" }
);

function tarSupportsForceLocal() {
  const result = spawnSync("tar", ["--help"], { encoding: "utf8" });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.includes("--force-local");
}
