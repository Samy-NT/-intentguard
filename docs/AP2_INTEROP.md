# Aurel AP2 Interoperability Notes

Last updated: 2026-09-01

Sources:
- Google Cloud announcement: https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol
- AP2 v0.2 specification: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md
- AP2 checkout mandate: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/checkout_mandate.md
- AP2 payment mandate: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/payment_mandate.md
- AP2 security and privacy considerations: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/security_and_privacy_considerations.md

## Positioning

Aurel signed mandates are a runtime policy and evidence layer for agent actions. They are not native AP2 SD-JWT mandates. The compatibility profile maps Aurel constraints onto AP2 v0.2 concepts so operators can align private-pilot controls with AP2-style payment authorization while keeping the integration honest.

## Supported Mapping

| Aurel field | AP2 concept |
|-------------|-------------|
| `max_amount` + `currency` | `payment.amount_range` |
| `allowed_recipients` | `payment.allowed_payees` |
| `allowed_merchants` | `checkout.allowed_merchants` |
| `expires_at` | `payment.execution_date` upper bound |
| `agent_id` | agent-bound mandate use |
| `ap2.checkout_hash` | checkout binding guard |
| `ap2.transaction_id` | payment transaction binding guard |
| `mission_scope` | operator-visible intent context |

## Runtime Enforcement

When a signed Aurel mandate includes an `ap2` block, `POST /api/v1/verify` enforces:

- `metadata.checkout_hash` must match `mandate.payload.ap2.checkout_hash` when provided.
- `metadata.transaction_id` must match `mandate.payload.ap2.transaction_id` when provided.
- Existing mandate controls still apply: workspace, expiry, agent, amount, currency, recipient, merchant, and category.

This directly targets the AP2 threat class where a valid mandate is replayed or redirected to a different checkout or payment context.

## API Example

```json
{
  "expires_at": "2026-09-02T10:00:00.000Z",
  "mission_scope": "Buy approved SaaS renewals",
  "agent_id": "agent_1",
  "max_amount": 500,
  "currency": "USD",
  "allowed_recipients": ["billing@stripe.com"],
  "allowed_merchants": ["stripe"],
  "ap2": {
    "protocol_version": "v0.2",
    "mode": "human_not_present",
    "vct": "mandate.payment.open.1",
    "checkout_hash": "merchant-checkout-hash",
    "transaction_id": "payment-transaction-id"
  }
}
```

`POST /api/v1/mandates` returns `ap2_profile`, including mapped constraints, context bindings, and limitations.

## Limitations

- Aurel does not issue AP2 SD-JWT checkout or payment mandates.
- Aurel does not issue AP2 checkout receipts or payment receipts.
- Aurel does not act as a Credential Provider, Network, Merchant, or Merchant Payment Processor.
- Selective disclosure, wallet signing, payment credential issuance, and AP2 dispute bundle exchange must be handled by an AP2-native component.
