# Aurel for Claude Code

Claude Code exposes native hooks at tool-call boundaries. Aurel uses `PreToolUse` for enforcement and `PostToolUse` / `PostToolUseFailure` for telemetry.

## Install

Copy the hook block from `settings.example.json` into project `.claude/settings.json` or user `~/.claude/settings.json`, then set:

```text
AUREL_API_URL=https://your-aurel.example.com
AUREL_API_KEY=...
AUREL_FAIL_MODE=closed
AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=block
AUREL_TIMEOUT_MS=1500
AUREL_HOOK_MAX_STDIN_BYTES=1048576
AUREL_ENABLED=true
AUREL_TOOLS_INCLUDE=
AUREL_TOOLS_EXCLUDE=
AUREL_TELEMETRY_ENABLED=true
AUREL_TELEMETRY_MAX_PAYLOAD_BYTES=32768
AUREL_REDACTION_ENABLED=true
AUREL_REWRITE_UNSUPPORTED_FALLBACK=approval
```

Use an Aurel API key with `operator` or `admin` role. `viewer` keys are rejected by the live action evaluation and telemetry endpoints.

`AUREL_TOOLS_INCLUDE` and `AUREL_TOOLS_EXCLUDE` are comma-separated exact tool names. An empty include list means all non-Aurel-internal tools; exclude entries always pass through without preflight or telemetry.

If `AUREL_FAIL_MODE=open`, low-risk tools can proceed during an outage, but privileged tool names such as `Bash`, terminal/shell/process, browser/network, file mutation, messaging, database/cloud/package/schedule/delegation/MCP/API/finance/auth, and credential tools still return a sanitized deny decision by default. Set `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` only when pure fail-open behavior is intentional.

## Behavior

- `allow`: hook returns `permissionDecision: "allow"`.
- `block` / `quarantine`: hook returns `permissionDecision: "deny"` with a sanitized reason.
- `require_approval` / legacy `flag`: hook returns `permissionDecision: "ask"`.
- `rewrite`: Claude Code hooks cannot safely mutate tool input, so rewrite falls back to ask or deny.

Project-level hooks also apply inside Claude Code subagents when the workspace is trusted.

Blocked decisions emit terminal `blocked` telemetry before the hook returns `deny`, because Claude Code will not run the underlying tool. Approval decisions emit `approval_requested` telemetry before the hook returns `ask`. Telemetry redaction preserves prototype-pollution-shaped keys as inert data, strips control characters from text, and bounds argument metadata with `AUREL_TELEMETRY_MAX_PAYLOAD_BYTES`. Set `AUREL_REDACTION_ENABLED=false` only for local diagnostics; execution arguments are never mutated by redaction. The hook persists only minimal correlation state for allowed calls: action id, trace id, agent context, and preflight latency. Tool inputs and outputs are not stored in that state file.

Hook stdin is bounded before parsing (default 1 MiB, clamped between 1 KiB and 16 MiB). Malformed or oversized hook input fails closed with the sanitized unavailable message.
