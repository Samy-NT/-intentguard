# IntentGuard TypeScript SDK

```ts
import { createIntentGuardClient } from "./lib/sdk";

const intentguard = createIntentGuardClient({
  apiKey: process.env.INTENTGUARD_API_KEY!,
  baseUrl: "https://your-deployment.vercel.app",
});

const result = await intentguard.verify({
  intent_id: "pay_2026_0001",
  agent_id: "ag_expense_manager_v1",
  amount: 250,
  currency: "USD",
  recipient: "billing@stripe.com",
  agent_context: "Renewing annual Stripe subscription within approved vendor policy.",
});

if (result.decision === "block") throw new Error(result.reason);
```

The SDK is intentionally transport-only: it works in custom agents, LangChain tools,
CrewAI tasks, or any Node.js runtime with `fetch`.

## Action security clients

Aurel agent integrations use the shared action protocol in `lib/actions/protocol.ts` and the transport helpers exported from `lib/sdk`. Set `AUREL_FAIL_MODE=open` only when continuity is more important than strict outage blocking; privileged tool names still fail closed by default unless `AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS=allow` is explicitly configured.

## Audit verification

```ts
const audit = await intentguard.verifyStoredAuditLog({
  intent_id: "pay_2026_0001",
});

if (!audit.valid) {
  throw new Error("Audit trail verification failed");
}
```

You can also verify an exported audit record:

```ts
const verification = await intentguard.verifyAuditRecord({
  record: exportedLog,
  audit_signature: exportedLog.audit_signature,
  audit_signature_version: exportedLog.audit_signature_version,
});
```

## Adapters

```ts
import { createIntentGuardClient } from "./lib/sdk";
import { createLangChainTool, createCrewAITool } from "./lib/sdk/adapters";

const client = createIntentGuardClient({ apiKey: process.env.INTENTGUARD_API_KEY! });

export const langchainTool = createLangChainTool(client);
export const crewAITool = createCrewAITool(client);
```
