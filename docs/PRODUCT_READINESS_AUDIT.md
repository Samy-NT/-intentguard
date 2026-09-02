# Aurel Product Readiness Audit

Last updated: 2026-09-01

## Product Promise

Aurel is an intent firewall for autonomous agent actions. The core promise is: before an agent executes a high-consequence payment or tool action, Aurel evaluates the intent, returns an enforceable decision, and leaves a signed audit trail that operators can review or export.

## Feature Inventory

Implemented:
- Versioned payment verification API with `x-api-key` auth and workspace scoping.
- Deterministic rules for amount caps, allowlists, denylists, category limits, time windows, and per-agent policy.
- Stateful velocity checks backed by persisted verification logs.
- Semantic analysis with prompt-injection, social-engineering, suspicious-provenance, anomaly, and mission-drift signals.
- Generic action preflight API for agent framework integrations.
- Action telemetry ingestion with redaction and bounded payload handling.
- Signed mandates for constrained agent payment authorization.
- SDK plus integrations for OpenClaw, Hermes, Claude Code, OpenAI Agents SDK, LangGraph, CrewAI, MCP, and Codex.
- Dashboard for logs, review queue, rules, settings, API keys, webhook jobs, audit verification, and exports.
- Durable webhook queue, retry cron, SIEM/nightly export, retention cron, and signed audit logs.
- Benchmark harness and integration packaging scripts.

## Gaps Found

Closed in this pass:
- `mission_scope` was documented in the API reference but not accepted by `POST /api/v1/verify`, so mission-drift analysis was not wired into the production verification path.
- Historical unsigned audit logs had a verification UI, but no backfill job to sign legacy rows.
- `action_security` existed in the engine and docs, but not in the dashboard settings, forcing operators to edit raw policy JSON.
- Settings normalization accepted arbitrary `action_security` shapes from API clients, which could make policy evaluation brittle.
- Pilot use cases were documented, but no operator-ready templates existed in the product UI.
- Billing previously simulated upgrades without a real billing provider. The page now states that self-serve billing is disabled and routes pilots to manual approval.
- Signup previously presented password-based account creation even though first-party dashboard auth is not enabled. It now directs users to API-key sign-in or pilot access.
- Support previously simulated ticket submission in the browser. It now uses real outbound/contact paths and documents that ticket-provider wiring is still required.
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
- Dashboard login is now rate-limited before API-key validation to reduce brute-force pressure on the key lookup path.
- Production readiness now rejects placeholder values, malformed URLs, and configured secrets below the minimum length, so strict smoke cannot pass with `.env.example` values.
- Audit and mandate signature verification now support key rotation with active signing secrets plus comma-separated previous secrets for historical verification.
- Workspace ops status now includes SLA/error-budget metrics, alert severity, routing channels, and recommended operator actions in both the API response and `/dashboard/integrations`.
- Plugin artifact distribution now includes a generated SHA-256 manifest at `/api/downloads/manifest`, a CI verifier for hashes and blocked archive paths, and an OpenClaw package script that writes the downloadable `.tgz` into `outputs`.
- AP2 interoperability is now documented in `docs/AP2_INTEROP.md`; Aurel mandates can carry AP2 v0.2 context bindings and `POST /api/v1/verify` enforces matching `checkout_hash` / `transaction_id` metadata when present.

Still open before a serious paid rollout:
- Real billing provider integration. The product now avoids fake upgrades and enforces manual beta entitlements, but self-serve paid plan changes are not implemented.
- First-party identity provider for the dashboard. Current operational workflows use API-key login backed by signed httpOnly dashboard sessions.
- Hosted support/ticket ingestion provider.
- Native AP2 SD-JWT issuance, receipt exchange, and credential-provider / merchant-payment-processor role implementation.
- Applied and verified Supabase migrations in the target hosted project.
- Formal third-party security review of plugin install flows before a broad public marketplace launch.

## Production Readiness Bar

Minimum launch bar for a private pilot:
- Apply migrations `001` through `008` to the target Supabase project.
- Apply `20260901102012_signed_mandates.sql` after the existing numbered migrations.
- Configure `AUDIT_SIGNING_SECRET`, `MANDATE_SIGNING_SECRET`, `DASHBOARD_SESSION_SECRET`, `INTENTGUARD_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, and Supabase server credentials.
- Generate each secret independently with `openssl rand -base64 32` or an equivalent secret manager generator; do not reuse `.env.example` placeholders.
- Run `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, and at least one live `POST /api/v1/verify` smoke test.
- Run `npm run smoke:prod-readiness -- --strict` against the deployed URL.
- Keep the GitHub Actions CI green, including the production-server smoke check.
- Publish plugin artifacts from the CI packaging output and keep `npm run verify:download-artifacts` green before distribution.
- Configure the daily cron endpoint and verify webhook, audit backfill, export, and retention results.
- Check `/api/v1/workspace/ops-status` and `/dashboard/integrations` before opening each pilot workspace.
- Treat `alerts.severity: "critical"` or `sla.error_budget` failure as a launch blocker for that workspace.
- Create one admin API key with `npm run bootstrap:workspace`, store the raw key once, then create separate operator keys for integrations.
- Apply a pilot template in Settings, then review the generated managed rules.
- Set workspace access status and monthly verification limit in Settings for the pilot package.
