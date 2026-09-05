-- Durable, redacted post-execution telemetry for generic agent actions.
create table if not exists action_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  action_id text not null,
  integration text not null,
  trace_id text,
  agent_id text,
  outcome_status text not null check (outcome_status in ('success', 'failure', 'blocked', 'approval_requested', 'approval_allowed', 'approval_denied')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_category text,
  timings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  event_hash text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, event_hash)
);

create index if not exists action_telemetry_workspace_created_idx
  on action_telemetry_events (workspace_id, created_at desc);
create index if not exists action_telemetry_workspace_action_idx
  on action_telemetry_events (workspace_id, action_id, created_at desc);

alter table action_telemetry_events enable row level security;
drop policy if exists "deny all anon" on action_telemetry_events;
create policy "deny all anon" on action_telemetry_events for all to anon using (false);
grant select, insert on action_telemetry_events to service_role;
