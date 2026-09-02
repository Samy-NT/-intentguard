import type { SignedMandate } from "@/lib/mandates";
import type { PaymentIntent } from "@/types";

export function getMissionScope(
  intent: Pick<PaymentIntent, "mission_scope" | "metadata"> & { mandate?: SignedMandate }
): string | undefined {
  if (typeof intent.mission_scope === "string" && intent.mission_scope.trim()) {
    return intent.mission_scope.trim();
  }

  if (typeof intent.mandate?.payload.mission_scope === "string" && intent.mandate.payload.mission_scope.trim()) {
    return intent.mandate.payload.mission_scope.trim();
  }

  const metadataScope = intent.metadata?.mission_scope;
  if (typeof metadataScope === "string" && metadataScope.trim()) {
    return metadataScope.trim();
  }

  return undefined;
}
