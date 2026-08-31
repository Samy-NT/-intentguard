-- ============================================================
-- IntentGuard — production readiness fields
-- ============================================================

alter table api_keys
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz;

do $$
begin
  create type review_status as enum ('not_required', 'pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

alter table verify_logs
  add column if not exists review_status review_status not null default 'not_required',
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz;

create index if not exists verify_logs_workspace_review_status_idx
  on verify_logs (workspace_id, review_status, created_at desc);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  intent_id text not null,
  event text not null,
  status text not null check (status in ('blocked', 'delivered', 'failed')),
  http_status integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_workspace_created_idx
  on webhook_deliveries (workspace_id, created_at desc);

grant select, insert, update, delete
  on webhook_deliveries
  to service_role;

drop policy if exists "deny all anon" on webhook_deliveries;
create policy "deny all anon" on webhook_deliveries for all to anon using (false);
alter table webhook_deliveries enable row level security;
