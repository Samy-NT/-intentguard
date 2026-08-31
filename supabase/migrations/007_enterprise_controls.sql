-- ============================================================
-- IntentGuard — enterprise controls: key roles and fail mode
-- ============================================================

do $$
begin
  create type api_key_role as enum ('admin', 'operator', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type semantic_fail_mode as enum ('allow', 'flag', 'block');
exception
  when duplicate_object then null;
end $$;

alter table api_keys
  add column if not exists role api_key_role not null default 'admin';

alter table workspaces
  add column if not exists semantic_fail_mode semantic_fail_mode not null default 'flag';

alter table webhook_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;
