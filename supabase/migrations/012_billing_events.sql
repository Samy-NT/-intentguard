-- ============================================================
-- IntentGuard — provider-owned billing entitlement events
-- ============================================================

-- Only store the minimum durable evidence needed to make webhook handling
-- idempotent and auditable. Raw provider payloads stay out of the database.
create table if not exists billing_events (
  event_id text primary key,
  provider text not null,
  event_type text not null,
  workspace_id uuid references workspaces(id) on delete set null,
  payload_hash text not null,
  processed_at timestamptz not null default now()
);

create index if not exists billing_events_workspace_processed_idx
  on billing_events (workspace_id, processed_at desc);

alter table billing_events enable row level security;
drop policy if exists "deny all anon" on billing_events;
create policy "deny all anon" on billing_events for all to anon using (false);
revoke all on billing_events from public, anon, authenticated;
grant select, insert on billing_events to service_role;

create or replace function apply_billing_entitlement(
  p_event_id text,
  p_provider text,
  p_event_type text,
  p_workspace_id uuid,
  p_workspace_status text,
  p_billing_plan text,
  p_monthly_limit integer,
  p_customer_id text,
  p_subscription_id text,
  p_period_start timestamptz,
  p_payload_hash text
)
returns table(applied boolean, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  existing_hash text;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'billing event id is required';
  end if;
  if p_workspace_id is null or not exists (select 1 from workspaces where id = p_workspace_id) then
    raise exception 'billing workspace does not exist';
  end if;

  insert into billing_events(event_id, provider, event_type, workspace_id, payload_hash)
  values (p_event_id, p_provider, p_event_type, p_workspace_id, p_payload_hash)
  on conflict (event_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select payload_hash into existing_hash from billing_events where event_id = p_event_id;
    if existing_hash is distinct from p_payload_hash then
      raise exception 'billing event payload hash mismatch';
    end if;
    return query select false, true;
    return;
  end if;

  update workspaces
  set policy = coalesce(policy, '{}'::jsonb)
    || jsonb_build_object(
      'workspace_status', p_workspace_status,
      'billing_plan', coalesce(p_billing_plan, policy->>'billing_plan'),
      'monthly_verification_limit', case
        when p_billing_plan is null then policy->'monthly_verification_limit'
        else to_jsonb(p_monthly_limit)
      end,
      'billing_provider', p_provider,
      'billing_customer_id', coalesce(p_customer_id, policy->>'billing_customer_id'),
      'billing_subscription_id', coalesce(p_subscription_id, policy->>'billing_subscription_id'),
      'limit_period_start', coalesce(p_period_start::text, policy->>'limit_period_start')
    )
  where id = p_workspace_id;

  return query select true, false;
end;
$$;

revoke execute on function apply_billing_entitlement(text, text, text, uuid, text, text, integer, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function apply_billing_entitlement(text, text, text, uuid, text, text, integer, text, text, timestamptz, text)
  to service_role;
