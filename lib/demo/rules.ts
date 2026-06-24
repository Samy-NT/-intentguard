// Extracted from app/api/demo/verify/route.ts for testability

import type {
  RulesLayerResult,
  VelocityLayerResult,
  RuleSignals,
  VelocitySignals,
} from "@/app/api/demo/verify/route";

export type { RulesLayerResult, VelocityLayerResult };

function simUs(base: number, variance = 15): number {
  return base + Math.floor(Math.random() * variance);
}

// FNV-1a hash — kept in sync with route.ts
function generateAgentHistory(agentId: string, amount: number): VelocitySignals {
  let h = 0x811c9dc5;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  if ((h % 10) === 0) {
    return {
      tx_count_1min: 0, tx_limit_1min: 5,
      tx_count_1h: 0, tx_limit_1h: 20,
      tx_count_24h: 0, tx_limit_24h: 50,
      cumulative_amount_1h: 0, cumulative_limit_1h: 25000,
      agent_history_24h: "░".repeat(24),
      peak_tx_per_hour: 0,
      is_first_transaction: true,
    };
  }

  const tx24h = 1 + ((h >> 4) % 10);
  const tx1h = (h >> 8) % Math.min(3, tx24h + 1);
  const tx1min = ((h >> 12) % 7) === 0 && tx1h > 0 ? 1 : 0;
  const peak = 1 + ((h >> 16) % 3);
  const cumulative1h = tx1h * Math.round(amount * (0.6 + ((h >> 20) % 80) / 100));

  const barChars = ["░", "▒", "▓", "█"];
  const history: string[] = [];
  for (let i = 0; i < 24; i++) {
    const bits = (h >> (i % 14)) & 0x3;
    const recentBias = i >= 21 ? 1 : 0;
    history.push(barChars[Math.min(3, Math.max(0, Math.floor((bits * tx24h) / 10) + recentBias))]);
  }
  if (tx1h > 0) history[23] = "█";

  return {
    tx_count_1min: tx1min, tx_limit_1min: 5,
    tx_count_1h: tx1h, tx_limit_1h: 20,
    tx_count_24h: tx24h, tx_limit_24h: 50,
    cumulative_amount_1h: cumulative1h, cumulative_limit_1h: 25000,
    agent_history_24h: history.join(""),
    peak_tx_per_hour: peak,
    is_first_transaction: false,
  };
}

