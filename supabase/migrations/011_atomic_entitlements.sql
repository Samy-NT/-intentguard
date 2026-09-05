-- ============================================================
-- IntentGuard — atomic verification entitlement reservations
-- ============================================================

create table if not exists verification_usage_reservations (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  period_start timestamptz not null,
  intent_id text not null,
  reserved_at timestamptz not null default now(),
  primary key (workspace_id, period_start, intent_id)
);

create table if not exists verification_usage_counters (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  period_start timestamptz not null,
  reserved_count bigint not null default 0 check (reserved_count >= 0),
  primary key (workspace_id, period_start)
);

alter table verification_usage_reservations enable row level security;
alter table verification_usage_counters enable row level security;

drop policy if exists "deny all anon" on verification_usage_reservations;
create policy "deny all anon" on verification_usage_reservations for all to anon using (false);
drop policy if exists "deny all anon" on verification_usage_counters;
create policy "deny all anon" on verification_usage_counters for all to anon using (false);

revoke all on table verification_usage_reservations from anon, authenticated;
revoke all on table verification_usage_counters from anon, authenticated;

create or replace function reserve_workspace_verification(
  p_workspace_id uuid,
  p_period_start timestamptz,
  p_intent_id text,
  p_limit integer
)
returns table (
  allowed boolean,
  used bigint,
  limit_value integer,
  already_reserved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  current_used bigint;
begin
  if p_limit is null or p_limit <= 0 then
    return query select true, 0::bigint, p_limit, false;
    return;
  end if;

  insert into verification_usage_reservations (workspace_id, period_start, intent_id)
  values (p_workspace_id, p_period_start, p_intent_id)
  on conflict (workspace_id, period_start, intent_id) do nothing;
  get diagnostics inserted_count = row_count;

  insert into verification_usage_counters (workspace_id, period_start, reserved_count)
  values (
    p_workspace_id,
    p_period_start,
    (select count(*)::bigint
       from verify_logs
      where workspace_id = p_workspace_id
        and created_at >= p_period_start)
  )
  on conflict (workspace_id, period_start) do nothing;

  select reserved_count
    into current_used
    from verification_usage_counters
   where workspace_id = p_workspace_id
     and period_start = p_period_start
   for update;

  if inserted_count = 0 then
    return query select true, current_used, p_limit, true;
    return;
  end if;

  if current_used >= p_limit then
    delete from verification_usage_reservations
     where workspace_id = p_workspace_id
       and period_start = p_period_start
       and intent_id = p_intent_id;
    return query select false, current_used, p_limit, false;
    return;
  end if;

  update verification_usage_counters
     set reserved_count = reserved_count + 1
   where workspace_id = p_workspace_id
     and period_start = p_period_start;

  return query select true, current_used + 1, p_limit, false;
end;
$$;

revoke all on function reserve_workspace_verification(uuid, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function reserve_workspace_verification(uuid, timestamptz, text, integer) to service_role;

create index if not exists verification_usage_reservations_workspace_period_idx
  on verification_usage_reservations (workspace_id, period_start, reserved_at desc);
