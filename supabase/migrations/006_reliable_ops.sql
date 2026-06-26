-- ============================================================
-- IntentGuard — reliable ops: webhook queue, retention, exports
-- ============================================================

alter table workspaces
  add column if not exists siem_url text,
  add column if not exists siem_secret text;

create table if not exists webhook_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  intent_id text,
  event text not null,
  target_url text not null,
  secret text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed', 'blocked')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  http_status integer,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_jobs_due_idx
  on webhook_jobs (status, next_attempt_at, created_at);

create index if not exists webhook_jobs_workspace_created_idx
  on webhook_jobs (workspace_id, created_at desc);

grant select, insert, update, delete
  on webhook_jobs
  to service_role;

alter table webhook_jobs enable row level security;
create policy "deny all anon" on webhook_jobs for all to anon using (false);