export function evaluateRules(
  amount: number,
  currency: string,
  recipient: string
): RulesLayerResult {
  const checks: RulesLayerResult["checks"] = [];
  let decision: "allow" | "flag" | "block" = "allow";
  let risk_score = 5;
  let detail = "All deterministic rules passed";
  const isCrypto = ["ETH", "USDC", "USDT", "BTC"].includes(currency.toUpperCase());

  const signals: RuleSignals = {
    amount,
    currency,
    currency_class: isCrypto ? "crypto" : "fiat",
    hard_cap: 50_000,
    soft_limit: 10_000,
    amount_pct_of_hard_cap: Math.round((amount / 50_000) * 1000) / 10,
    amount_pct_of_soft_limit: Math.round((amount / 10_000) * 1000) / 10,
    recipient: recipient.slice(0, 60),
    denylist_entry_count: 3,
    crypto_limit: 5_000,
  };

  // RULE_DENYLIST_RECIPIENT
  const isDenylisted = /\.ru$|\.cn$|offshore|anonymous/i.test(recipient);
  checks.push({
    rule_id: "RULE_DENYLIST_RECIPIENT",
    triggered: isDenylisted,
    skipped: false,
    exec_us: simUs(18, 22),
    detail: isDenylisted
      ? `"${recipient.slice(0, 40)}" matches workspace denylist pattern`
      : `"${recipient.slice(0, 40)}" not in ${signals.denylist_entry_count}-entry denylist`,
  });

  if (isDenylisted) {
    const skipped = { triggered: false, skipped: true, exec_us: 0 };
    checks.push({ rule_id: "RULE_AMOUNT_HARD_CAP", ...skipped, detail: "skipped — prior rule triggered block" });
    checks.push({ rule_id: "RULE_AMOUNT_SOFT_LIMIT", ...skipped, detail: "skipped — prior rule triggered block" });
    checks.push({ rule_id: "RULE_CRYPTO_RESTRICTION", ...skipped, detail: "skipped — prior rule triggered block" });
    const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);
    return { passed: false, decision: "block", detail: "Recipient matches workspace denylist", risk_score: 100, checks, exec_us, signals };
  }

  // RULE_AMOUNT_HARD_CAP
  const exceedsHard = amount > 50_000;
  checks.push({
    rule_id: "RULE_AMOUNT_HARD_CAP",
    triggered: exceedsHard,
    skipped: false,
    exec_us: simUs(8, 10),
    detail: `${currency} ${amount.toLocaleString()} — ${signals.amount_pct_of_hard_cap}% of ${currency} 50,000 cap`,
  });

  if (exceedsHard) {
    const skipped = { triggered: false, skipped: true, exec_us: 0, detail: "skipped — hard cap triggered" };
    checks.push({ rule_id: "RULE_AMOUNT_SOFT_LIMIT", ...skipped });
    checks.push({ rule_id: "RULE_CRYPTO_RESTRICTION", ...skipped });
    const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);
    return { passed: false, decision: "block", detail: `Amount ${amount} ${currency} exceeds hard cap of 50,000`, risk_score: 100, checks, exec_us, signals };
  }

  // RULE_AMOUNT_SOFT_LIMIT
  const exceedsSoft = amount > 10_000;
  checks.push({
    rule_id: "RULE_AMOUNT_SOFT_LIMIT",
    triggered: exceedsSoft,
    skipped: false,
    exec_us: simUs(7, 9),
    detail: `${currency} ${amount.toLocaleString()} — ${signals.amount_pct_of_soft_limit}% of ${currency} 10,000 soft limit`,
  });

  if (exceedsSoft) {
    decision = "flag";
    risk_score = 65;
    detail = `Amount ${amount} ${currency} exceeds soft limit threshold`;
  }

  // RULE_CRYPTO_RESTRICTION
  const cryptoBlock = isCrypto && amount > 5_000;
  const cryptoFlag = isCrypto && !cryptoBlock;
  checks.push({
    rule_id: "RULE_CRYPTO_RESTRICTION",
    triggered: cryptoBlock || cryptoFlag,
    skipped: false,
    exec_us: simUs(6, 8),
    detail: isCrypto
      ? `${currency} classified as restricted digital asset (limit: ${currency} 5,000)`
      : `${currency} is fiat — crypto restriction not applicable`,
  });

  if (cryptoBlock) {
    decision = "block";
    risk_score = 90;
    detail = `Crypto transaction of ${amount} ${currency} exceeds workspace crypto limit of 5,000`;
  } else if (cryptoFlag && decision === "allow") {
    decision = "flag";
    risk_score = Math.max(risk_score, 65);
    detail = "Crypto transaction requires manual review per workspace policy";
  }

  const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);
  return {
    passed: decision === "allow",
    decision,
    detail: decision === "allow" ? "All deterministic rules passed" : detail,
    risk_score,
    checks,
    exec_us,
    signals,
  };
}

export function evaluateVelocity(
  context: string,
  agentId = "demo",
  amount = 0
): VelocityLayerResult {
  const velocityPattern =
    /transaction\s+\d+\s+of\s+\d+|in\s+the\s+last\s+\d+\s+seconds?|\d+\s+transactions?\s+(in|over|within)\s+the\s+last/i;
  const isVelocityAttack = velocityPattern.test(context);

  const signals = generateAgentHistory(agentId, amount);

  const checks: VelocityLayerResult["checks"] = [
    {
      check_id: "VELOCITY_TX_COUNT_1MIN",
      triggered: isVelocityAttack,
      exec_us: simUs(20, 25),
      detail: isVelocityAttack
        ? "agent context indicates multiple rapid transactions — exceeds 5 tx/min limit"
        : `${signals.tx_count_1min} tx in last 60s (limit: ${signals.tx_limit_1min})`,
    },
    {
      check_id: "VELOCITY_AMOUNT_1H",
      triggered: false,
      exec_us: simUs(14, 18),
      detail: signals.is_first_transaction
        ? `$0 cumulative in last 1h — first transaction from this agent (limit: $${signals.cumulative_limit_1h.toLocaleString()})`
        : `$${signals.cumulative_amount_1h.toLocaleString()} cumulative in last 1h (limit: $${signals.cumulative_limit_1h.toLocaleString()})`,
    },
  ];

  const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);

  if (isVelocityAttack) {
    return {
      passed: false,
      decision: "flag",
      detail: "Velocity limit triggered — multiple rapid transactions detected in agent context",
      risk_score: 80,
      checks,
      exec_us,
      signals,
    };
  }

  return {
    passed: true,
    decision: "allow",
    detail: "All velocity checks passed — agent within rate limits",
    risk_score: 0,
    checks,
    exec_us,
    signals,
  };
}
