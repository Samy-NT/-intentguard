-- ============================================================
-- IntentGuard — dev seed
-- Run this in Supabase SQL editor after applying 001_init.sql.
-- The raw API key printed below is for local testing only.
-- ============================================================

-- 1. Workspace
insert into workspaces (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Demo Workspace')
  on conflict (id) do nothing;

-- 2. API key
--    Raw key : intentguard_dev_key_abc123
--    SHA-256 : run `echo -n "intentguard_dev_key_abc123" | shasum -a 256` to verify
insert into api_keys (workspace_id, name, key_hash) values
  (
    '00000000-0000-0000-0000-000000000001',
    'dev-key',
    -- SHA-256 of "intentguard_dev_key_abc123"
    encode(digest('intentguard_dev_key_abc123', 'sha256'), 'hex')
  )
  on conflict (key_hash) do nothing;

-- 3. Rules

-- Amount threshold: deny > $10 000, review > $1 000
insert into rules (workspace_id, rule_type, priority, config) values
  (
    '00000000-0000-0000-0000-000000000001',
    'amount_threshold', 10,
    '{"max_per_transaction": 10000, "soft_limit": 1000, "currency": "USD", "soft_limit_risk_score": 60}'
  ),
  -- Denylist: block known bad recipient
  (
    '00000000-0000-0000-0000-000000000001',
    'denylist', 20,
    '{"field": "recipient", "entries": ["blacklisted-wallet-abc123"]}'
  ),
  -- Allowlist: only approved merchants (disabled by default — set is_active = true to enable)
  (
    '00000000-0000-0000-0000-000000000001',
    'allowlist', 25,
    '{"field": "merchant_id", "entries": ["stripe", "paypal", "adyen"]}'
  ),
  -- Velocity count: max 5 transactions per agent per hour
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

-- Disable allowlist rule by default (it's restrictive — enable manually)
update rules set is_active = false
  where workspace_id = '00000000-0000-0000-0000-000000000001'
  and rule_type = 'allowlist';

-- Decisions: 'allow' | 'block' | 'flag'  (see rule_decision enum in 001_init.sql)
