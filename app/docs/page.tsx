"use client";

import { useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";

const DOC_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: `
## Installation

Install the Aurel SDK package:

\`\`\`bash
npm install intentguard
\`\`\`

## Quick Start

1. Create an account and get your API key from the dashboard
2. Initialize the client:

\`\`\`typescript
import { createIntentGuardClient } from "intentguard/sdk";

const ig = createIntentGuardClient({
  apiKey: process.env.INTENTGUARD_API_KEY!,
  baseUrl: "https://your-deployment.vercel.app",
});
\`\`\`

3. Verify an action intent. This example protects a payment action:

\`\`\`typescript
const decision = await ig.verify({
  intent_id: "act_2026_0001",
  agent_id: "ag_expense_manager_v1",
  amount: 250,
  currency: "USD",
  recipient: "billing@stripe.com",
  agent_context: "Renewing approved SaaS subscription.",
  metadata: { action_type: "payment" },
});
\`\`\`
`,
  },
  {
    id: "api-reference",
    title: "API Reference",
    content: `
## POST /api/v1/verify

Authenticates via \`x-api-key\` header. Returns a decision with risk score, triggered layer, and full audit entry.

### Request Body

\`\`\`json
{
  "intent_id": "act_2026_0001",
  "agent_id": "ag_expense_manager_v1",
  "amount": 250,
  "currency": "USD",
  "recipient": "billing@stripe.com",
  "agent_context": "Renewing approved SaaS subscription.",
  "metadata": { "action_type": "payment" }
}
\`\`\`

### Response

\`\`\`json
{
  "decision": "allow",
  "reason": "All verification layers passed",
  "risk_score": 5,
  "triggered_rule": null,
  "evaluated_at": "2026-06-26T12:00:00Z",
  "intent_id": "act_2026_0001",
  "audit_signature": "8f1c...",
  "audit_signature_version": "audit-v1-hmac-sha256"
}
\`\`\`

### Decision Values

- \`allow\` - Action is safe to proceed
- \`flag\` - Action requires manual review
- \`block\` - Action should be blocked
`,
  },
  {
    id: "layers",
    title: "Verification Layers",
    content: `
## Layer 1: Deterministic Rules

Sub-millisecond evaluation with zero external calls:

- **Action thresholds** - Hard caps and soft limits for protected actions
- **Allowlists/Denylists** - Approved and blocked targets
- **Route restrictions** - Block forbidden destinations or action classes
- **Velocity limits** - Per-agent rate limits and cumulative exposure

## Layer 2: Velocity & Behavioral Analysis

Stateful analysis backed by Redis:

- Action frequency (per minute, hour, day)
- Cumulative exposure windows
- Agent activity patterns
- Historical baseline comparison

## Layer 3: Semantic Analysis

Claude AI analyzes the agent's reasoning:

- **Prompt injection detection** - Identifies injected instructions
- **Social engineering** - Authority spoofing, urgency manipulation
- **Mission drift** - Detects when agent goes beyond its scope
- **Suspicious provenance** - Flags unusual instruction sources
`,
  },
  {
    id: "webhooks",
    title: "Webhooks",
    content: `
## Setup

Configure webhooks in your workspace settings to receive real-time notifications.

### Events

- \`payment.escalation\` - Triggered when risk_score exceeds threshold
- \`audit.nightly_export\` - Daily audit log export
- \`siem.audit_export\` - SIEM integration exports

### Payload Example

\`\`\`json
{
  "event": "payment.escalation",
  "intent_id": "pay_2026_0001",
  "transaction": {
    "amount": 4500,
    "currency": "USD",
    "recipient": "unknown@vendor.com",
    "agent_id": "ag_expense_manager_v1"
  },
  "decision": "flag",
  "reason": "Semantic anomaly detected",
  "risk_score": 75,
  "timestamp": "2026-06-26T12:00:00Z"
}
\`\`\`

### Security

Webhooks are signed with HMAC-SHA256 using your webhook secret. Verify signatures to ensure authenticity.
Audit exports include a separate HMAC-SHA256 signature for each persisted verification decision.
`,
  },
  {
    id: "audit",
    title: "Audit Verification",
    content: `
## Signed Audit Trail

Each persisted verification decision includes an HMAC-SHA256 signature over the immutable decision fields.

### Verify a stored log

\`\`\`bash
curl "https://your-deployment.vercel.app/api/v1/workspace/audit-verify?intent_id=pay_2026_0001" \\
  -H "x-api-key: YOUR_API_KEY"
\`\`\`

### Verify an exported record

\`\`\`bash
curl -X POST "https://your-deployment.vercel.app/api/v1/audit/verify" \\
  -H "Content-Type: application/json" \\
  -d '{
    "record": {
      "workspace_id": "00000000-0000-0000-0000-000000000001",
      "intent_id": "pay_2026_0001",
      "agent_id": "ag_expense_manager_v1",
      "recipient": "billing@stripe.com",
      "merchant_id": null,
      "amount": 250,
      "currency": "USD",
      "decision": "allow",
      "triggered_rule": null,
      "risk_score": 5,
      "evaluated_at": "2026-07-11T12:00:00.000Z"
    },
    "audit_signature": "8f1c...",
    "audit_signature_version": "audit-v1-hmac-sha256"
  }'
\`\`\`
`,
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(DOC_SECTIONS[0].id);

  const activeContent = DOC_SECTIONS.find((s) => s.id === activeSection);

  return (
    <div className="flex min-h-screen aurel-bg">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="aurel-kicker mb-3">Docs / integration manual</div>
          <h1 className="aurel-title text-4xl mb-2">Documentation</h1>
          <p className="text-stone-400 mb-8">Complete guide to integrating Aurel before autonomous action execution.</p>

          <div className="flex gap-8">
            {/* Sidebar Navigation */}
            <aside className="w-64 flex-shrink-0">
              <nav className="sticky top-8 space-y-2">
                {DOC_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full border px-4 py-2 text-left font-mono text-xs uppercase tracking-[0.08em] transition-colors ${
                      activeSection === section.id
                        ? "border-stone-500 bg-stone-100 text-black"
                        : "border-transparent text-stone-500 hover:border-stone-800 hover:bg-stone-950 hover:text-stone-200"
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Content */}
            <div className="flex-1">
              <div className="aurel-panel p-8">
                <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100 mb-6">{activeContent?.title}</h2>
                <div className="prose prose-invert prose-zinc max-w-none">
                  <div className="text-stone-300 leading-relaxed whitespace-pre-line">
                    {activeContent?.content}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
