import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/lib/policies/evaluate";
import { buildManagedRules, normalizeWorkspacePolicy } from "@/lib/settings-policy";
import { shouldEscalate } from "@/lib/webhooks/notify";
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

  it("only enforces allowed categories when strict category mode is enabled", () => {
    const relaxed = evaluatePolicy(intent(), {
      strict_categories: false,
      allowed_categories: ["saas"],
    });
    expect(relaxed).toBeNull();

    const strict = evaluatePolicy(intent(), {
      strict_categories: true,
      allowed_categories: ["saas"],
    });
    expect(strict?.decision).toBe("block");
  });

  it("honors webhook escalation toggles and mandatory amount threshold", () => {
    expect(
      shouldEscalate("flag", 30, {
        url: "https://example.com/hook",
        threshold: 70,
        escalate_on_flag: false,
      })
    ).toBe(false);

    expect(
      shouldEscalate("block", 30, {
        url: "https://example.com/hook",
        threshold: 70,
        escalate_on_block: true,
      })
    ).toBe(true);

    expect(
      shouldEscalate("allow", 10, {
        url: "https://example.com/hook",
        threshold: 70,
        escalate_above_amount: 1_000,
      }, 1_500)
    ).toBe(true);
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

  it("normalizes action security policy fields from untrusted settings JSON", () => {
    const policy = normalizeWorkspacePolicy({
      action_security: {
        blocked_tools: ["terminal", 42, ""],
        approval_required_tools: ["send_email"],
        strict_tools: true,
        allowed_tools: ["read_file"],
        blocked_argument_patterns: "rm -rf",
        approval_argument_patterns: ["git push"],
        blocked_paths: [".env"],
        approval_paths: ["supabase/migrations"],
        high_risk: "block",
        medium_risk: "unknown",
        max_risk_score: 500,
        policy_version: "",
      },
    });

    expect(policy.action_security).toMatchObject({
      blocked_tools: ["terminal"],
      approval_required_tools: ["send_email"],
      strict_tools: true,
      allowed_tools: ["read_file"],
      blocked_argument_patterns: [],
      approval_argument_patterns: ["git push"],
      blocked_paths: [".env"],
      approval_paths: ["supabase/migrations"],
      high_risk: "block",
      medium_risk: "allow",
      max_risk_score: 100,
      policy_version: "actions-v1",
    });
  });

  it("normalizes workspace access and monthly verification entitlements", () => {
    const policy = normalizeWorkspacePolicy({
      workspace_status: "suspended",
      billing_plan: " pilot ",
      monthly_verification_limit: 42.8,
      limit_period_start: "2026-09-01",
    });

    expect(policy).toMatchObject({
      workspace_status: "suspended",
      billing_plan: "pilot",
      monthly_verification_limit: 42,
      limit_period_start: "2026-09-01T00:00:00.000Z",
    });

    const fallback = normalizeWorkspacePolicy({
      workspace_status: "unknown",
      billing_plan: "",
      monthly_verification_limit: 0,
      limit_period_start: "not-a-date",
    });

    expect(fallback).toMatchObject({
      workspace_status: "active",
      billing_plan: "pilot",
      monthly_verification_limit: null,
    });
    expect(fallback.limit_period_start).toBeUndefined();
  });

  it("blocks a SaaS renewal when the vendor-specific cap is exceeded", () => {
    const result = evaluatePolicy(
      intent({ recipient: "billing@stripe.com", merchant_id: "stripe", amount: 12_000 }),
      {
        known_vendors: [{ name: "stripe", max_amount: 5_000 }],
        allowed_categories: ["saas"],
        strict_categories: true,
      }
    );

    expect(result?.decision).toBe("block");
    expect(result?.reason).toContain("vendor cap");
  });

  it("blocks autonomous payouts outside the approved category list", () => {
    const result = evaluatePolicy(
      intent({
        recipient: "creator@example.com",
        amount: 850,
        metadata: { category: "creator_payout" },
      }),
      {
        allowed_categories: ["saas", "cloud", "contractor"],
        strict_categories: true,
      }
    );

    expect(result?.decision).toBe("block");
    expect(result?.reason).toContain("not permitted");
  });

  it("enforces per-category caps for procurement agents", () => {
    const result = evaluatePolicy(
      intent({
        agent_id: "ag_procurement",
        amount: 4_500,
        metadata: { category: "hardware" },
      }),
      {
        max_amount_by_category: {
          hardware: 2_000,
          software: 10_000,
        },
      }
    );

    expect(result?.decision).toBe("block");
    expect(result?.reason).toContain("hardware");
  });
});
