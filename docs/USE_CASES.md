# Aurel — Advanced Use Cases

These are the product-level scenarios Aurel should handle well before a paid pilot.

## 1. Autonomous SaaS Renewal

**Buyer:** finance ops agent  
**Risk:** legitimate renewal, but amount or recipient may drift from policy  
**Controls used:** approved recipients, vendor cap, category cap, signed audit log

Expected outcome:
- Allow routine renewals to known vendors under cap
- Block renewals above the vendor cap
- Preserve a signed audit record for later finance review

Example intent:

```json
{
  "intent_id": "pay_saas_renewal_001",
  "agent_id": "ag_finance_ops",
  "amount": 4800,
  "currency": "USD",
  "recipient": "billing@stripe.com",
  "merchant_id": "stripe",
  "agent_context": "Renewing annual Stripe subscription INV-2026-0892 within approved vendor list.",
  "metadata": { "category": "saas" }
}
```

## 2. Compromised Agent Redirect

**Buyer:** procurement agent  
**Risk:** prompt injection redirects a valid purchase to a new recipient  
**Controls used:** strict recipient allowlist, semantic injection detection, webhook escalation

Expected outcome:
- Block if recipient is outside the approved list
- Block or flag if the context includes override language, urgency manipulation, or audit suppression
- Queue a webhook escalation for security/finance

## 3. High-Value Hardware Procurement

**Buyer:** procurement agent  
**Risk:** valid category, invalid amount  
**Controls used:** per-category cap, per-agent cap, velocity amount windows

Expected outcome:
- Allow normal equipment purchases under the cap
- Block transactions above the hardware cap
- Flag repeated purchases that individually pass but exceed velocity thresholds

## 4. Marketplace Creator Payouts

**Buyer:** marketplace payout agent  
**Risk:** frequent small payouts can become aggregate abuse  
**Controls used:** category allowlist, per-agent velocity, webhook threshold

Expected outcome:
- Allow approved creator payouts
- Block disallowed categories
- Escalate bursts or unusual cumulative spend

## 5. Off-Hours Treasury Movement

**Buyer:** treasury automation agent  
**Risk:** payments outside finance operating windows  
**Controls used:** timezone-aware time restrictions, strict recipients, signed audit export

Expected outcome:
- Block payments outside configured business hours
- Retain a signed audit trail for treasury review

## Product Gaps To Close

- Add a UI action to verify a selected audit log signature.
- Add historical backfill for unsigned logs.
- Add mandate objects for Phase 2: signed user instruction, allowed merchant/amount/category, expiration, and verifier identity.
- Add canned pilot templates: SaaS spend guardrail, procurement guardrail, marketplace payout guardrail, treasury guardrail.
