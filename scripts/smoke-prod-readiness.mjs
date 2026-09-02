#!/usr/bin/env node

const baseUrl = (process.env.AUREL_SMOKE_BASE_URL || process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const strict = process.argv.includes("--strict") || process.env.AUREL_SMOKE_STRICT === "true";
const bearer = process.env.AUREL_SMOKE_BEARER || process.env.CRON_SECRET;
const smokeOrigin =
  process.env.AUREL_SMOKE_ORIGIN ||
  process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).find(Boolean) ||
  "https://agent.example.com";

const checks = [
  { name: "health", path: "/api/health", expect: [200] },
  { name: "readiness", path: "/api/v1/readiness", expect: strict ? [200] : [200, 503] },
  { name: "mandates_page", path: "/dashboard/mandates", expect: [200] },
  { name: "mandates_auth", path: "/api/v1/mandates", expect: [401] },
  { name: "ops_status_auth", path: "/api/v1/workspace/ops-status", expect: [401] },
  { name: "cors_preflight", path: "/api/v1/verify", method: "OPTIONS", origin: smokeOrigin, expect: [204] },
];

let failed = false;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  try {
    const headers = {
      ...(check.name === "readiness" && bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(check.origin ? { origin: check.origin } : {}),
    };
    const response = await fetch(url, { method: check.method ?? "GET", headers, redirect: "manual" });
    const ok = check.expect.includes(response.status);
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name} ${response.status} ${url}`);
    if (!ok) failed = true;

    if (check.name === "readiness") {
      const body = await response.json().catch(() => null);
      if (body?.status) {
        console.log(`INFO readiness status=${body.status}`);
        for (const item of body.checks ?? []) {
          if (item.status !== "pass") console.log(`INFO ${item.status} ${item.name}: ${item.detail}`);
        }
      }
      if (strict && body?.status !== "pass") failed = true;
    }
  } catch (error) {
    failed = true;
    console.log(`FAIL ${check.name} ${error instanceof Error ? error.message : "request failed"} ${url}`);
  }
}

if (failed) process.exit(1);
