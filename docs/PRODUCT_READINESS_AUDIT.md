# Aurel Product Readiness Audit

Last updated: 2026-09-03

## Audit verdict

The product is coherent and launchable for a controlled private pilot once the hosted
Supabase project is migrated and production secrets are configured. The core promise is
now true for both payment intents and generic tool actions: a decision is returned before
execution, the decision can be enforced by the integration, and a signed record is kept.
It is not yet a broad self-serve paid SaaS: the Stripe adapter is implemented but requires
provider configuration and live reconciliation evidence; enterprise SSO, self-serve organization
creation, and a formal external security review remain explicit launch blockers for a public rollout.

### Promise-to-proof matrix

| Promise | Evidence in product | Status |
|---|---|---|
| Decide before high-consequence execution | `/api/v1/verify`, `/api/v1/actions/evaluate`, SDK/adapters | Ready |
| Detect policy, velocity, semantic and mission-drift risks | Managed rules, persisted velocity queries, Claude analysis, mandate constraints | Ready for pilot |
| Enforce the decision at the edge | OpenClaw, Hermes, Claude Code, MCP, Codex, CrewAI, LangGraph, OpenAI Agents integrations | Ready; integration must fail closed |
| Keep tamper-evident evidence | HMAC-signed `verify_logs` and `action_audit_logs`, redacted `action_telemetry_events`, external verification endpoints | Ready after migration |
| Operate reliably | Durable webhook queue, retries, cron, retention, exports, Sentry, readiness/smoke checks, atomic entitlement reservations, Stripe webhook idempotence and admin reconciliation | Ready for pilot once migrations 011–013 are applied; automated high-volume reconciliation remains open at scale |
| Sell and provision automatically | Manual beta entitlements, Supabase Auth dashboard login, admin member invitation API, API keys for integrations, optional Stripe checkout/webhook/portal/reconcile | Ready only for tightly controlled Stripe pilots |

## Product Promise

Aurel is an intent firewall for autonomous agent actions. The core promise is: before an agent executes a high-consequence payment or tool action, Aurel evaluates the intent, returns an enforceable decision, and leaves a signed audit trail that operators can review or export.

## Feature audit by customer outcome

| Outcome | Implemented surface | Evidence | Verdict |
|---|---|---|---|
| Stop unsafe execution | `/api/v1/verify`, `/api/v1/actions/evaluate`, fail-closed adapters | 380 automated tests + integration suites | Ready |
| Explain why a decision happened | rule IDs, risk score, semantic signals, trace ID, policy version | signed API responses and dashboard views | Ready |
| Prove what happened later | `verify_logs`, `action_audit_logs`, `action_telemetry_events` | HMAC verification, exports, retention | Ready after migrations |
| Operate a human control plane | dashboard reviews, settings, members, ops status | role checks, CSRF, rate limits | Ready for pilot |
| Meter and sell usage | atomic reservations, manual plans, optional Stripe | entitlement tests and webhook idempotence | Pilot / Stripe-configured only |
| Install in agent runtimes | seven documented adapters and packaging | package verifier, smoke and integration tests | Ready; host contracts must be pinned |
| Become a universal trust label | certification criteria, third-party attestation, marketplace governance | not implemented | Roadmap, not a current promise |

The product must not market the last row as available. The current promise is a verifiable pre-execution control plane for a controlled pilot, not an enterprise identity provider, payment processor, or certification authority.

## Feature Inventory

