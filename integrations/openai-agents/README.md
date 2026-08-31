# Aurel for OpenAI Agents SDK

The OpenAI Agents SDK supports tool guardrails on custom function tools, and also allows ordinary tool execution functions to be wrapped. Aurel provides both:

- `createAurelOpenAIToolInputGuardrail(toolName, config)`
- `withAurelOpenAIAgentsTool(tool, config)`

## Function Tool Wrapper

```ts
import { tool } from "@openai/agents";
import { z } from "zod";
import { withAurelOpenAIAgentsTool } from "./integrations/openai-agents/src";

const terminal = withAurelOpenAIAgentsTool(
  tool({
    name: "terminal",
    description: "Run a command",
    parameters: z.object({ command: z.string() }),
    async execute({ command }) {
      return runCommand(command);
    },
  })
);
```

## Native Tool Guardrail

```ts
const terminal = tool({
  name: "terminal",
  description: "Run a command",
  parameters: z.object({ command: z.string() }),
  inputGuardrails: [createAurelOpenAIToolInputGuardrail("terminal")],
  async execute({ command }) {
    return runCommand(command);
  },
});
```

For approval-first flows, pass `toolExecution: { preApprovalInputGuardrails: true }` to `run()` or `Runner` so Aurel checks before the approval request is emitted.

## Configuration

The wrapper and guardrail accept the shared Aurel tool guard config, including `enabled`, `failMode`, `failOpenPrivilegedActions`, `timeoutMs`, `telemetryEnabled`, `includeResults`, `maxPayloadBytes`, `redactionEnabled`, `approvalFallback`, and exact tool `include` / `exclude` lists. They also honor `AUREL_ENABLED`, `AUREL_API_URL`, `AUREL_API_KEY`, `AUREL_FAIL_MODE`, `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS`, `AUREL_TIMEOUT_MS`, `AUREL_TELEMETRY_ENABLED`, `AUREL_TELEMETRY_INCLUDE_RESULTS`, `AUREL_TELEMETRY_MAX_PAYLOAD_BYTES`, `AUREL_REDACTION_ENABLED`, `AUREL_REWRITE_UNSUPPORTED_FALLBACK`, `AUREL_TOOLS_INCLUDE`, and `AUREL_TOOLS_EXCLUDE`; `0`, `false`, `no`, and `off` disable boolean env flags.

If `AUREL_FAIL_MODE=open`, low-risk tools can proceed during an outage, but privileged tool names such as terminal/shell/process, browser/network, file mutation, messaging, database/cloud/package/schedule/delegation/MCP/API/finance/auth, and credential tools still stop before execution by default. Set `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` only when pure fail-open behavior is intentional.

The execution wrapper reports `blocked` telemetry for denied calls and `approval_requested` telemetry for approval-required calls that cannot proceed automatically. The input guardrail also emits terminal telemetry before returning `rejectContent`, so rejected tool input does not disappear from Aurel's trace.

Limitations: OpenAI Agents SDK tool guardrails apply to custom function tools, not hosted tools, built-in execution tools, handoffs, or `agent.asTool()` internals. Wrap those boundaries explicitly when the SDK exposes an application-owned function.
