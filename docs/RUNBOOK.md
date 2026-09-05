# Aurel Production Runbook

Last updated: 2026-09-03

## Launch Checklist

1. Apply every Supabase migration in order (`001`–`013`), then the timestamped signed-mandates, workspace-members, and performance-index migrations.
2. Configure production env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `INTENTGUARD_SECRET`, `DASHBOARD_SESSION_SECRET`, `AUDIT_SIGNING_SECRET`, `MANDATE_SIGNING_SECRET`, `CRON_SECRET`, `ALLOWED_ORIGINS`, `SUPPORT_WEBHOOK_URL`, `SUPPORT_WEBHOOK_SECRET`.
3. Use a Vercel plan/runtime that permits the configured 60-second API function duration; the semantic Claude layer has a bounded 30-second upstream timeout.
4. Run `npm run bootstrap:workspace -- --workspace-name "<pilot name>"` and store the printed `raw_key` in a secret manager.
5. Use the admin key once to create operator/viewer keys from `/dashboard/api-keys`.
6. Use `/dashboard/members` or `POST /api/v1/workspace/members` with the admin key to provision dashboard users; this sends Supabase Auth invites when an email is supplied and creates active workspace-role memberships.
7. Configure Settings: pilot template, action security, webhook URL/secret, SIEM URL/secret, retention, nightly export.
8. Provision manual beta entitlements through the controlled bootstrap/service-role workflow. Settings displays `workspace_status`, `billing_plan`, monthly verification limit, and usage period as read-only. For Stripe self-serve, set `BILLING_PROVIDER=stripe` and all `STRIPE_*` values, then register `/api/billing/webhook` in Stripe; signed events/reconciliation own those values.
9. Confirm migration `011_atomic_entitlements.sql` is applied; it provides the atomic reservation RPC used before expensive verification work.
10. Configure the scheduler to call `/api/cron/daily` with `Authorization: Bearer $CRON_SECRET`.
11. Run `AUREL_SMOKE_BASE_URL=https://your-deployment AUREL_SMOKE_BEARER=$CRON_SECRET npm run smoke:prod-readiness -- --strict`.
12. Package downloadable agent integrations, generate the integrity manifest with `npm run package:download-manifest`, then run `npm run verify:download-artifacts`.
13. Before any database deployment, run `npm run verify:supabase-migrations`; then apply the verified history to the target Supabase project and confirm it with the Supabase migration list.
14. Run `npm run audit:runtime` before opening pilot traffic; high-severity runtime dependency advisories are launch blockers.
15. If Stripe is enabled, open `/billing` with an admin key and run Sync, or call `POST /api/v1/billing/reconcile`, then confirm the workspace status and plan match Stripe.
16. Send one live low-risk `POST /api/v1/verify` request with a pilot operator key and confirm the log appears in the dashboard.

## Secret Requirements

