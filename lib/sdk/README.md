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

## Adapters

```ts
import { createIntentGuardClient } from "./lib/sdk";
import { createLangChainTool, createCrewAITool } from "./lib/sdk/adapters";

const client = createIntentGuardClient({ apiKey: process.env.INTENTGUARD_API_KEY! });

export const langchainTool = createLangChainTool(client);
export const crewAITool = createCrewAITool(client);
```
