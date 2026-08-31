-- ============================================================
-- IntentGuard — signed audit trail
-- ============================================================

alter table verify_logs
  add column if not exists audit_signature text,
  add column if not exists audit_signature_version text;

create index if not exists verify_logs_workspace_audit_signature_idx
  on verify_logs (workspace_id, audit_signature)
  where audit_signature is not null;
