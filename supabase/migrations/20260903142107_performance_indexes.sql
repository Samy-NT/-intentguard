-- Cover foreign keys used in workspace-scoped lookups and retention joins.
create index if not exists api_keys_workspace_id_idx
  on api_keys (workspace_id);

create index if not exists verify_logs_triggered_rule_idx
  on verify_logs (triggered_rule);
