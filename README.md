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

For a first private-pilot workspace, apply the Supabase migrations and bootstrap the initial admin API key:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
INTENTGUARD_SECRET=... \
npm run bootstrap:workspace -- --workspace-name "Acme Pilot"
```

The script prints the raw admin key once. Store it in a secret manager, then create narrower operator/viewer keys from `/dashboard/api-keys`.
Human dashboard users can sign in through Supabase Auth magic links after an active `workspace_members` row links their
Supabase user id to a workspace and role. Admins can provision those rows from `/dashboard/members` or through `POST /api/v1/workspace/members`,
which sends a Supabase invite when an email is supplied. API keys remain the integration credential for agents and bootstrap access.
Manual beta entitlements are provisioned through the controlled bootstrap/service-role workflow; `/dashboard/settings` shows
provider-owned `workspace_status`, `billing_plan`, and `monthly_verification_limit` as read-only. Optional Stripe self-serve checkout
is enabled only with `BILLING_PROVIDER=stripe`; signed webhooks and reconciliation own entitlement state. Linked customers can manage
payment methods and subscriptions through the Stripe-hosted portal from `/billing`.

---

## API

### `POST /api/v1/verify`

Authenticates via `x-api-key` header. Returns a decision with risk score, triggered layer, and full audit entry.
Production verification requests are rate-limited per workspace.
The `intent_id` is an idempotency key bound to the full request payload; retries replay the signed verdict,
while a changed payload returns `409 Conflict`.

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

- `GET /api/v1/mandates` — list active signed mandates for the workspace
- `POST /api/v1/mandates` — create a signed mandate, or verify a supplied signed mandate
- `DELETE /api/v1/mandates` — revoke a mandate by `mandate_id`
- `GET /api/workspace/settings`
- `PATCH /api/workspace/settings`
- `GET /api/workspace/api-keys`
- `POST /api/workspace/api-keys` — returns the raw key once
- `DELETE /api/workspace/api-keys` — revokes a key by id
- `GET /api/v1/workspace/members` — list Supabase Auth dashboard members
- `POST /api/v1/workspace/members` — invite/link a dashboard member by email or `user_id`
- `DELETE /api/v1/workspace/members` — deactivate dashboard access by `user_id`
- `PATCH /api/logs/review` — approve or reject flagged verifications
- `GET /api/workspace/webhook-deliveries` — inspect webhook delivery history
- `GET /api/workspace/webhook-jobs` — inspect pending/retried webhook jobs
- `PATCH /api/workspace/webhook-jobs` — retry a failed webhook job
- `GET /api/workspace/audit-export?format=json|csv` — export audit logs
- `GET /api/workspace/audit-verify?intent_id=...` — verify a stored audit log signature
- `GET /api/workspace/action-audit?action_id=...` — inspect signed generic agent/tool action decisions
- `GET /api/workspace/action-telemetry?action_id=...` — inspect bounded, redacted post-execution events
- `GET /api/workspace/action-telemetry-export?format=json|csv` — export post-execution telemetry
- `GET /api/openapi` — machine-readable OpenAPI 3.1 contract for the core API
- `GET /api/workspace/action-audit-export?format=json|csv` — export signed generic action audit records
- `POST /api/v1/audit/action-verify` — verify a generic action audit signature offline

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

### Signed mandates

Mandates constrain an agent payment to a signed user instruction. A mandate includes the mission scope,
expiry, optional agent restriction, amount/currency caps, and allowed recipients, merchants, and categories.
Verification requests that include a mandate must pass signature validation, constraint checks, and active
registry lookup before the payment can proceed.

Create a mandate:

```bash
curl -X POST https://your-deployment.vercel.app/api/v1/mandates \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_OPERATOR_KEY" \
  -d '{
    "expires_at": "2026-09-02T10:00:00.000Z",
    "mission_scope": "Manage approved SaaS renewals",
    "agent_id": "ag_expense_manager_v1",
    "max_amount": 500,
    "currency": "USD",
    "allowed_recipients": ["billing@stripe.com"],
    "allowed_merchants": ["stripe"],
    "allowed_categories": ["saas"]
  }'
