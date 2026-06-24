-- ============================================================
-- IntentGuard — operator policies
-- ============================================================

-- ── Policy column on workspaces ───────────────────────────
-- Stores the workspace-level business rule set as a JSONB blob.
-- Schema is defined in lib/policies/evaluate.ts (WorkspacePolicy).
alter table workspaces
  add column if not exists policy jsonb not null default '{}';

-- ── Example policy (for reference / seed) ────────────────
/*
update workspaces
set policy = '{
  "approved_recipients": ["vendor@acme.com", "supplier@globex.com"],
  "allowed_categories": ["saas", "travel", "ops"],
  "time_restrictions": {
    "timezone": "America/New_York",
    "allowed_days": ["mon", "tue", "wed", "thu", "fri"],
    "allowed_hours": { "start": 8, "end": 20 }
  },
  "max_amount_by_category": {
    "saas": 500,
    "travel": 3000,
    "ops": 1000
  }
}'::jsonb
where id = '00000000-0000-0000-0000-000000000001';
*/
