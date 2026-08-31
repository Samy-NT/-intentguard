# Aurel

The intent firewall for autonomous actions. Aurel secures the intent before a decision passes, blocking injected instructions, semantic anomalies, mission drift, suspicious provenance, and policy violations before an agent executes high-consequence work.

[![CI](https://github.com/Samy-NT/intentguard/actions/workflows/ci.yml/badge.svg)](https://github.com/Samy-NT/intentguard/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## How it works

Every protected action intent passes through three sequential layers before a decision is returned:

- **Layer 1 — Deterministic rules.** Action caps, denylist matching, route restrictions. Sub-millisecond. No external calls.
- **Layer 2 — Velocity checks.** Per-agent rate limits and cumulative exposure windows. Stateful, backed by Redis.
- **Layer 3 — Semantic analysis (Claude).** Detects prompt injection, semantic anomalies, social engineering (authority spoofing, urgency manipulation, confidentiality requests), mission drift, and suspicious instruction provenance.

Layers are additive. The final decision (`allow` / `flag` / `block`) reflects the worst outcome across all three.
Workspace settings are synchronized into managed runtime rules, so dashboard limits, denylists, allowlists, and velocity controls are enforced by the API.
Webhook escalations are queued durably and retried by cron; audit exports, SIEM exports, and log retention are also handled by scheduled jobs.
Each persisted verification is signed with a canonical HMAC-SHA256 audit signature so exported logs can be checked for tampering.

---

## Quickstart

```bash
git clone https://github.com/Samy-NT/intentguard.git
cd intentguard
npm install
```

Copy the environment variable template and fill in your values:

```bash
cp .env.example .env.local
# Edit .env.local with your keys — see Environment variables below
```

Start the development server:

```bash
npm run dev
# http://localhost:3000
```

The interactive demo console is available at `http://localhost:3000`. No API key required for demo mode.

---

## API

### `POST /api/v1/verify`

Authenticates via `x-api-key` header. Returns a decision with risk score, triggered layer, and full audit entry.
Production verification requests are rate-limited per workspace.

```bash
curl -X POST https://your-deployment.vercel.app/api/v1/verify \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "intent_id": "act_2026_0001",
    "agent_id": "ag_expense_manager_v1",
    "amount": 250,
    "currency": "USD",
    "recipient": "billing@stripe.com",
    "agent_context": "Renewing annual Stripe subscription INV-2026-0892 within approved vendor list.",
    "metadata": { "action_type": "payment" }
  }'
```

**Response:**

```json
{
  "intent_id": "act_2026_0001",
  "decision": "allow",
  "reason": "All verification layers passed",
  "risk_score": 5,
  "triggered_rule": null,
  "evaluated_at": "2026-07-11T12:00:00.000Z",
  "audit_signature": "8f1c...",
  "audit_signature_version": "audit-v1-hmac-sha256"
}
```

Possible `decision` values: `allow`, `flag`, `block`.

### Workspace management endpoints

All workspace endpoints require `x-api-key` and are scoped to the key's workspace.

- `GET /api/workspace/settings`
- `PATCH /api/workspace/settings`
- `GET /api/workspace/api-keys`
- `POST /api/workspace/api-keys` — returns the raw key once
- `DELETE /api/workspace/api-keys` — revokes a key by id
- `PATCH /api/logs/review` — approve or reject flagged verifications
- `GET /api/workspace/webhook-deliveries` — inspect webhook delivery history
- `GET /api/workspace/webhook-jobs` — inspect pending/retried webhook jobs
- `PATCH /api/workspace/webhook-jobs` — retry a failed webhook job
- `GET /api/workspace/audit-export?format=json|csv` — export audit logs
- `GET /api/workspace/audit-verify?intent_id=...` — verify a stored audit log signature

### Audit verification

`POST /api/v1/audit/verify` verifies an exported audit record against its HMAC signature.

```json
{
  "record": {
    "workspace_id": "00000000-0000-0000-0000-000000000001",
    "intent_id": "pay_2026_0001",
    "agent_id": "ag_expense_manager_v1",
    "recipient": "billing@stripe.com",
    "merchant_id": null,
    "amount": 250,
    "currency": "USD",
    "decision": "allow",
    "triggered_rule": null,
    "risk_score": 5,
    "evaluated_at": "2026-07-11T12:00:00.000Z"
  },
  "audit_signature": "8f1c...",
  "audit_signature_version": "audit-v1-hmac-sha256"
}
```

Response:

```json
{ "valid": true, "audit_signature_version": "audit-v1-hmac-sha256" }
```

API keys have roles:

- `admin` — full workspace settings and API key management
- `operator` — review flagged logs and retry webhook jobs
- `viewer` — read-only dashboard/API access

### SDK

```ts
import { createIntentGuardClient } from "intentguard/sdk";

const ig = createIntentGuardClient({
  apiKey: process.env.INTENTGUARD_API_KEY!,
  baseUrl: "https://your-deployment.vercel.app",
});

const decision = await ig.verify({
  intent_id: "act_2026_0001",
  agent_id: "ag_expense_manager_v1",
  amount: 250,
  currency: "USD",
  recipient: "billing@stripe.com",
  agent_context: "Renewing approved SaaS subscription.",
  metadata: { action_type: "payment" },
});
```

Adapters are available from `intentguard/sdk/adapters` for LangChain-style and CrewAI-style tool wrappers.

---

## Agent Security Benchmark 2026

Open, reproducible benchmark of agent guardrails: 17 attacks + 14 benign controls across
LangGraph, CrewAI, OpenAI Agents SDK, MCP and browser agents, mapped to the OWASP Top 10
for Agentic Applications (2026). Every metric — attack success rate, false positives,
friction, coverage, latency, auditability — is generated by an open harness:

```bash
npm run benchmark      # regenerates benchmark/results/latest.json
```

Public leaderboard: [`/benchmark`](https://aurel.io/benchmark) — methodology in
[benchmark/README.md](benchmark/README.md).

---

## Stack

| Component | Role |
|-----------|------|
| **Next.js 16** | App Router — API routes and demo console |
| **Supabase** | Postgres database — workspaces, rules, verify logs |
| **Claude API** | Semantic intent analysis — Layer 3 |
| **Upstash Redis** | Rate limiting for the demo endpoint |
| **Sentry** | Error monitoring and build-time source map upload |

---

## Tests

```bash
npm test
npm run type-check
npm run lint
```

Expected output:

```
Test Files  6 passed (6)
     Tests  74 passed (74)
```

Tests cover: deterministic rule evaluation, velocity detection, semantic pattern pre-screening (social engineering, mission drift, suspicious provenance), and API auth. No external API calls are made during the test suite.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (`https://*.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key — safe to expose client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — server-side only, never expose |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude semantic analysis (Layer 3) |
| `INTENTGUARD_SECRET` | Recommended | Optional pepper for new API key hashes; legacy SHA-256 hashes still validate |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL for demo rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token |
| `CRON_SECRET` | Recommended | Bearer token for manual cron invocations |
| `AUDIT_SIGNING_SECRET` | Recommended | HMAC key used to sign persisted audit decisions. Falls back to `INTENTGUARD_SECRET`, then service-role key. |

`/api/v1/verify`, `/api/logs`, and `/api/workspace/settings` require an `x-api-key` header. Settings and logs are scoped to the workspace associated with that API key.

**Sentry** (optional — build warnings are suppressed when absent):

| Variable | Description |
|----------|-------------|
| `SENTRY_AUTH_TOKEN` | Auth token for source map upload at build time |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |

---

## License

MIT
