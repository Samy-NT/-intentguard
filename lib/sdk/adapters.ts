import type { IntentGuardClient, VerifyIntentInput } from "./index";

export function createLangChainTool(client: IntentGuardClient) {
  return {
    name: "intentguard_verify_payment",
    description: "Verify an autonomous action intent before execution.",
    async invoke(input: VerifyIntentInput | string) {
      const payload = typeof input === "string" ? (JSON.parse(input) as VerifyIntentInput) : input;
      return client.verify(payload);
    },
    async call(input: VerifyIntentInput | string) {
      return this.invoke(input);
    },
  };
}

export function createCrewAITool(client: IntentGuardClient) {
  return {
    name: "IntentGuard Payment Verification",
    description: "Checks action intent risk and returns allow, flag, or block.",
    async run(input: VerifyIntentInput | string) {
      const payload = typeof input === "string" ? (JSON.parse(input) as VerifyIntentInput) : input;
      return client.verify(payload);
    },
  };
}
