# Aurel MCP Proxy

The MCP integration is a stdio JSON-RPC proxy. Run it in front of any local MCP server so `tools/call` requests are evaluated by Aurel before they reach the upstream tool server.

## Usage

```bash
node integrations/mcp/src/aurel-mcp-proxy.mjs -- npx some-mcp-server
```

Configure the host's MCP server command to launch the proxy, then put the real MCP server command after `--`.

Common environment settings:

```text
AUREL_API_URL=https://your-aurel.example.com
AUREL_API_KEY=...
AUREL_FAIL_MODE=closed
AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=block
AUREL_TIMEOUT_MS=1500
AUREL_ENABLED=true
AUREL_TOOLS_INCLUDE=
AUREL_TOOLS_EXCLUDE=
AUREL_TELEMETRY_ENABLED=true
AUREL_TELEMETRY_MAX_PAYLOAD_BYTES=32768
AUREL_REDACTION_ENABLED=true
AUREL_MCP_MAX_FRAME_BYTES=1048576
AUREL_MCP_PENDING_TTL_MS=600000
```

`AUREL_TOOLS_INCLUDE` and `AUREL_TOOLS_EXCLUDE` are comma-separated exact MCP tool names. An empty include list means all non-Aurel-internal tools; exclude entries are forwarded directly upstream without preflight or telemetry.

If `AUREL_FAIL_MODE=open`, low-risk MCP tools can proceed during an outage, but privileged tool names such as terminal/shell/process, browser/network, file mutation, messaging, database/cloud/package/schedule/delegation/MCP/API/finance/auth, and credential tools still return a sanitized JSON-RPC error by default. Set `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` only when pure fail-open behavior is intentional.

## Decisions

- `allow`: forwards the MCP request unchanged.
- `block` / `quarantine`: returns a JSON-RPC error and never forwards to upstream.
- `require_approval` / legacy `flag`: returns a JSON-RPC error because MCP stdio has no portable approval prompt.
- `rewrite`: forwards with rewritten `params.arguments`.

The proxy uses direct HTTP to Aurel and does not expose Aurel itself as an MCP tool. Preflight requests fail closed by default, enforce a bounded timeout across response headers and body parsing, and are not retried. Postflight telemetry reports the tool name and redacted argument metadata, preserves prototype-pollution-shaped keys as inert telemetry data, strips control characters from text, bounds argument metadata with `AUREL_TELEMETRY_MAX_PAYLOAD_BYTES`, excludes raw tool results, and skips tools named `aurel.*`, `aurel-*`, or `aurel_*` to prevent recursive interception. Set `AUREL_REDACTION_ENABLED=false` only for local diagnostics.

Host JSON-RPC frames are bounded by `AUREL_MCP_MAX_FRAME_BYTES` (default 1 MiB, clamped between 1 KiB and 16 MiB). Malformed or oversized host frames return a sanitized parse error and are not forwarded upstream. Pending action correlations expire after `AUREL_MCP_PENDING_TTL_MS` (default 10 minutes, clamped between 1 second and 1 hour) so crashed or disconnected upstream servers cannot leak correlation state in a long-running proxy.

When Aurel returns a supported rewrite, the proxy forwards rewritten `params.arguments` upstream. Telemetry records the redacted executed arguments and, for rewrite decisions only, redacted `originalArgs` plus `rewriteApplied: true`.
