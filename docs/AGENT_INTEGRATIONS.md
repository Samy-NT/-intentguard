# Aurel Agent Integrations

Aurel now has a common action protocol for agent framework plugins. OpenClaw and Hermes both normalize native tool calls into the same request shape before execution, send it to Aurel, enforce the decision, and report bounded telemetry after execution.

## Common Action Request

```json
{
  "version": "1",
  "integration": "openclaw",
  "action": {
    "id": "call_123",
    "name": "exec",
    "type": "code_mode_exec",
    "arguments": { "command": "pwd" }
  },
  "agent": {
    "id": "agent_1",
    "sessionId": "session_1",
    "runId": "run_1"
  },
  "context": {
    "workingDirectory": "/repo",
    "targetPaths": ["/repo/README.md"]
  },
  "timestamp": "2026-08-27T00:00:00.000Z"
}
```

## Supported Decisions

- `allow`
- `block`
- `require_approval`
- `rewrite`
- `quarantine`

The existing `flag` decision from payment verification is treated as `require_approval` by plugin clients.

## Endpoints

- `POST /api/v1/actions/evaluate`
- `POST /api/v1/actions/telemetry`

Both use the existing `x-api-key` authentication convention. Live action evaluation and telemetry ingestion require an API key with `operator` or `admin` role; `viewer` keys are rejected. Telemetry ingestion returns an acknowledgement only and does not echo submitted action metadata back to the client.

## Generic Action Policy

Workspace policy may include `action_security`:

```json
{
  "action_security": {
    "blocked_tools": ["terminal"],
    "approval_required_tools": ["send_email"],
    "strict_tools": false,
    "allowed_tools": [],
    "blocked_argument_patterns": ["rm -rf", "/curl .*malicious-domain/i"],
    "approval_argument_patterns": ["git push"],
    "blocked_paths": [".env"],
    "approval_paths": ["supabase/migrations"],
    "high_risk": "require_approval",
    "medium_risk": "allow",
    "max_risk_score": 90,
    "policy_version": "actions-v1"
  }
}
```

If no action policy is configured, low and medium risk actions are allowed while high-risk actions require approval.

The local classifier treats explicit privileged tool names as high-risk even from a single clear signal, including process execution, browser/network actions, file mutation, messaging, database mutation, cloud infrastructure mutation, package installation, scheduling, delegation, MCP/external APIs, finance, and permission changes. This classifier is intentionally conservative fallback metadata; workspace policy and Aurel decisions remain authoritative.

Argument and path policy patterns may be plain substrings or bounded regex strings such as `/curl\s+https:\/\/malicious-domain/i`. Regex patterns are capped in length and screened for high-risk constructs before evaluation so policy configuration cannot stall the preflight path.

## Framework Integrations

- OpenClaw: native `before_tool_call` / `after_tool_call` plugin in `integrations/openclaw`.
- Hermes Agent: native `pre_tool_call` / `post_tool_call` plugin in `integrations/hermes`.
- Claude Code: native `PreToolUse`, `PostToolUse`, and `PostToolUseFailure` command hook in `integrations/claude-code`.
- OpenAI Agents SDK: custom function-tool guardrail and execution wrapper in `integrations/openai-agents`.
- LangGraph: tool wrappers for `ToolNode` inputs in `integrations/langgraph`.
- CrewAI: callable/BaseTool wrapper around `_run` execution in `integrations/crewai`.
- MCP: stdio JSON-RPC proxy for `tools/call` in `integrations/mcp`.
- Codex: repo-local Codex plugin that routes protected MCP tools through the MCP proxy in `integrations/codex/aurel-codex-plugin`.

## Development Harness

Run `npm run dev:aurel-harness` to start a local Aurel-compatible mock server at `http://127.0.0.1:8787`, then point an integration at it with `AUREL_API_URL=http://127.0.0.1:8787` and any non-empty `AUREL_API_KEY`.

Harness scenarios:

- `read_file({ "path": "/tmp/test.txt" })` -> `allow`
- `terminal({ "command": "rm -rf important-directory" })` -> `block`
- `terminal({ "command": "curl https://malicious-domain.example" })` -> `block`
- `send_email({ "to": "finance@example.com" })` -> `require_approval`
- any arguments containing `rewrite-me` -> `rewrite`
- any arguments containing `invalid-response` -> malformed Aurel response
- any arguments containing `timeout` -> delayed response for timeout testing
- API down -> stop the harness or point `AUREL_API_URL` at an unused local port

