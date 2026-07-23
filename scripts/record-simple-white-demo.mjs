import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";

const bundledNodeModules =
  "D:/Users/adamg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const bundledPlaywrightNodeModules = `${bundledNodeModules}/.pnpm/playwright@1.61.1/node_modules`;
const bundledPlaywrightCoreNodeModules = `${bundledNodeModules}/.pnpm/playwright-core@1.61.1/node_modules`;

process.env.NODE_PATH = [
  bundledNodeModules,
  bundledPlaywrightNodeModules,
  bundledPlaywrightCoreNodeModules,
  process.env.NODE_PATH,
]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

const require = createRequire(import.meta.url);
const { chromium } = require(`${bundledPlaywrightNodeModules}/playwright`);

const root = process.cwd();
const outputDir = path.join(root, "outputs", "simple-white-demo");
const rawDir = path.join(outputDir, "raw");
const htmlFile = path.join(outputDir, "index.html");
const finalVideo = path.join(outputDir, "aurel-simple-white-demo.webm");
const browserExecutableCandidates = [
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

async function findBrowserExecutable() {
  for (const candidate of browserExecutableCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser path.
    }
  }
  return undefined;
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.rm(finalVideo, { force: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: await findBrowserExecutable(),
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: rawDir,
      size: { width: 1600, height: 900 },
    },
  });

  const page = await context.newPage();
  await page.goto(pathToFileURL(htmlFile).toString(), { waitUntil: "load" });
  await page.waitForFunction(() => document.body.dataset.done === "true", undefined, {
    timeout: 70_000,
  });
  await page.waitForTimeout(1000);

  const video = page.video();
  await context.close();
  await browser.close();

  const rawVideo = await video.path();
  await fs.copyFile(rawVideo, finalVideo);
  const stats = await fs.stat(finalVideo);
  console.log(JSON.stringify({ finalVideo, bytes: stats.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
