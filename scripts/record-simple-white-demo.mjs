import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { assertReadableFile, findBrowserExecutable } from "./demo-recorder-utils.mjs";

const root = process.cwd();
const outputDir = path.join(root, "outputs", "simple-white-demo");
const rawDir = path.join(outputDir, "raw");
const htmlFile = path.join(root, "docs", "loom-demo", "simple-white-demo.html");
const finalVideo = path.join(outputDir, "aurel-simple-white-demo.webm");
const mixedVideo = path.join(outputDir, "aurel-simple-white-demo-with-music.webm");
const runCommand = promisify(execFile);

async function addBackgroundMusic(videoFile) {
  // A small synthetic pulse keeps the demo self-contained and safe to publish.
  const musicFilter = [
    "[1:a]volume=0.055[pad]",
    "[2:a]volume=0.095,tremolo=f=2:d=0.85[pulse]",
    "[3:a]volume=0.05,tremolo=f=1:d=0.75[click]",
    "[pad][pulse][click]amix=inputs=3:normalize=0,afade=t=in:st=0:d=1.5,afade=t=out:st=62:d=3[music]",
  ].join(";");

  await fs.rm(mixedVideo, { force: true });
  await runCommand("ffmpeg", [
    "-y",
    "-i", videoFile,
    "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100:duration=67",
    "-f", "lavfi", "-i", "sine=frequency=329.63:sample_rate=44100:duration=67",
    "-f", "lavfi", "-i", "sine=frequency=659.25:sample_rate=44100:duration=67",
    "-filter_complex", musicFilter,
    "-map", "0:v:0",
    "-map", "[music]",
    "-c:v", "copy",
    "-c:a", "libopus",
    "-b:a", "96k",
    "-shortest",
    mixedVideo,
  ]);
  await fs.rename(mixedVideo, videoFile);
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.rm(finalVideo, { force: true });
  await assertReadableFile(htmlFile, "White demo HTML");

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
  await addBackgroundMusic(finalVideo);
  const stats = await fs.stat(finalVideo);
  console.log(JSON.stringify({ finalVideo, bytes: stats.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
