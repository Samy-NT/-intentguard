import { isAbsolute, relative, resolve } from "node:path";

export type DownloadArtifact = {
  label: string;
  type: string;
  path: string;
};

export type DownloadManifest = {
  label: string;
  type: string;
  path: string;
};

export const DOWNLOAD_MANIFEST_FILE = "aurel-downloads-manifest.json";

const DOWNLOADS: Record<string, { label: string; type: string }> = {
  "aurel-agent-integrations.zip": {
    label: "aurel-agent-integrations.zip",
    type: "application/zip",
  },
  "aurel-codex-plugin.zip": {
    label: "aurel-codex-plugin.zip",
    type: "application/zip",
  },
  "aurel-hermes-plugin.zip": {
    label: "aurel-hermes-plugin.zip",
    type: "application/zip",
  },
  "aurel-crewai-integration.zip": {
    label: "aurel-crewai-integration.zip",
    type: "application/zip",
  },
  "aurel-openclaw-plugin-0.1.0.tgz": {
    label: "aurel-openclaw-plugin-0.1.0.tgz",
    type: "application/gzip",
  },
};

function isSubpath(baseDir: string, candidate: string): boolean {
  const rel = relative(baseDir, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveDownloadArtifact(file: string, cwd = process.cwd()): DownloadArtifact | null {
  const download = DOWNLOADS[file];
  if (!download) return null;

  const outputDir = resolve(cwd, "outputs");
  const path = resolve(outputDir, file);
  if (!isSubpath(outputDir, path)) return null;

  return {
    ...download,
    path,
  };
}

export function listDownloadArtifacts(): Array<DownloadArtifact> {
  return Object.keys(DOWNLOADS).map((file) => resolveDownloadArtifact(file)).filter((item): item is DownloadArtifact => item !== null);
}

export function resolveDownloadManifest(cwd = process.cwd()): DownloadManifest {
  const outputDir = resolve(cwd, "outputs");
  const path = resolve(outputDir, DOWNLOAD_MANIFEST_FILE);

  if (!isSubpath(outputDir, path)) {
    throw new Error("Download manifest path resolved outside outputs");
  }

  return {
    label: DOWNLOAD_MANIFEST_FILE,
    type: "application/json",
    path,
  };
}
