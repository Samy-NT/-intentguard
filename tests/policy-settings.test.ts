import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/lib/policies/evaluate";
import { buildManagedRules, normalizeWorkspacePolicy } from "@/lib/settings-policy";
import type { PaymentIntent } from "@/types";

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    intent_id: "pay_policy_test",
    agent_id: "ag_expenses",
    workspace_id: "ws_test",
    amount: 500,
    currency: "USD",
    recipient: "vendor@example.com",
    ...overrides,
  };
}

describe("settings-backed policy evaluation", () => {
  it("blocks transactions above the settings max amount", () => {
    const result = evaluatePolicy(intent({ amount: 2_000 }), { max_amount_usd: 1_000 });
    expect(result?.decision).toBe("block");
  });

  it("blocks crypto when block_crypto is enabled", () => {
    const result = evaluatePolicy(intent({ currency: "ETH" }), { block_crypto: true });
    expect(result?.decision).toBe("block");
  });

  it("blocks recipients in the settings denylist", () => {
    const result = evaluatePolicy(intent({ recipient: "blocked@example.com" }), {
      blocked_recipients: ["blocked@example.com"],
    });
    expect(result?.decision).toBe("block");
  });

  it("enforces active per-agent max amount and recipient restrictions", () => {
    const result = evaluatePolicy(
      intent({ amount: 750, recipient: "unknown@example.com" }),
      {
        per_agent_rules: [
          {
            agent_id: "ag_expenses",
            max_amount: 500,
            max_daily: 2_000,
            allowed_recipients: "vendor@example.com",
            active: true,
          },
        ],
      }
    );
    expect(result?.decision).toBe("block");
    expect(result?.reason).toContain("per-agent cap");
  });

  it("normalizes settings into active managed rules", () => {
    const policy = normalizeWorkspacePolicy({
      max_amount_usd: 5_000,
      blocked_recipients: ["blocked@example.com"],
      allowed_recipients: ["vendor@example.com"],
      strict_recipients: true,
      velocity_max_per_hour: 7,
      velocity_max_per_day: 30,
      velocity_max_amount_per_hour: 8_000,
      max_amount_daily_usd: 25_000,
      semantic_fail_mode: "block",
    });

    const rules = buildManagedRules(policy);
    expect(rules.filter((rule) => rule.is_active)).toHaveLength(7);
    expect(rules.map((rule) => rule.config.managed_by)).toEqual(Array(7).fill("settings"));
  });
});
