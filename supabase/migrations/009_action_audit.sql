-- ============================================================
-- Aurel — signed audit trail for generic agent/tool actions
-- ============================================================

create table if not exists action_audit_logs (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references workspaces(id) on delete cascade,
  action_id                text not null,
  integration              text not null,
  agent_id                 text,
  decision                 text not null check (decision in ('allow', 'block', 'require_approval', 'rewrite', 'quarantine')),
  reason                  text,
  risk_score               integer not null default 0 check (risk_score between 0 and 100),
  rule_ids                 jsonb not null default '[]'::jsonb,
  policy_version           text,
  trace_id                 text,
  payload_hash             text not null,
  audit_signature          text not null,
  audit_signature_version  text not null,
  created_at               timestamptz not null default now(),
  unique (workspace_id, action_id)
);

create index if not exists action_audit_logs_workspace_created_idx
  on action_audit_logs (workspace_id, created_at desc);

create index if not exists action_audit_logs_workspace_decision_idx
  on action_audit_logs (workspace_id, decision, created_at desc);

alter table action_audit_logs enable row level security;
drop policy if exists "deny all anon" on action_audit_logs;
create policy "deny all anon" on action_audit_logs for all to anon using (false);

grant select, insert, update, delete on action_audit_logs to service_role;
