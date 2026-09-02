import type { MandatePayload } from "@/lib/mandates";

export const AP2_COMPATIBILITY_PROFILE_VERSION = "ap2-v0.2-aurel-mapping";

export interface Ap2CompatibilityProfile {
  protocol: "ap2";
  protocol_version: "v0.2";
  profile_version: typeof AP2_COMPATIBILITY_PROFILE_VERSION;
  mode: "human_present" | "human_not_present" | "unspecified";
  mapped_constraints: Array<{
    type: string;
    detail: string;
  }>;
  context_bindings: Array<{
    field: string;
    value: string;
  }>;
  limitations: string[];
}

export function buildAp2CompatibilityProfile(payload: MandatePayload): Ap2CompatibilityProfile {
  const mapped_constraints: Ap2CompatibilityProfile["mapped_constraints"] = [
    ...(typeof payload.max_amount === "number" && payload.currency
      ? [
          {
            type: "payment.amount_range",
            detail: `Payment amount must be <= ${payload.max_amount} ${payload.currency.toUpperCase()}`,
          },
        ]
      : []),
    ...(payload.allowed_recipients?.length
      ? [
          {
            type: "payment.allowed_payees",
            detail: `Payment recipient must match one of ${payload.allowed_recipients.length} allowed recipients`,
          },
        ]
      : []),
    ...(payload.allowed_merchants?.length
      ? [
          {
            type: "checkout.allowed_merchants",
            detail: `Checkout merchant must match one of ${payload.allowed_merchants.length} allowed merchants`,
          },
        ]
      : []),
    {
      type: "payment.execution_date",
      detail: `Payment must execute before ${payload.expires_at}`,
    },
  ];

  const context_bindings: Ap2CompatibilityProfile["context_bindings"] = [
    { field: "workspace_id", value: payload.workspace_id },
    { field: "mandate_id", value: payload.mandate_id },
    ...(payload.agent_id ? [{ field: "agent_id", value: payload.agent_id }] : []),
    ...(payload.ap2?.checkout_hash ? [{ field: "checkout_hash", value: payload.ap2.checkout_hash }] : []),
    ...(payload.ap2?.transaction_id ? [{ field: "transaction_id", value: payload.ap2.transaction_id }] : []),
  ];

  return {
    protocol: "ap2",
    protocol_version: "v0.2",
    profile_version: AP2_COMPATIBILITY_PROFILE_VERSION,
    mode: payload.ap2?.mode ?? "unspecified",
    mapped_constraints,
    context_bindings,
    limitations: [
      "Aurel signed mandates are not AP2 SD-JWTs.",
      "Aurel does not issue AP2 checkout receipts or payment receipts.",
      "Aurel stores operator policy constraints for runtime verification; AP2 credential-provider and merchant-payment-processor verification remains external.",
    ],
  };
}
