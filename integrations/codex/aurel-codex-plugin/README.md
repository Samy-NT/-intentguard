# Aurel Codex Guard

Codex does not expose a public native `before_tool_call` hook contract in this repository. This plugin therefore guards the portable tool boundary Codex can route through today: MCP.

Set:

```text
AUREL_API_URL=https://your-aurel.example.com
AUREL_API_KEY=...
AUREL_FAIL_MODE=closed
AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=block
AUREL_UPSTREAM_MCP_COMMAND=npx
AUREL_UPSTREAM_MCP_ARGS=["some-mcp-server"]
AUREL_MCP_PROXY_PATH=C:/Users/adamg/OneDrive/Documents/Intent Guard/integrations/mcp/src/aurel-mcp-proxy.mjs
```

The plugin launches `aurel-protected-mcp`, which forwards MCP `tools/call` requests through Aurel before the upstream MCP server receives them.

When `AUREL_FAIL_MODE=open`, low-risk MCP tools can continue during an Aurel outage, but privileged tool names still fail closed by default. Set `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` only for an intentional pure fail-open deployment.

Limitations: this protects MCP-backed Codex tools. Direct Codex built-in tool interception still requires a public Codex pre-tool hook API.
