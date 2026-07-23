import fs from "node:fs/promises";
import path from "node:path";
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

function loadPlaywright() {
  const candidates = [
    "playwright",
    `${bundledNodeModules}/playwright`,
    `${bundledPlaywrightNodeModules}/playwright`,
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      console.warn(`Could not load ${candidate}: ${error.message}`);
    }
  }

  throw new Error("Playwright is not available in local or bundled node_modules.");
}

const { chromium } = loadPlaywright();

const root = process.cwd();
const outputDir = path.join(root, "outputs", "loom-demo");
const rawDir = path.join(outputDir, "raw");
const finalVideo = path.join(outputDir, "aurel-loom-demo.webm");
const browserExecutableCandidates = [
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setCaption(page, kicker, title, body) {
  await page.evaluate(
    ({ kicker, title, body }) => {
      let el = document.querySelector("#loom-caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "loom-caption";
        el.innerHTML = `
          <div class="loom-caption-kicker"></div>
          <div class="loom-caption-title"></div>
          <div class="loom-caption-body"></div>
        `;
        document.body.appendChild(el);

        const style = document.createElement("style");
        style.id = "loom-caption-style";
        style.textContent = `
          #loom-caption {
            position: fixed;
            left: 28px;
            bottom: 28px;
            width: min(720px, calc(100vw - 56px));
            z-index: 999999;
            padding: 20px 22px;
            background: rgba(8, 9, 14, 0.90);
            border: 1px solid rgba(124, 106, 245, 0.45);
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(14px);
            color: #eef2ff;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            border-radius: 8px;
          }
          .loom-caption-kicker {
            color: #9ca3af;
            font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            margin-bottom: 8px;
          }
          .loom-caption-title {
            color: #c5d5ff;
            font-size: 30px;
            line-height: 1.1;
            font-weight: 800;
            letter-spacing: 0;
            margin-bottom: 8px;
          }
          .loom-caption-body {
            color: #cbd5e1;
            font-size: 17px;
            line-height: 1.45;
            letter-spacing: 0;
          }
        `;
        document.head.appendChild(style);
      }

      el.querySelector(".loom-caption-kicker").textContent = kicker;
      el.querySelector(".loom-caption-title").textContent = title;
      el.querySelector(".loom-caption-body").textContent = body;
    },
    { kicker, title, body }
  );
}

async function clickScenario(page, name) {
  await page.getByRole("button", { name }).click();
  await sleep(700);
  await page.getByRole("button", { name: /submit verification/i }).click();
}

async function waitForDecision(page, decision) {
  await page.getByText(new RegExp(`\\b${decision}\\b`, "i")).last().waitFor({ timeout: 25_000 });
  await sleep(2200);
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });
  await fs.rm(finalVideo, { force: true });

  const browserExecutablePath = (
    await Promise.all(
      browserExecutableCandidates.map(async (candidate) => {
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          return null;
        }
      })
    )
  ).find(Boolean);

  const browser = await chromium.launch({
    headless: true,
    ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {}),
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
  page.setDefaultTimeout(30_000);

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await setCaption(
    page,
    "0:00 - Intro",
    "Aurel protects agentic payments",
    "A runtime intent firewall between an AI agent and the payment rail."
  );
  await sleep(5500);

  await setCaption(
    page,
    "0:15 - Problem",
    "AI agents can execute the wrong payment",
    "Payment requests can be manipulated by prompt injection, suspicious context, risky recipients, or mission drift."
  );
  await sleep(6500);

  await page.getByRole("link", { name: "Demo" }).click();
  await sleep(1200);
  await setCaption(
    page,
    "0:45 - Solution",
    "Three layers before money moves",
    "Aurel checks deterministic rules, velocity behavior, and semantic intent before returning allow, flag, or block."
  );
  await sleep(5000);

  await setCaption(
    page,
    "1:10 - Safe intent",
    "Legitimate SaaS payment",
    "A normal Stripe renewal is within scope, below policy limits, and safe to execute."
  );
  await clickScenario(page, "legitimate");
  await waitForDecision(page, "allow");

  await setCaption(
    page,
    "1:45 - Semantic risk",
    "Suspicious intent gets flagged",
    "Aurel identifies manipulated context and mission drift, then routes the payment to human review."
  );
  await clickScenario(page, "anomaly");
  await waitForDecision(page, "flag");

  await setCaption(
    page,
    "2:20 - Hard block",
    "Policy violations stop execution",
    "A denylisted recipient is blocked before any semantic model call is needed."
  );
  await clickScenario(page, "injection");
  await waitForDecision(page, "block");

  await setCaption(
    page,
    "2:55 - Auditability",
    "Every decision is explainable",
    "The dashboard records risk score, triggered layer, timing, hashes, policy version, and execution node."
  );
  await sleep(6500);

  await setCaption(
    page,
    "3:25 - Pilot",
    "Start with one controlled workflow",
    "A focused pilot can validate policy coverage, review quality, auditability, and confidence before broader deployment."
  );
  await sleep(6500);

  await setCaption(
    page,
    "Close",
    "Aurel makes agentic payments controlled",
    "Allow safe payments. Flag uncertain ones. Block dangerous execution before money moves."
  );
  await sleep(5000);

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
