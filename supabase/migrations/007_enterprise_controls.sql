-- ============================================================
-- IntentGuard — enterprise controls: key roles and fail mode
-- ============================================================

create type api_key_role as enum ('admin', 'operator', 'viewer');
create type semantic_fail_mode as enum ('allow', 'flag', 'block');

alter table api_keys
  add column if not exists role api_key_role not null default 'admin';

alter table workspaces
  add column if not exists semantic_fail_mode semantic_fail_mode not null default 'flag';

alter table webhook_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;
