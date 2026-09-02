-- ============================================================
-- Aurel — signed user mandates
-- ============================================================

create table if not exists mandates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  mandate_id text not null,
  payload jsonb not null,
  signature text not null,
  signature_version text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, mandate_id)
);

create index if not exists mandates_workspace_expires_idx
  on mandates (workspace_id, expires_at desc);

create index if not exists mandates_workspace_active_idx
  on mandates (workspace_id, mandate_id)
  where revoked_at is null;

alter table verify_logs
  add column if not exists mandate_id text;

create index if not exists verify_logs_workspace_mandate_idx
  on verify_logs (workspace_id, mandate_id)
  where mandate_id is not null;

alter table mandates enable row level security;

drop policy if exists "deny all anon" on mandates;
create policy "deny all anon" on mandates for all to anon using (false);

grant select, insert, update, delete
  on mandates
  to service_role;
