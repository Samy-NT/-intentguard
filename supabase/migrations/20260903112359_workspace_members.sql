-- IntentGuard - Supabase Auth workspace membership mapping

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role api_key_role not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_active_idx
  on workspace_members (user_id, is_active, workspace_id);

alter table workspace_members enable row level security;
drop policy if exists "deny all anon" on workspace_members;
drop policy if exists "deny all authenticated" on workspace_members;
create policy "deny all anon" on workspace_members for all to anon using (false);
create policy "deny all authenticated" on workspace_members for all to authenticated using (false);

revoke all on workspace_members from public, anon, authenticated;
grant select, insert, update, delete on workspace_members to service_role;
