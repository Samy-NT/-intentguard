# IntentGuard — CLAUDE.md

## Project
Runtime intent firewall for agentic payments. Exposes a single authenticated API endpoint (`POST /api/verify`) that evaluates a PaymentIntent against a workspace-specific rule set and returns an allow/deny/review verdict.

## Stack
- **Next.js 15 App Router** — API routes only (no frontend yet)
- **Supabase** — Postgres via service role (server-side only)
- **Vercel** — deployment target
- **Zod** — runtime validation on the inbound payload

## Auth
All requests to `/api/verify` must include `x-api-key: <raw-key>`. The key is SHA-256 hashed and compared against `api_keys.key_hash` in Supabase. The service role key must never be exposed client-side.

## Rule Engine (`lib/rules/`)
Rules are loaded from Supabase `rules` table ordered by `priority ASC`. First `deny` short-circuits. The engine is purely deterministic — no ML, no probability, only hard rules.

Rule types:
| type | file | description |
|------|------|-------------|
| `amount_threshold` | `amount.ts` | max per-transaction & soft limit |
| `denylist` | `allowlist.ts` | block if merchant_id or recipient on list |
| `allowlist` | `allowlist.ts` | block if NOT on list |
| `velocity_count` | `velocity.ts` | max N transactions per window |
| `velocity_amount` | `velocity.ts` | max cumulative amount per window |

## Velocity checks
Query `verify_logs` with a time filter. Fail open on DB errors (don't block legitimate payments due to monitoring outage).

## Idempotency
`intent_id` is unique in `verify_logs`. A duplicate `intent_id` returns the cached decision without re-evaluating.

## Key env vars
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Adding a new rule type
1. Add the type to `rule_type` enum in `supabase/migrations/`
2. Create an evaluator in `lib/rules/`
3. Register it in `EVALUATORS` in `lib/rules/engine.ts`
4. Add the config type interface in the evaluator file
