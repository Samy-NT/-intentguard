# Aurel for CrewAI

CrewAI task guardrails validate task outputs. For pre-tool security, Aurel wraps CrewAI tools so the check runs immediately before `_run` or a callable tool executes.

## Usage

```python
from aurel_crewai import protect_tool

safe_tool = protect_tool(existing_tool)
```

Set:

```text
AUREL_API_URL=https://your-aurel.example.com
AUREL_API_KEY=...
AUREL_FAIL_MODE=closed
AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=block
AUREL_TIMEOUT_MS=1500
AUREL_TELEMETRY_ENABLED=true
AUREL_TELEMETRY_INCLUDE_RESULTS=false
AUREL_TELEMETRY_MAX_PAYLOAD_BYTES=32768
AUREL_REDACTION_ENABLED=true
AUREL_ENABLED=true
AUREL_TOOLS_INCLUDE=
AUREL_TOOLS_EXCLUDE=
```

`AUREL_TOOLS_INCLUDE` and `AUREL_TOOLS_EXCLUDE` are comma-separated exact tool names. An empty include list means all non-Aurel-internal tools; exclude entries always pass through without preflight or telemetry.

If `AUREL_FAIL_MODE=open`, low-risk tools can proceed during an outage, but privileged tool names such as terminal/shell/process, browser/network, file mutation, messaging, database/cloud/package/schedule/delegation/MCP/API/finance/auth, and credential tools still fail closed by default. Set `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` only when pure fail-open behavior is intentional.

Wrapped callables and `_run` tools preserve their original invocation shape. Keyword calls remain keyword calls, a single positional mapping remains one mapping argument, and multi-positional calls remain positional.

`block` and `quarantine` raise `AurelToolBlockedError` before the underlying tool runs. Because CrewAI has no portable native approval prompt at the wrapped tool boundary, `require_approval` emits `approval_requested` telemetry and stops execution by default. Production hosts can pass `approval_handler` in `AurelCrewAIConfig`; the handler receives the normalized action and Aurel decision, returns `True` to run the original tool, and returns `False` to keep the action blocked. Approval decisions emit normalized resolution telemetry (`approval_allowed` or `approval_denied`); handler exceptions emit a sanitized `failure` outcome. `rewrite` uses the rewritten arguments before execution.

```python
from aurel_crewai import AurelCrewAIConfig, AurelCrewAIGuard, protect_tool

def approve(action, decision):
    return human_review(action, decision)

guard = AurelCrewAIGuard(AurelCrewAIConfig(approval_handler=approve))
safe_tool = protect_tool(existing_tool, guard)
```

Telemetry includes the tool name, redacted argument metadata, and decision metadata for terminal pre-execution outcomes. Raw tool results are excluded by default; set `AUREL_TELEMETRY_INCLUDE_RESULTS=true` only when your policy allows result upload. Tools named `aurel.*`, `aurel-*`, or `aurel_*` are passed through without interception to avoid recursive Aurel calls.

The Aurel API URL must be `http` or `https` and cannot contain embedded credentials. Query strings and fragments are stripped before endpoint paths are appended, and oversized Aurel responses are rejected. Rewrite telemetry records the arguments actually sent to the tool and redacted original arguments.

## Packaging

```bash
npm run build:crewai-integration
npm run package:crewai-integration
```