Implemented:
- Versioned payment verification API with `x-api-key` auth and workspace scoping.
- Deterministic rules for amount caps, allowlists, denylists, category limits, time windows, and per-agent policy.
- Stateful velocity checks backed by persisted verification logs.
- Semantic analysis with prompt-injection, social-engineering, suspicious-provenance, anomaly, and mission-drift signals.
- Generic action preflight API for agent framework integrations.
- Action telemetry ingestion with redaction and bounded payload handling.
- Signed, idempotent audit records for generic agent/tool actions, with payload-hash binding and a workspace-scoped read API.
- Signed mandates for constrained agent payment authorization.
- SDK plus integrations for OpenClaw, Hermes, Claude Code, OpenAI Agents SDK, LangGraph, CrewAI, MCP, and Codex.
- Dashboard for logs, review queue, rules, settings, API keys, webhook jobs, audit verification, and exports.
- Durable webhook queue, retry cron, SIEM/nightly export, retention cron, and signed audit logs.
- Optional Stripe checkout, customer portal, and admin reconciliation with signed, replay-safe entitlement webhooks and provider event evidence.
- Supabase Auth magic-link dashboard identity mapped through `workspace_members`; integration API keys remain separate.
- Admin workspace-member API to list, invite/link, and deactivate dashboard operators without relying on Supabase `user_metadata`.
- Benchmark harness and integration packaging scripts.
- Versioned OpenAPI 3.1 contract at `/api/openapi` for client generation and contract tooling.
- Supabase production project `Aurel Prod` is provisioned in `eu-west-1`; all local migrations are applied and security advisors are clean.

## Gaps Found

