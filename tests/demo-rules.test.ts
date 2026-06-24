import { describe, it, expect } from "vitest";
import { evaluateRules, evaluateVelocity } from "@/lib/demo/rules";

// ── evaluateRules ─────────────────────────────────────────────────────────────

describe("evaluateRules — denylist", () => {
  it("blocks .ru recipient", () => {
    const r = evaluateRules(100, "USD", "payments@offshore-account.ru");
    expect(r.decision).toBe("block");
    expect(r.risk_score).toBe(100);
    expect(r.passed).toBe(false);
  });

  it("blocks .cn recipient", () => {
    const r = evaluateRules(100, "USD", "vendor@shady.cn");
    expect(r.decision).toBe("block");
    expect(r.risk_score).toBe(100);
  });

  it("blocks recipient containing 'offshore'", () => {
    const r = evaluateRules(100, "USD", "pay@offshore-bank.com");
    expect(r.decision).toBe("block");
  });

  it("blocks recipient containing 'anonymous'", () => {
    const r = evaluateRules(50, "USD", "anonymous@example.com");
    expect(r.decision).toBe("block");
  });

  it("skips remaining checks after denylist hit", () => {
    const r = evaluateRules(100, "USD", "pay@bad.ru");
    const skipped = r.checks.filter((c) => c.skipped);
    expect(skipped).toHaveLength(3);
  });

  it("allows clean recipient", () => {
    const r = evaluateRules(100, "USD", "billing@stripe.com");
    expect(r.decision).toBe("allow");
    expect(r.passed).toBe(true);
  });
});

describe("evaluateRules — amount hard cap", () => {
  it("blocks amount > 50,000", () => {
    const r = evaluateRules(50_001, "USD", "billing@stripe.com");
    expect(r.decision).toBe("block");
    expect(r.risk_score).toBe(100);
  });

  it("blocks exactly at 50,001", () => {
    const r = evaluateRules(50_001, "USD", "billing@stripe.com");
    expect(r.decision).toBe("block");
  });

  it("flags exactly 50,000 (hard cap requires > 50k, but soft limit still applies)", () => {
    const r = evaluateRules(50_000, "USD", "billing@stripe.com");
    // 50,000 does NOT trigger hard cap (> 50,000), but DOES trigger soft limit (> 10,000)
    expect(r.decision).toBe("flag");
    const hardCapCheck = r.checks.find((c) => c.rule_id === "RULE_AMOUNT_HARD_CAP");
    expect(hardCapCheck?.triggered).toBe(false);
  });

  it("skips RULE_AMOUNT_SOFT_LIMIT and RULE_CRYPTO_RESTRICTION when hard cap triggers", () => {
    const r = evaluateRules(60_000, "USD", "billing@stripe.com");
    const softLimit = r.checks.find((c) => c.rule_id === "RULE_AMOUNT_SOFT_LIMIT");
    const crypto = r.checks.find((c) => c.rule_id === "RULE_CRYPTO_RESTRICTION");
    expect(softLimit?.skipped).toBe(true);
    expect(crypto?.skipped).toBe(true);
  });
});

describe("evaluateRules — soft limit", () => {
  it("flags amount > 10,000 (USD)", () => {
    const r = evaluateRules(10_001, "USD", "billing@figma.com");
    expect(r.decision).toBe("flag");
    expect(r.risk_score).toBe(65);
  });

  it("allows amount exactly 10,000", () => {
    const r = evaluateRules(10_000, "USD", "billing@stripe.com");
    expect(r.decision).toBe("allow");
  });

  it("flags 47,832 USD (within hard cap, over soft)", () => {
    const r = evaluateRules(47_832, "USD", "billing@aws.amazon.com");
    expect(r.decision).toBe("flag");
  });
});

describe("evaluateRules — crypto restriction", () => {
  it("blocks ETH > 5,000", () => {
    const r = evaluateRules(5_001, "ETH", "0x742d35Cc");
    expect(r.decision).toBe("block");
    expect(r.risk_score).toBe(90);
  });

  it("flags ETH <= 5,000", () => {
    const r = evaluateRules(100, "ETH", "0x742d35Cc");
    expect(r.decision).toBe("flag");
  });

  it("flags USDC", () => {
    const r = evaluateRules(100, "USDC", "wallet@defi.io");
    expect(r.decision).toBe("flag");
  });

  it("flags BTC", () => {
    const r = evaluateRules(100, "BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
    expect(r.decision).toBe("flag");
  });

  it("allows USD without restriction", () => {
    const r = evaluateRules(200, "USD", "billing@stripe.com");
    const cryptoCheck = r.checks.find((c) => c.rule_id === "RULE_CRYPTO_RESTRICTION");
    expect(cryptoCheck?.triggered).toBe(false);
  });

  it("crypto restriction check includes currency detail", () => {
    const r = evaluateRules(100, "ETH", "wallet@defi.io");
    const cryptoCheck = r.checks.find((c) => c.rule_id === "RULE_CRYPTO_RESTRICTION");
    expect(cryptoCheck?.detail).toContain("ETH");
  });
});

describe("evaluateRules — result shape", () => {
  it("always returns 4 checks (some may be skipped)", () => {
    const r = evaluateRules(200, "USD", "billing@stripe.com");
    expect(r.checks).toHaveLength(4);
  });

  it("exec_us is sum of all check exec_us", () => {
    const r = evaluateRules(200, "USD", "billing@stripe.com");
    const sum = r.checks.reduce((a, c) => a + c.exec_us, 0);
    expect(r.exec_us).toBe(sum);
  });

  it("all checks have required shape", () => {
    const r = evaluateRules(200, "USD", "billing@stripe.com");
    for (const check of r.checks) {
      expect(check).toHaveProperty("rule_id");
      expect(check).toHaveProperty("triggered");
      expect(check).toHaveProperty("skipped");
      expect(check).toHaveProperty("exec_us");
      expect(check).toHaveProperty("detail");
    }
  });
});

// ── evaluateVelocity ──────────────────────────────────────────────────────────

describe("evaluateVelocity", () => {
  it("allows clean context", () => {
    const r = evaluateVelocity("Renew Stripe subscription INV-2026-0892.");
    expect(r.decision).toBe("allow");
    expect(r.passed).toBe(true);
    expect(r.risk_score).toBe(0);
  });

  it("flags 'transaction 3 of 8' pattern", () => {
    const r = evaluateVelocity("Processing transaction 3 of 8 in batch.");
    expect(r.decision).toBe("flag");
    expect(r.risk_score).toBe(80);
  });

  it("flags '5 transactions in the last 30 seconds'", () => {
    const r = evaluateVelocity("Sent 5 transactions in the last 30 seconds.");
    expect(r.decision).toBe("flag");
  });

  it("flags 'in the last 10 seconds'", () => {
    const r = evaluateVelocity("Processed payment in the last 10 seconds.");
    expect(r.decision).toBe("flag");
  });

  it("result has 2 velocity checks", () => {
    const r = evaluateVelocity("Normal context.");
    expect(r.checks).toHaveLength(2);
  });

  it("VELOCITY_AMOUNT_1H is never triggered (no historical data in demo)", () => {
    const r = evaluateVelocity("5 transactions in the last 30 seconds");
    const amountCheck = r.checks.find((c) => c.check_id === "VELOCITY_AMOUNT_1H");
    expect(amountCheck?.triggered).toBe(false);
  });

  it("exec_us is sum of check exec_us", () => {
    const r = evaluateVelocity("Normal context.");
    const sum = r.checks.reduce((a, c) => a + c.exec_us, 0);
    expect(r.exec_us).toBe(sum);
  });
});
