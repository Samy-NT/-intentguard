import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("download artifact verifier", () => {
  it("accepts manifest hashes for archives without blocked paths", () => {
    const cwd = workspace("aurel-artifacts-safe-");
    try {
      mkdirSync(join(cwd, "pkg"), { recursive: true });
      writeFileSync(join(cwd, "pkg", "README.md"), "safe artifact");
      execFileSync("tar", [...tarForceLocalFlags(), "-acf", tarPath(join(cwd, "outputs", "aurel-agent-integrations.zip")), "-C", join(cwd, "pkg"), "README.md"], {
        cwd,
        shell: process.platform === "win32",
      });
      writeManifest(cwd, "aurel-agent-integrations.zip");

      const result = spawnSync("node", [resolve(process.cwd(), "scripts", "verify-download-artifacts.mjs")], {
        cwd,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Verified 1 download artifacts");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects archives that contain blocked secret paths", () => {
    const cwd = workspace("aurel-artifacts-blocked-");
    try {
      mkdirSync(join(cwd, "pkg"), { recursive: true });
      writeFileSync(join(cwd, "pkg", ".env"), "SECRET=value");
      execFileSync("tar", [...tarForceLocalFlags(), "-acf", tarPath(join(cwd, "outputs", "aurel-agent-integrations.zip")), "-C", join(cwd, "pkg"), ".env"], {
        cwd,
        shell: process.platform === "win32",
      });
      writeManifest(cwd, "aurel-agent-integrations.zip");

      const result = spawnSync("node", [resolve(process.cwd(), "scripts", "verify-download-artifacts.mjs")], {
        cwd,
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("contains blocked paths");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function workspace(prefix: string): string {
  const cwd = join(tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(cwd, "outputs"), { recursive: true });
  return cwd;
}

function writeManifest(cwd: string, file: string): void {
  const path = join(cwd, "outputs", file);
  const content = readFileSync(path);
  const manifest = {
    schema_version: 1,
    generated_at: "2026-09-01T00:00:00.000Z",
    artifacts: [
      {
        file,
        size_bytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    ],
  };
  writeFileSync(join(cwd, "outputs", "aurel-downloads-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function tarPath(path: string): string {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

function tarForceLocalFlags(): string[] {
  if (process.platform !== "win32") return [];
  const help = execFileSync("tar", ["--help"], { encoding: "utf8", shell: true });
  return help.includes("--force-local") ? ["--force-local"] : [];
}