Closed in this pass:
- `mission_scope` was documented in the API reference but not accepted by `POST /api/v1/verify`, so mission-drift analysis was not wired into the production verification path.
- Historical unsigned audit logs had a verification UI, but no backfill job to sign legacy rows.
- `action_security` existed in the engine and docs, but not in the dashboard settings, forcing operators to edit raw policy JSON.
- Settings normalization accepted arbitrary `action_security` shapes from API clients, which could make policy evaluation brittle.
- Pilot use cases were documented, but no operator-ready templates existed in the product UI.
- Billing now supports an explicitly opt-in Stripe checkout and signed webhook adapter. Manual mode remains the safe default; no upgrade is claimed until `BILLING_PROVIDER=stripe` and all Stripe readiness checks pass.
- Stripe customer portal sessions are now available to linked workspace customers; sessions are created on demand and never persisted as reusable URLs.
- Stripe subscriptions can now be reconciled on demand from the admin billing surface and `POST /api/v1/billing/reconcile`, reusing the same idempotent entitlement RPC as webhooks.
- Signup previously presented password-based account creation even though first-party dashboard auth was not enabled. Dashboard users can now authenticate with Supabase Auth magic links when their `workspace_members` row is active; API-key login remains available for bootstrap and operations.
- Dashboard user provisioning no longer requires direct SQL edits for each invite: admins can use `/dashboard/members` or call `GET` / `POST` / `DELETE /api/v1/workspace/members` to list active memberships, invite/link Supabase Auth users, and deactivate access. The route blocks Supabase-authenticated admins from removing or downgrading the dashboard role used for their current request.
- Support previously simulated ticket submission in the browser. It now has a rate-limited `/api/support` intake that delivers signed support requests to `SUPPORT_WEBHOOK_URL`, with email/GitHub fallbacks.
- The workspace page previously showed hard-coded sample workspaces. It now reflects the current API-key-scoped workspace model.
- Phase 2 mandates now have an initial signed payload format, registry table, API endpoint, dashboard UI, revocation, and `POST /api/v1/verify` enforcement.
- Deployment readiness now has `/api/v1/readiness` and `npm run smoke:prod-readiness` to validate env, schema availability, public pages, and expected auth boundaries.
- CI now starts the built production server and runs the prod-readiness smoke route checks before packaging integrations.
- Plugin artifact downloads are now centralized behind an allowlisted resolver, constrained to the `outputs` directory, file-checked before streaming, and protected with `nosniff` headers plus traversal tests.
- First workspace bootstrap is now scripted via `npm run bootstrap:workspace`, creating a workspace and one admin API key through the Supabase service role without adding a public bootstrap endpoint.
- Workspace ops status now has `/api/v1/workspace/ops-status` and a dashboard summary on `/dashboard/integrations` for webhook failures, due jobs, review backlog, and SIEM/export configuration.
- Launch and incident response steps are now documented in `docs/RUNBOOK.md`.
- Manual beta entitlements now enforce `workspace_status` and `monthly_verification_limit` before new verification work runs, giving pilots suspension and quota controls before a billing provider is connected.
- Global HTTP hardening now disables the Next powered-by header and applies CSP, HSTS, frame denial, nosniff, referrer, permissions, COOP, and CORP headers across routes.
- Dashboard login now exchanges an API key for a signed httpOnly session cookie, while server APIs remain compatible with `x-api-key` for SDKs and integrations.
- Cookie-authenticated dashboard mutations now require a signed-session CSRF token in `x-aurel-csrf`; SDK/API-key requests remain header-authenticated and do not need the browser CSRF token.
- API CORS now honors `ALLOWED_ORIGINS`, handles preflight requests centrally, and exposes only the headers needed by API-key, dashboard CSRF, cron bearer, and idempotent agent clients.
- Production CORS now denies arbitrary credentialed browser origins when `ALLOWED_ORIGINS` is empty, and readiness fails until an explicit allowlist is configured.
- Dashboard login is now rate-limited before API-key validation to reduce brute-force pressure on the key lookup path.
- Production readiness now rejects placeholder values, malformed URLs, and configured secrets below the minimum length, so strict smoke cannot pass with `.env.example` values.
- Production readiness now requires dedicated session/audit/mandate/cron secrets and distributed Redis rate limiting; production cannot silently fall back to shared secrets or process-local limits.
- Rate-limit checks now fail closed in production when Redis is missing or unavailable; the in-memory fallback remains limited to local/test environments.
- Readiness now also fails when no browser-side Supabase publishable or legacy anonymous key is configured, preventing a false-green dashboard deployment.
- Readiness now checks the atomic entitlement tables from migrations `011` and `012` plus durable telemetry from `013`, preventing a false-green deployment that would fail on quota-bound verification, billing webhook, or action telemetry ingestion.
- Audit and mandate signature verification now support key rotation with active signing secrets plus comma-separated previous secrets for historical verification.
- Workspace ops status now includes SLA/error-budget metrics, alert severity, routing channels, and recommended operator actions in both the API response and `/dashboard/integrations`.
- Plugin artifact distribution now includes a generated SHA-256 manifest at `/api/downloads/manifest`, a CI verifier for hashes and blocked archive paths, and an OpenClaw package script that writes the downloadable `.tgz` into `outputs`.
- AP2 interoperability is now documented in `docs/AP2_INTEROP.md`; Aurel mandates can carry AP2 v0.2 context bindings and `POST /api/v1/verify` enforces matching `checkout_hash` / `transaction_id` metadata when present.
- Hosted support intake is now configurable with `SUPPORT_WEBHOOK_URL` / `SUPPORT_WEBHOOK_SECRET`, covered by readiness checks and route tests.
- Supabase migration packaging now has `npm run verify:supabase-migrations`, which rejects gaps, invalid names, empty SQL, merge markers, and a missing signed-mandates migration; CI runs it before application tests.
- Generic action preflight now persists a signed audit record and rejects reuse of an action id with a different payload.
- Generic action telemetry is now durably stored as bounded/redacted, idempotent workspace events, queryable by action id, and exportable as JSON/CSV.
- Velocity checks now fail closed by default in production when the audit store is unavailable; `AUREL_VELOCITY_FAIL_MODE=open` is an explicit pilot-only availability override.
- Production dashboard sessions now refuse fallback to API-key or audit-signing secrets; a dedicated `DASHBOARD_SESSION_SECRET` is mandatory.
- Generic action audit signatures can be verified independently through `POST /api/v1/audit/action-verify`.
- Generic action audit records can be exported as JSON or CSV for operator and compliance workflows.
- Action preflight and telemetry ingestion are protected by the workspace distributed rate limiter.
- API responses expose a sanitized `X-Request-ID` for incident correlation across clients and monitoring.
- Payment idempotency keys are now bound to the complete request payload; reusing an `intent_id` with changed data returns `409`.
- Concurrent payment retries now replay the unique-index winner instead of leaking a transient `500`.
- Monthly verification entitlements now use migration `011`'s workspace/period counter and intent-bound reservation RPC, preventing concurrent requests from oversubscribing a configured limit.
- Retention cron now removes expired entitlement reservations and period counters alongside verification logs, preventing unbounded quota-state growth.

