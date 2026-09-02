import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { NextRequest } from "next/server";
import { GET } from "@/app/api/downloads/[file]/route";
import { GET as getManifest } from "@/app/api/downloads/manifest/route";
import { resolveDownloadArtifact, resolveDownloadManifest } from "@/lib/downloads";

describe("download artifacts", () => {
  it("resolves only known artifacts under outputs", () => {
    const artifact = resolveDownloadArtifact("aurel-agent-integrations.zip", "/repo");

    expect(artifact).toMatchObject({
      label: "aurel-agent-integrations.zip",
      type: "application/zip",
      path: resolve("/repo", "outputs", "aurel-agent-integrations.zip"),
    });
  });

  it("rejects traversal and unknown files", () => {
    expect(resolveDownloadArtifact("../.env", "/repo")).toBeNull();
    expect(resolveDownloadArtifact("..%2F.env", "/repo")).toBeNull();
    expect(resolveDownloadArtifact("aurel-agent-integrations.zip/../.env", "/repo")).toBeNull();
    expect(resolveDownloadArtifact("unknown.zip", "/repo")).toBeNull();
  });

  it("resolves the download manifest under outputs", () => {
    const manifest = resolveDownloadManifest("/repo");

    expect(manifest).toMatchObject({
      label: "aurel-downloads-manifest.json",
      type: "application/json",
      path: resolve("/repo", "outputs", "aurel-downloads-manifest.json"),
    });
  });

  it("streams known artifacts with download-safe headers", async () => {
    const previousCwd = process.cwd();
    const cwd = await mkdtemp(resolve(tmpdir(), "aurel-downloads-"));
    await mkdir(resolve(cwd, "outputs"));
    await writeFile(resolve(cwd, "outputs", "aurel-agent-integrations.zip"), "artifact");

    try {
      process.chdir(cwd);
      const response = await GET(new Request("http://localhost/api/downloads/aurel-agent-integrations.zip") as NextRequest, {
        params: Promise.resolve({ file: "aurel-agent-integrations.zip" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/zip");
      expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="aurel-agent-integrations.zip"');
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("returns 404 for unknown download route params", async () => {
    const response = await GET(new Request("http://localhost/api/downloads/unknown.zip") as NextRequest, {
      params: Promise.resolve({ file: "unknown.zip" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Unknown download" });
  });

  it("serves the generated manifest with download-safe headers", async () => {
    const previousCwd = process.cwd();
    const cwd = await mkdtemp(resolve(tmpdir(), "aurel-downloads-"));
    await mkdir(resolve(cwd, "outputs"));
    await writeFile(
      resolve(cwd, "outputs", "aurel-downloads-manifest.json"),
      JSON.stringify({ schema_version: 1, artifacts: [] })
    );

    try {
      process.chdir(cwd);
      const response = await getManifest();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(await response.json()).toMatchObject({ schema_version: 1, artifacts: [] });
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("generates a deterministic SHA-256 manifest for built artifacts", async () => {
    const cwd = await mkdtemp(resolve(tmpdir(), "aurel-downloads-"));
    const script = resolve(process.cwd(), "scripts", "generate-download-manifest.mjs");
    await mkdir(resolve(cwd, "outputs"));
    await writeFile(resolve(cwd, "outputs", "aurel-agent-integrations.zip"), "artifact");
    await writeFile(resolve(cwd, "outputs", "aurel-codex-plugin.zip"), "codex");

    execFileSync("node", [script], { cwd, stdio: "ignore" });

    const manifest = JSON.parse(await readFile(resolve(cwd, "outputs", "aurel-downloads-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      schema_version: 1,
      artifacts: [
        {
          file: "aurel-agent-integrations.zip",
          size_bytes: 8,
          sha256: createHash("sha256").update("artifact").digest("hex"),
        },
        {
          file: "aurel-codex-plugin.zip",
          size_bytes: 5,
          sha256: createHash("sha256").update("codex").digest("hex"),
        },
      ],
    });
  });
});
