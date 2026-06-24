-- ============================================================
-- IntentGuard — webhook escalation config
-- ============================================================

alter table workspaces
  add column if not exists webhook_url       text,
  add column if not exists webhook_secret    text,
  add column if not exists webhook_threshold integer not null default 70;

-- webhook_url       — HTTPS endpoint that receives escalation events
-- webhook_secret    — optional HMAC-SHA256 signing secret
-- webhook_threshold — risk_score >= this value triggers a notification (default 70)
--                     set to 101 to disable threshold-based escalation

-- ── Example seed ─────────────────────────────────────────
/*
update workspaces
set
  webhook_url       = 'https://hooks.example.com/intentguard',
  webhook_secret    = 'whsec_replace_with_a_random_32_char_string',
  webhook_threshold = 70
where id = '00000000-0000-0000-0000-000000000001';
*/
