-- ============================================================
-- IntentGuard — initial schema
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Workspaces ───────────────────────────────────────────────
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── API Keys ─────────────────────────────────────────────────
create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  key_hash      text not null unique,   -- SHA-256 hex of the raw key
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index on api_keys (key_hash) where is_active = true;

-- ── Rules ────────────────────────────────────────────────────
create type rule_type as enum (
  'amount_threshold',
  'allowlist',
  'denylist',
  'velocity_count',
  'velocity_amount'
);

create table if not exists rules (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  rule_type     rule_type not null,
  priority      integer not null default 100,   -- lower = evaluated first
  config        jsonb not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index on rules (workspace_id, is_active, priority);

-- ── Verify Logs (audit trail + velocity source) ───────────────
create type rule_decision as enum ('allow', 'block', 'flag');

create table if not exists verify_logs (
  id              uuid primary key default gen_random_uuid(),
  intent_id       text not null unique,          -- caller-supplied idempotency key
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  agent_id        text not null,
  recipient       text not null,
  merchant_id     text,
  amount          numeric(20, 8) not null,
  currency        text not null,
  agent_context   text,                          -- agent's natural-language reasoning
  decision        rule_decision not null,
  triggered_rule  uuid references rules(id) on delete set null,
  risk_score      integer not null default 0 check (risk_score between 0 and 100),
  created_at      timestamptz not null default now()
);

-- Velocity queries: recent logs by workspace + agent + time
create index on verify_logs (workspace_id, agent_id, created_at desc);
-- Velocity by recipient
create index on verify_logs (workspace_id, recipient, created_at desc);
-- Idempotency lookup
create index on verify_logs (intent_id);

-- ── Row Level Security ────────────────────────────────────────
-- Service role bypasses RLS — anon/authenticated roles are restricted.

alter table workspaces   enable row level security;
alter table api_keys     enable row level security;
alter table rules        enable row level security;
alter table verify_logs  enable row level security;

-- No direct public access; all reads/writes go through service role via server.ts
create policy "deny all anon" on workspaces   for all to anon using (false);
create policy "deny all anon" on api_keys     for all to anon using (false);
create policy "deny all anon" on rules        for all to anon using (false);
create policy "deny all anon" on verify_logs  for all to anon using (false);

-- ── Grants ────────────────────────────────────────────────────
-- service_role bypasses RLS but still needs table-level privileges
-- when the migration is run as a non-superuser role.
grant select, insert, update, delete
  on workspaces, api_keys, rules, verify_logs
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

-- ── Seed: demo workspace + rules ─────────────────────────────
-- Run this block manually after migrating to bootstrap a dev workspace.

/*
insert into workspaces (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Demo Workspace');

-- Amount threshold: deny > $10 000, review > $1 000
insert into rules (workspace_id, rule_type, priority, config) values
  (
    '00000000-0000-0000-0000-000000000001',
    'amount_threshold', 10,
    '{"max_per_transaction": 10000, "soft_limit": 1000, "currency": "USD", "soft_limit_risk_score": 60}'
  ),
  -- Denylist: block a known bad actor
  (
    '00000000-0000-0000-0000-000000000001',
    'denylist', 20,
    '{"field": "recipient", "entries": ["blacklisted-wallet-abc123"]}'
  ),
  -- Velocity: max 5 transactions per agent per hour
  (
    '00000000-0000-0000-0000-000000000001',
    'velocity_count', 30,
    '{"window_seconds": 3600, "max_count": 5, "scope": "agent"}'
  ),
  -- Velocity amount: max $20 000 per agent per day
  (
    '00000000-0000-0000-0000-000000000001',
    'velocity_amount', 40,
    '{"window_seconds": 86400, "max_amount": 20000, "currency": "USD", "scope": "agent"}'
  );
*/
