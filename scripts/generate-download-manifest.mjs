#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputDir = resolve("outputs");
const manifestPath = resolve(outputDir, "aurel-downloads-manifest.json");
const artifacts = [
  "aurel-agent-integrations.zip",
  "aurel-codex-plugin.zip",
  "aurel-hermes-plugin.zip",
  "aurel-crewai-integration.zip",
  "aurel-openclaw-plugin-0.1.0.tgz",
];

await mkdir(dirname(manifestPath), { recursive: true });

const entries = [];
for (const file of artifacts) {
  const path = resolve(outputDir, file);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) continue;

  entries.push({
    file,
    size_bytes: info.size,
    sha256: await sha256File(path),
  });
}

const manifest = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  artifacts: entries.sort((a, b) => a.file.localeCompare(b.file)),
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifestPath} with ${manifest.artifacts.length} artifacts`);

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}