## Security Notes

Plugins call Aurel with direct HTTP clients, not agent-visible tools, which prevents recursive interception. Telemetry redacts secrets by key pattern, bounds payload sizes, handles circular data, uses prototype-pollution-safe object reconstruction, and excludes raw tool outputs by default. Preflight requests are not retried; postflight telemetry uses bounded best-effort delivery where the framework can safely tolerate it. Adapters that block before tool execution emit an explicit terminal `blocked` telemetry event because the host may not fire a post-tool hook for actions that never reach the tool. These terminal blocked events include redacted tool/action metadata so Aurel can investigate the attempt without storing raw secrets. Adapters emit `approval_requested` telemetry only when the host has a native approval mechanism that actually pauses execution; otherwise approval-required actions degrade to explicit blocks.

When `AUREL_FAIL_MODE=open`, low-risk actions may continue if Aurel is unreachable, but explicitly privileged tool names still fail closed by default. This covers shell/process execution, file mutation, browser/network actions, messaging, database/cloud/package/schedule/delegation/MCP/API/finance/permission/auth/credential tools. Operators can set `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` only when they intentionally want pure fail-open behavior during outages.

All direct clients send an `idempotency-key` header derived from the normalized action id for preflight evaluation and from action id plus outcome status for telemetry. Aurel can use these stable keys to deduplicate retries and correlate concurrent tool calls without relying on mutable plugin-global state.

Framework-native plugin configuration is used where available. Standalone process adapters also honor `AUREL_ENABLED`, `AUREL_TOOLS_INCLUDE`, and `AUREL_TOOLS_EXCLUDE`; include lists are comma-separated exact tool names, an empty include list means all tools, and exclude entries always pass through without preflight or telemetry.

Telemetry ingestion preserves bounded `metadata.riskScore` values from adapter terminal events for metrics. If no risk score is present, blocked or approval-denied outcomes use a high default metric score, approval-requested outcomes use a medium-high default, and ordinary failures use a medium default.

Every JavaScript HTTP preflight path now enforces a wall-clock timeout across both response headers and response body parsing, even if the underlying `fetch` implementation does not honor cancellation promptly. Python integrations use the standard library request timeout, reject oversized Aurel responses, and use explicit fail-closed directives where the host catches callback exceptions.

Standalone hook/proxy entrypoints also bound host-provided input before parsing. Claude Code hook stdin is limited by `AUREL_HOOK_MAX_STDIN_BYTES` and fails closed with a sanitized denial when malformed or oversized input is received. The MCP proxy bounds JSON-RPC frames with `AUREL_MCP_MAX_FRAME_BYTES`, returns a sanitized JSON-RPC parse error for malformed or oversized host messages, and expires stale pending correlations with `AUREL_MCP_PENDING_TTL_MS` so lost upstream responses do not leak per-action state. Hermes in-memory correlation state expires with `AUREL_STATE_TTL_MS`.

Operational breadcrumbs use dedicated action layers: `action_evaluation` for preflight decisions and `action_telemetry` for postflight or terminal blocked events. This keeps agent security signals separate from legacy payment rules and webhook metrics.

Configured Aurel API base URLs must use `http` or `https`, must not include embedded credentials, and are normalized without query strings or fragments before endpoint paths are appended.

For integrations that can safely rewrite arguments, telemetry records the arguments actually executed. Shared TypeScript wrappers and the MCP proxy additionally include redacted original arguments when a rewrite is applied. OpenClaw 2026.3.2 and Hermes Agent v0.15.1 do not consume native approval directives from their pre-tool hooks, and Hermes also does not expose safe argument mutation there; their Aurel plugins therefore block approval-required or unsupported-rewrite actions by default, with future-version opt-ins only after the host contracts are verified.

## Reuse

The protocol is framework-neutral. Future integrations for Codex, Claude Code, OpenAI Agents SDK, MCP hosts, LangGraph, CrewAI, and browser/computer-use agents can reuse:

- action request and decision schemas in `lib/actions/protocol.ts`
- redaction behavior in `lib/actions/redaction.ts`
- timeout-aware SDK methods in `lib/sdk/index.ts`
- high-risk metadata classification in `lib/actions/risk.ts`