```

Use the returned `signed_mandate` in `POST /api/v1/verify` under the `mandate` field.
Operators can also issue and revoke mandates from `/dashboard/mandates`.
For AP2-style integrations, include the optional `ap2` block with `checkout_hash` and/or `transaction_id`;
Aurel will bind verification requests to matching intent metadata and return an `ap2_profile` mapping.
See [docs/AP2_INTEROP.md](docs/AP2_INTEROP.md) for the compatibility profile and limits.

API keys have roles:

- `admin` — full workspace settings and API key management
- `operator` — review flagged logs and retry webhook jobs
- `viewer` — read-only dashboard/API access

API responses include an `X-Request-ID` header for support and incident correlation. Clients may supply a
safe request id to preserve correlation across their own systems.

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
Generic action preflight decisions are idempotent per `(workspace, action_id)`, reject payload reuse with a
`409`, and return an `auditSignature` that can be verified from the action-audit endpoint. Only a SHA-256
payload hash is stored; raw tool arguments are never persisted in the audit table.
Action preflight and telemetry calls share the workspace rate limit (600 requests/minute by default).

---

## Agent Security Benchmark 2026

Open, reproducible benchmark of agent guardrails: 17 attacks + 14 benign controls across
LangGraph, CrewAI, OpenAI Agents SDK, MCP and browser agents, mapped to the OWASP Top 10
for Agentic Applications (2026). Every metric — attack success rate, false positives,
friction, coverage, latency, auditability — is generated by an open harness:

```bash
npm run benchmark      # regenerates benchmark/results/latest.json
```

Public leaderboard: [`/benchmark`](https://aurels.dev/benchmark) — methodology in
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
npm run build
npm run smoke:prod-readiness
```

Expected output (current suite):

```
Test Files  51 passed (51)
     Tests  380 passed (380)
```

Tests cover: deterministic rule evaluation, velocity detection, semantic pattern pre-screening (social engineering, mission drift, suspicious provenance), and API auth. No external API calls are made during the test suite.

`npm run smoke:prod-readiness` checks `/api/health`, `/api/v1/readiness`, `/auth/login`,
the expected dashboard redirect without a session, and the expected unauthenticated `401` on `/api/v1/mandates`. Use
`AUREL_SMOKE_BASE_URL=https://your-deployment.vercel.app AUREL_SMOKE_BEARER=$CRON_SECRET npm run smoke:prod-readiness -- --strict`
after configuring production env and applying migrations.
Strict readiness rejects `.env.example` placeholders, malformed URLs, and configured secrets shorter than 32 characters.
GitHub Actions also runs this smoke after `npm run build` by starting the production server with `npm run start`.
Plugin downloads are served through an allowlisted `/api/downloads/[file]` route that resolves artifacts under `outputs`, requires a regular file, and sets `X-Content-Type-Options: nosniff`.
The packaging pipeline can publish `/api/downloads/manifest`, a JSON SHA-256 manifest generated with `npm run package:download-manifest` so operators can verify downloaded plugin artifacts. CI also runs `npm run verify:download-artifacts` to confirm the manifest hashes and reject archives containing blocked paths such as `.env`, `.git`, `node_modules`, caches, or build metadata.

Database delivery is guarded by `npm run verify:supabase-migrations`, which validates migration naming, ordering, non-empty SQL, and required signed-mandates history before CI or deployment proceeds. Migration `011` adds an atomic workspace entitlement reservation RPC so concurrent verification requests cannot oversubscribe a monthly limit. Migration `012` adds idempotent, hash-checked provider billing events and an entitlement application RPC. Migration `013` adds durable, redacted, idempotent action telemetry. The command validates the repository history; the target hosted project still needs an explicit migration apply and verification.

