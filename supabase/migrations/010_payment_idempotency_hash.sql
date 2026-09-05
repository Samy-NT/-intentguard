-- ============================================================
-- Aurel — bind payment idempotency keys to the complete request payload
-- ============================================================

alter table verify_logs
  add column if not exists intent_payload_hash text;

create index if not exists verify_logs_workspace_payload_hash_idx
  on verify_logs (workspace_id, intent_payload_hash)
  where intent_payload_hash is not null;
