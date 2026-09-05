import { describe, it, expect, vi } from "vitest";
import { evaluateAmountThreshold } from "@/lib/rules/amount";
import { evaluateDenylist, evaluateAllowlist } from "@/lib/rules/allowlist";
import { evaluateVelocityAmount, evaluateVelocityCount } from "@/lib/rules/velocity";
import { runRuleEngine } from "@/lib/rules/engine";
import type { DbRule, PaymentIntent } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRule(
  overrides: Partial<DbRule> & { config: DbRule["config"] }
): DbRule {
  return {
    id: "rule_test",
    workspace_id: "ws_test",
    rule_type: "amount_threshold",
    priority: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    intent_id: "pay_test_1",
    agent_id: "ag_test",
    workspace_id: "ws_test",
    amount: 500,
    currency: "USD",
    recipient: "vendor@stripe.com",
    ...overrides,
  };
}

function mockDb(rules: DbRule[]): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: rules, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function mockDbError(): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: "DB timeout" } }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ── evaluateAmountThreshold ───────────────────────────────────────────────────

describe("evaluateAmountThreshold", () => {
  const ctx = { intent: makeIntent({ amount: 5000, currency: "USD" }), db: {} as SupabaseClient };

  it("blocks when amount exceeds max_per_transaction", async () => {
    const rule = makeRule({ config: { max_per_transaction: 4000 } });
    const result = await evaluateAmountThreshold(rule, { ...ctx, intent: makeIntent({ amount: 5000 }) });
    expect(result?.decision).toBe("block");
    expect(result?.risk_score).toBe(100);
  });

  it("flags when amount exceeds soft_limit", async () => {
    const rule = makeRule({ config: { soft_limit: 3000, soft_limit_risk_score: 70 } });
    const result = await evaluateAmountThreshold(rule, { ...ctx, intent: makeIntent({ amount: 3500 }) });
    expect(result?.decision).toBe("flag");
    expect(result?.risk_score).toBe(70);
  });

  it("returns null when amount is within all limits", async () => {
    const rule = makeRule({ config: { max_per_transaction: 10000, soft_limit: 5000 } });
    const result = await evaluateAmountThreshold(rule, { ...ctx, intent: makeIntent({ amount: 1000 }) });
    expect(result).toBeNull();
  });

  it("returns null when currency does not match rule currency", async () => {
    const rule = makeRule({ config: { max_per_transaction: 1000, currency: "EUR" } });
    const result = await evaluateAmountThreshold(rule, { ...ctx, intent: makeIntent({ amount: 5000, currency: "USD" }) });
    expect(result).toBeNull();
  });

  it("uses default soft_limit_risk_score of 60 when not specified", async () => {
    const rule = makeRule({ config: { soft_limit: 3000 } });
    const result = await evaluateAmountThreshold(rule, { ...ctx, intent: makeIntent({ amount: 3500 }) });
    expect(result?.risk_score).toBe(60);
  });
});

// ── evaluateDenylist / evaluateAllowlist ──────────────────────────────────────

describe("evaluateDenylist", () => {
  const ctx = { intent: makeIntent(), db: {} as SupabaseClient };

  it("blocks when recipient is on denylist", async () => {
    const rule = makeRule({
      rule_type: "denylist",
      config: { field: "recipient", entries: ["bad@actor.com"] },
    });
    const result = await evaluateDenylist(rule, { ...ctx, intent: makeIntent({ recipient: "bad@actor.com" }) });
    expect(result?.decision).toBe("block");
  });

  it("returns null when recipient is not on denylist", async () => {
    const rule = makeRule({
      rule_type: "denylist",
      config: { field: "recipient", entries: ["other@bad.com"] },
    });
    const result = await evaluateDenylist(rule, { ...ctx, intent: makeIntent({ recipient: "good@vendor.com" }) });
    expect(result).toBeNull();
  });

  it("returns null when field value is absent", async () => {
    const rule = makeRule({
      rule_type: "denylist",
      config: { field: "merchant_id", entries: ["bad_merchant"] },
    });
    const result = await evaluateDenylist(rule, { ...ctx, intent: makeIntent({ merchant_id: undefined }) });
    expect(result).toBeNull();
  });

  it("matches merchant_id field", async () => {
    const rule = makeRule({
      rule_type: "denylist",
      config: { field: "merchant_id", entries: ["blocked_merchant"] },
    });
    const result = await evaluateDenylist(rule, {
      ...ctx,
      intent: makeIntent({ merchant_id: "blocked_merchant" }),
    });
    expect(result?.decision).toBe("block");
  });
});

describe("evaluateAllowlist", () => {
  const ctx = { intent: makeIntent(), db: {} as SupabaseClient };

  it("blocks when recipient is NOT on allowlist", async () => {
    const rule = makeRule({
      rule_type: "allowlist",
      config: { field: "recipient", entries: ["approved@vendor.com"] },
    });
    const result = await evaluateAllowlist(rule, { ...ctx, intent: makeIntent({ recipient: "random@vendor.com" }) });
    expect(result?.decision).toBe("block");
  });

  it("returns null (passes) when recipient IS on allowlist", async () => {
    const rule = makeRule({
      rule_type: "allowlist",
      config: { field: "recipient", entries: ["approved@vendor.com"] },
    });
    const result = await evaluateAllowlist(rule, { ...ctx, intent: makeIntent({ recipient: "approved@vendor.com" }) });
    expect(result).toBeNull();
  });

  it("returns null when field value is absent (skip, don't block)", async () => {
    const rule = makeRule({
      rule_type: "allowlist",
      config: { field: "merchant_id", entries: ["approved_merchant"] },
    });
    const result = await evaluateAllowlist(rule, { ...ctx, intent: makeIntent({ merchant_id: undefined }) });
    expect(result).toBeNull();
  });
});

