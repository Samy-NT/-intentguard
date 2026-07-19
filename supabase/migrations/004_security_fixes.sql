-- ============================================================
-- IntentGuard — security hardening
-- ============================================================

-- Idempotency keys are caller-supplied and must be scoped to a workspace.
-- The initial schema used a global unique constraint on intent_id, which
-- allowed one workspace to receive another workspace's cached decision when
-- the same intent_id was reused or guessed.

alter table verify_logs
  drop constraint if exists verify_logs_intent_id_key;

drop index if exists verify_logs_intent_id_idx;
drop index if exists verify_logs_intent_id_workspace_idx;

create unique index if not exists verify_logs_workspace_intent_id_key
  on verify_logs (workspace_id, intent_id);