Operational launch and incident steps live in [docs/RUNBOOK.md](docs/RUNBOOK.md).
Security headers are centralized in `lib/security-headers.ts` and applied to every route by `next.config.ts`.
Vercel API functions are configured for a 60-second ceiling so the bounded Claude semantic timeout can complete; use a plan that supports that duration.
Dashboard browser sessions use an httpOnly cookie plus `x-aurel-csrf` on mutating requests; SDKs and agent integrations continue to authenticate with `x-api-key`.
Dashboard login attempts are rate-limited before API-key validation.
API CORS is enforced by `proxy.ts`; set `ALLOWED_ORIGINS` to a comma-separated origin allowlist for browser-based agent clients. In production, an empty allowlist denies credentialed browser origins by default; server-to-server integrations can omit `Origin`.
Support requests submit to `/api/support` and are delivered to `SUPPORT_WEBHOOK_URL` when configured; email and GitHub issue links remain as pilot fallbacks.
Billing stays manual unless `BILLING_PROVIDER=stripe` is set. When Stripe is enabled, admins can start checkout, open the customer portal, and reconcile the linked subscription against local entitlements from `/billing` or `POST /api/v1/billing/reconcile`.
Dashboard member provisioning is available from `/dashboard/members` and through `GET` / `POST` / `DELETE /api/v1/workspace/members`; Supabase Auth membership, not `user_metadata`, is the authorization source for human dashboard sessions.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (`https://*.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase browser key for first-party dashboard auth; publishable key preferred, legacy anon key supported |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — server-side only, never expose |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude semantic analysis (Layer 3) |
| `INTENTGUARD_SECRET` | Recommended | Optional pepper for new API key hashes; legacy SHA-256 hashes still validate |
| `DASHBOARD_SESSION_SECRET` | Required in production | HMAC key used for signed httpOnly dashboard sessions. Local/dev fallback is retained for tests only. |
| `UPSTASH_REDIS_REST_URL` | Required in production | Upstash Redis REST URL for distributed rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Required in production | Upstash Redis REST token |
| `CRON_SECRET` | Required in production | Bearer token for manual cron invocations |
| `AUDIT_SIGNING_SECRET` | Required in production | HMAC key used to sign persisted audit decisions. |
| `AUDIT_SIGNING_PREVIOUS_SECRETS` | Optional | Comma-separated old audit signing secrets accepted for historical verification after rotation |
| `MANDATE_SIGNING_SECRET` | Required in production | HMAC key used to sign mandate payloads. |
| `MANDATE_SIGNING_PREVIOUS_SECRETS` | Optional | Comma-separated old mandate signing secrets accepted for historical verification after rotation |
| `SUPPORT_WEBHOOK_URL` | Recommended | HTTPS endpoint for hosted support/ticket ingestion from `/api/support` |
| `SUPPORT_WEBHOOK_SECRET` | Recommended | HMAC secret used to sign support ticket deliveries |
| `ALLOWED_ORIGINS` | Required in production | Comma-separated browser origin allowlist for credentialed API calls |
| `BILLING_PROVIDER` | Optional | Set to `stripe` to enable self-serve checkout; empty keeps manual pilot billing |
| `BILLING_APP_URL` / `NEXT_PUBLIC_APP_URL` | Required for Stripe | Absolute return URL (HTTPS in production) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Required for Stripe | Server-only Stripe API and webhook signing secrets |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PILOT` / `STRIPE_PRICE_ENTERPRISE` | Required for Stripe | Stripe Price IDs for each plan |
| `STRIPE_PLAN_LIMITS` | Required for Stripe | JSON map of plan to positive integer limit or `null` for unlimited |

Generate production secrets independently with `openssl rand -base64 32` or an equivalent secret manager generator.

Bootstrap helpers:

| Variable | Description |
|----------|-------------|
| `AUREL_BOOTSTRAP_WORKSPACE_ID` | Optional fixed workspace UUID for `npm run bootstrap:workspace` |
| `AUREL_BOOTSTRAP_WORKSPACE_NAME` | Optional workspace name for bootstrap |
| `AUREL_BOOTSTRAP_KEY_NAME` | Optional first admin API key label |

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