// ── runRuleEngine ─────────────────────────────────────────────────────────────

describe("runRuleEngine", () => {
  it("returns allow with risk 0 when no rules configured", async () => {
    const db = mockDb([]);
    const result = await runRuleEngine(makeIntent(), db);
    expect(result.decision).toBe("allow");
    expect(result.risk_score).toBe(0);
    expect(result.triggered_rule).toBeNull();
  });

  it("short-circuits on first block rule", async () => {
    const rules: DbRule[] = [
      makeRule({ id: "r1", priority: 1, rule_type: "amount_threshold", config: { max_per_transaction: 100 } }),
      makeRule({ id: "r2", priority: 2, rule_type: "amount_threshold", config: { max_per_transaction: 200 } }),
    ];
    const db = mockDb(rules);
    const result = await runRuleEngine(makeIntent({ amount: 150 }), db);
    expect(result.decision).toBe("block");
    expect(result.triggered_rule).toBe("r1");
    // r2 was never evaluated (short-circuit)
    expect(result.all_results).toHaveLength(1);
  });

  it("aggregates worst outcome — flag wins over allow", async () => {
    const rules: DbRule[] = [
      makeRule({ id: "r1", priority: 1, rule_type: "amount_threshold", config: { soft_limit: 1000 } }),
    ];
    const db = mockDb(rules);
    const result = await runRuleEngine(makeIntent({ amount: 1500 }), db);
    expect(result.decision).toBe("flag");
  });

  it("throws when DB returns error", async () => {
    const db = mockDbError();
    await expect(runRuleEngine(makeIntent(), db)).rejects.toThrow("Failed to load rules");
  });

  it("returns allow when all rules pass (null results)", async () => {
    const rules: DbRule[] = [
      makeRule({ id: "r1", priority: 1, rule_type: "amount_threshold", config: { max_per_transaction: 100_000 } }),
    ];
    const db = mockDb(rules);
    const result = await runRuleEngine(makeIntent({ amount: 500 }), db);
    expect(result.decision).toBe("allow");
  });
});

// ── velocity evaluators ──────────────────────────────────────────────────────

function mockVelocityDb(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.in.mockReturnValue(query);

  const db = {
    from: vi.fn(() => query),
  } as unknown as SupabaseClient;

  return { db, query };
}

describe("velocity evaluators", () => {
  it("counts allow and flag decisions for count velocity", async () => {
    const rule = makeRule({
      id: "velocity_count",
      rule_type: "velocity_count",
      config: { window_seconds: 3600, max_count: 5, scope: "agent" },
    });
    const { db, query } = mockVelocityDb({ count: 0, error: null });

    await evaluateVelocityCount(rule, { intent: makeIntent(), db });

    expect(query.in).toHaveBeenCalledWith("decision", ["allow", "flag"]);
  });

  it("counts allow and flag decisions for amount velocity", async () => {
    const rule = makeRule({
      id: "velocity_amount",
      rule_type: "velocity_amount",
      config: { window_seconds: 3600, max_amount: 10_000, scope: "agent" },
    });
    const { db, query } = mockVelocityDb({ data: [], error: null });

    await evaluateVelocityAmount(rule, { intent: makeIntent(), db });

    expect(query.in).toHaveBeenCalledWith("decision", ["allow", "flag"]);
  });

  it("sums string numeric amounts returned by Postgres", async () => {
    const rule = makeRule({
      id: "velocity_amount",
      rule_type: "velocity_amount",
      config: { window_seconds: 3600, max_amount: 1_000, scope: "agent" },
    });
    const { db } = mockVelocityDb({ data: [{ amount: "900.50" }], error: null });

    const result = await evaluateVelocityAmount(rule, {
      intent: makeIntent({ amount: 200, currency: "USD" }),
      db,
    });

    expect(result?.decision).toBe("block");
  });

  it("fails closed when velocity storage is unavailable and explicitly configured", async () => {
    const rule = makeRule({
      id: "velocity_count",
      rule_type: "velocity_count",
      config: { window_seconds: 3600, max_count: 5, scope: "agent" },
    });
    const { db } = mockVelocityDb({ count: null, error: { message: "database unavailable" } });
    const previous = process.env.AUREL_VELOCITY_FAIL_MODE;
    process.env.AUREL_VELOCITY_FAIL_MODE = "closed";
    try {
      const result = await evaluateVelocityCount(rule, { intent: makeIntent(), db });
      expect(result).toMatchObject({ decision: "block", risk_score: 100 });
    } finally {
      if (previous === undefined) delete process.env.AUREL_VELOCITY_FAIL_MODE;
      else process.env.AUREL_VELOCITY_FAIL_MODE = previous;
    }
  });
});