- Generate each app secret independently with `openssl rand -base64 32` or an equivalent secret manager generator.
- Do not deploy values copied from `.env.example`; `/api/v1/readiness` fails placeholders and short configured secrets.
- `INTENTGUARD_SECRET`, `DASHBOARD_SESSION_SECRET`, `AUDIT_SIGNING_SECRET`, `MANDATE_SIGNING_SECRET`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY` must be real production credentials before strict smoke can pass.
- Rotating `DASHBOARD_SESSION_SECRET` immediately invalidates dashboard sessions. Rotate during a maintenance window and ask operators to sign in again.
- Production never falls back to `INTENTGUARD_SECRET` or `AUDIT_SIGNING_SECRET` for dashboard sessions; readiness and startup configuration must provide the dedicated secret.
- Rotating `INTENTGUARD_SECRET` changes peppered API-key hashes for newly generated keys; keep existing keys available until replacements are issued.
- To rotate `AUDIT_SIGNING_SECRET`, move the current value into `AUDIT_SIGNING_PREVIOUS_SECRETS`, deploy a new `AUDIT_SIGNING_SECRET`, and rerun strict readiness. Audit signing uses the active key; verification accepts the active key plus previous keys.
- To rotate `MANDATE_SIGNING_SECRET`, move the current value into `MANDATE_SIGNING_PREVIOUS_SECRETS`, deploy a new `MANDATE_SIGNING_SECRET`, and rerun strict readiness. Mandate signing uses the active key; verification accepts the active key plus previous keys.
- Remove previous signing secrets only after the corresponding historical audit records or mandates no longer need online verification.

## Daily Checks

- `/api/v1/readiness` should return `200` with `status: "pass"` when called with `Authorization: Bearer $CRON_SECRET`.
- `/api/v1/workspace/ops-status` should return `status: "ok"` for each pilot workspace when called with a workspace API key.
- `/dashboard/integrations` should show no terminal webhook jobs and no unexpected review backlog.
- Daily retention should report cleanup for verification logs, generic action audits/telemetry, and (after migration 011) expired entitlement reservations/counters. Migration 012 must expose `billing_events` in readiness before Stripe is enabled.
- `/dashboard/integrations` should show `alerts.severity` as `none`; treat `warning` as degraded and `critical` as a pilot traffic blocker.
- SLA error-budget burn should stay below `50%` in the 24h status window. `100%` burn means the workspace is outside the pilot SLO.
- `/dashboard/audit` should show recent signed audit records.
- A generic action preflight should return `auditSignature`; verify one with `POST /api/v1/audit/action-verify` and confirm it appears in `/dashboard/audit`.
- `/dashboard/settings` should show the provider-owned `workspace_status` as `active` or `trialing`; `suspended` disables new verification requests. Do not attempt to change entitlement fields through the dashboard PATCH.
- If Stripe is enabled, `/billing` Sync should report the same subscription status and plan as Stripe before paid traffic opens.
- Public and dashboard routes should include security headers from `lib/security-headers.ts`, including CSP, HSTS, `nosniff`, and frame denial.
- Dashboard login should set an `aurel_dashboard_session` httpOnly cookie and return a CSRF token used as `x-aurel-csrf` on dashboard mutations; API keys should still work through `x-api-key` for SDKs and agent integrations.
- `GET /api/v1/workspace/members` should list the expected operators, and `DELETE /api/v1/workspace/members` should deactivate a test user without deleting Supabase Auth history.
- Repeated dashboard login attempts return `429`; investigate spikes as possible leaked-key probing.
- If Redis is unavailable in production, rate-limited endpoints intentionally return `429` until distributed limiting recovers; do not re-enable the process-local fallback.
- Velocity database failures block new payment verifications in production by default. Use `AUREL_VELOCITY_FAIL_MODE=open` only for a documented pilot availability exception, then restore the closed default.
- Browser-based external clients should have their exact origins listed in `ALLOWED_ORIGINS`; server-to-server integrations can omit `Origin`.
- In production, an empty `ALLOWED_ORIGINS` is a readiness failure and the API denies credentialed browser origins by default.
- `/api/downloads/manifest` should list each published plugin artifact with a SHA-256 hash; compare downloaded files before internal distribution.
- `npm run verify:download-artifacts` should pass before publishing artifacts. It rejects hash mismatches and archives containing blocked paths such as `.env`, `.git`, `node_modules`, caches, or build metadata.
- AP2-style pilots should include `mandate.payload.ap2.checkout_hash` or `mandate.payload.ap2.transaction_id` and send matching `metadata.checkout_hash` / `metadata.transaction_id` on verification requests. See `docs/AP2_INTEROP.md`.
- `/api/support` should return `202` and create a ticket in the configured support intake. If it returns `503`, configure `SUPPORT_WEBHOOK_URL` and redeploy.

## Incidents

### Readiness Fails

1. Check the failing `env.*` or `db.*` item in `/api/v1/readiness`.
2. If an env check fails, fix the deployment secret and redeploy.
3. If a DB check fails, verify migrations were applied to the same Supabase project used by the deployment.
4. Re-run strict smoke before reopening pilot traffic.

### Webhook Jobs Fail

1. Open `/dashboard/integrations` with an operator key.
2. Check Ops status for `webhook.failures`, `webhook.latency`, `sla.error_budget`, and terminal job count.
3. Inspect `alerts.recommended_actions`, the latest job `last_error`, and delivery HTTP status.
4. Fix the downstream endpoint or secret, then retry failed jobs from the dashboard.
5. If `alerts.severity` remains `critical`, pause new pilot traffic until webhook delivery success returns inside the SLO.
6. If jobs remain blocked, verify the target URL is HTTPS and not blocked by the webhook URL validator.

### Review Queue Grows

1. Open `/dashboard/reviews` with an operator key.
2. Review pending flagged decisions and approve/reject with notes.
3. If many flags are benign, adjust the active pilot template in `/dashboard/settings`.
4. If many flags are real blocks, tighten recipients, categories, mandate scope, or action security.

### Support Intake Fails

1. Submit a test request from `/support` or `POST /api/support`.
2. If the response is `503`, configure `SUPPORT_WEBHOOK_URL`.
3. If the response is `400`, verify the webhook URL is public HTTPS and passes the webhook URL validator.
4. If the response is `429`, wait for the support rate-limit window or inspect for request abuse.
5. If the response is `502`, inspect the downstream ticketing provider and `X-IntentGuard-Signature` verification.

### Workspace Hits Its Quota

1. `POST /api/v1/verify` returns `402` when `monthly_verification_limit` is reached.
2. Confirm the pilot package and current usage period in `/dashboard/settings`.
3. Raise the limit, reset `limit_period_start`, or move the workspace to a package with a higher limit.
4. Keep `workspace_status` as `suspended` only when new verification work should be rejected.

### Audit Signature Mismatch

1. Confirm the deployment uses the same `AUDIT_SIGNING_SECRET` that signed the record.
2. Use `/dashboard/audit` or `POST /api/v1/audit/verify` to verify the exported record.
3. If historical rows are unsigned, run `/api/cron/audit-backfill` with the cron bearer.
4. Treat unexpected mismatches as tampering until proven otherwise.

For generic action records, use `POST /api/v1/audit/action-verify` and compare the
stored `payload_hash` with the caller's canonical action payload. Raw tool arguments
are intentionally not stored in Aurel.

## Rollback

- Disable risky traffic by revoking integration operator keys in `/dashboard/api-keys`.
- Set stricter action-security defaults in `/dashboard/settings`.
- Pause external schedulers that call cron endpoints if they are amplifying an incident.
- Keep the previous deployment available until strict smoke passes on the replacement.
