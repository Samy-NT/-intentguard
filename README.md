# Aurel

Runtime intent firewall for agentic payments. Sits between your agent and the payment rail — blocking injected instructions, semantic anomalies, and policy violations before a single transaction executes.

[![CI](https://github.com/Samy-NT/intentguard/actions/workflows/ci.yml/badge.svg)](https://github.com/Samy-NT/intentguard/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## How it works

Every payment intent passes through three sequential layers before a decision is returned:

- **Layer 1 — Deterministic rules.** Amount caps, denylist matching, currency restrictions. Sub-millisecond. No external calls.
- **Layer 2 — Velocity checks.** Per-agent rate limits and cumulative spend windows. Stateful, backed by Redis.
- **Layer 3 — Semantic analysis (Claude).** Detects prompt injection, semantic anomalies, social engineering (authority spoofing, urgency manipulation, confidentiality requests), mission drift, and suspicious instruction provenance.

Layers are additive. The final decision (`allow` / `flag` / `block`) reflects the worst outcome across all three.
Workspace settings are synchronized into managed runtime rules, so dashboard limits, denylists, allowlists, and velocity controls are enforced by the API.
Webhook escalations are queued durably and retried by cron; audit exports, SIEM exports, and log retention are also handled by scheduled jobs.

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
    "intent_id": "pay_2026_0001",
    "agent_id": "ag_expense_manager_v1",
    "amount": 250,
    "currency": "USD",
    "recipient": "billing@stripe.com",
    "agent_context": "Renewing annual Stripe subscription INV-2026-0892 within approved vendor list."
  }'
```

**Response:**

```json
{
  "intent_id": "pay_2026_0001",
  "decision": "allow",
  "reason": "All verification layers passed",
  "risk_score": 5,
  "triggered_rule": null,
  "version": "v1"
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
  intent_id: "pay_2026_0001",
  agent_id: "ag_expense_manager_v1",
  amount: 250,
  currency: "USD",
  recipient: "billing@stripe.com",
  agent_context: "Renewing approved SaaS subscription.",
});
```

Adapters are available from `intentguard/sdk/adapters` for LangChain-style and CrewAI-style tool wrappers.

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
