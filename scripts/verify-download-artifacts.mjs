#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const outputDir = resolve("outputs");
const manifestPath = resolve(outputDir, "aurel-downloads-manifest.json");
const blockedPathPattern = /(^|\/)(?:\.env(?:\.|$)|node_modules|__pycache__|\.git)(?:\/|$)|\.pyc$|\.tsbuildinfo$/;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schema_version !== 1 || !Array.isArray(manifest.artifacts)) {
  throw new Error("Download manifest must use schema_version 1 and an artifacts array");
}

for (const artifact of manifest.artifacts) {
  validateManifestEntry(artifact);
  const path = resolve(outputDir, artifact.file);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`${artifact.file} is not a regular file`);
  if (info.size !== artifact.size_bytes) {
    throw new Error(`${artifact.file} size mismatch: expected ${artifact.size_bytes}, got ${info.size}`);
  }

  const actualSha256 = await sha256File(path);
  if (actualSha256 !== artifact.sha256) {
    throw new Error(`${artifact.file} sha256 mismatch: expected ${artifact.sha256}, got ${actualSha256}`);
  }

  const listing = execFileSync("tar", [...tarForceLocalFlags(), "-tf", tarPath(path)], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const unsafe = listing
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((entry) => entry.includes("..") || blockedPathPattern.test(entry));
  if (unsafe.length > 0) {
    throw new Error(`${artifact.file} contains blocked paths: ${unsafe.join(", ")}`);
  }
}

console.log(`Verified ${manifest.artifacts.length} download artifacts`);

function validateManifestEntry(value) {
  if (!value || typeof value !== "object") throw new Error("Manifest artifact entry must be an object");
  if (typeof value.file !== "string" || !/^[a-z0-9][a-z0-9._-]+\.(?:zip|tgz)$/.test(value.file)) {
    throw new Error(`Invalid manifest artifact file: ${String(value.file)}`);
  }
  if (!Number.isSafeInteger(value.size_bytes) || value.size_bytes <= 0) {
    throw new Error(`${value.file} must declare a positive size_bytes value`);
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error(`${value.file} must declare a lowercase SHA-256 hash`);
  }
}

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function tarPath(path) {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

function tarForceLocalFlags() {
  if (process.platform !== "win32") return [];
  const help = execFileSync("tar", ["--help"], { encoding: "utf8", shell: true });
  return help.includes("--force-local") ? ["--force-local"] : [];
}