Still open before a serious paid rollout:
- Multi-provider billing, automated revenue/invoice reconciliation jobs, proration/refunds, and customer portal workflows beyond the Stripe adapter.
- SSO/SAML/OIDC enterprise configuration, user-directory sync, and self-serve organization creation beyond admin-controlled Supabase Auth invites.
- Native support-provider integration beyond generic webhook delivery.
- Native AP2 SD-JWT issuance, receipt exchange, and credential-provider / merchant-payment-processor role implementation.
- Formal third-party security review of plugin install flows before a broad public marketplace launch.
- Billing-provider enforcement and reconciliation between provider entitlements and local reservation counters at high-volume multi-region scale.

## Production Readiness Bar

Minimum launch bar for a private pilot:
- Apply migrations `001` through `013` to the target Supabase project.
- Apply `20260901102012_signed_mandates.sql` and `20260903112359_workspace_members.sql` after the existing numbered migrations.
- Apply `20260903142107_performance_indexes.sql` and verify the hosted migration history contains all 16 migrations.
- Provision dashboard users through `/dashboard/members`, `POST /api/v1/workspace/members`, or equivalent service-role SQL; do not use `user_metadata` for authorization.
- Configure `AUDIT_SIGNING_SECRET`, `MANDATE_SIGNING_SECRET`, `DASHBOARD_SESSION_SECRET`, `INTENTGUARD_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, and Supabase server credentials.
- Configure an explicit `ALLOWED_ORIGINS` browser allowlist; server-to-server integrations should omit `Origin`.
- If self-serve billing is enabled, set `BILLING_PROVIDER=stripe`, configure all Stripe prices/limits and webhook secrets, deliver a signed test event, and run one admin billing reconciliation before opening checkout.
- Configure `SUPPORT_WEBHOOK_URL` / `SUPPORT_WEBHOOK_SECRET` or keep email/GitHub as explicit pilot-only support fallbacks.
- Generate each secret independently with `openssl rand -base64 32` or an equivalent secret manager generator; do not reuse `.env.example` placeholders.
- Run `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, and at least one live `POST /api/v1/verify` smoke test.
- Run `npm run smoke:prod-readiness -- --strict` against the deployed URL.
- Keep the GitHub Actions CI green, including the production-server smoke check.
- Run `npm run verify:supabase-migrations` before applying or packaging database changes; this validates local history but cannot prove the hosted project has applied it.
- Publish plugin artifacts from the CI packaging output and keep `npm run verify:download-artifacts` green before distribution.
- Configure the daily cron endpoint and verify webhook, audit backfill, export, and retention results.
- Check `/api/v1/workspace/ops-status` and `/dashboard/integrations` before opening each pilot workspace.
- Treat `alerts.severity: "critical"` or `sla.error_budget` failure as a launch blocker for that workspace.
- Create one admin API key with `npm run bootstrap:workspace`, store the raw key once, then create separate operator keys for integrations.
- Apply a pilot template in Settings, then review the generated managed rules.
- For Stripe-enabled workspaces, treat access status and monthly verification limits as provider-managed values; verify them through signed webhook delivery or admin reconciliation. The Settings page shows these values read-only. For manual pilot entitlements, provision them through the controlled service-role/bootstrap workflow rather than a public dashboard PATCH.
