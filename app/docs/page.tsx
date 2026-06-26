"use client";

import { useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";

const DOC_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: `
## Installation

Install the IntentGuard SDK:

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

3. Verify a payment intent:

\`\`\`typescript
const decision = await ig.verify({
  intent_id: "pay_2026_0001",
  agent_id: "ag_expense_manager_v1",
  amount: 250,
  currency: "USD",
  recipient: "billing@stripe.com",
  agent_context: "Renewing approved SaaS subscription.",
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
  "intent_id": "pay_2026_0001",
  "agent_id": "ag_expense_manager_v1",
  "amount": 250,
  "currency": "USD",
  "recipient": "billing@stripe.com",
  "agent_context": "Renewing approved SaaS subscription."
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
  "intent_id": "pay_2026_0001"
}
\`\`\`

### Decision Values

- \`allow\` - Transaction is safe to proceed
- \`flag\` - Transaction requires manual review
- \`block\` - Transaction should be blocked
`,
  },
  {
    id: "layers",
    title: "Verification Layers",
    content: `
## Layer 1: Deterministic Rules

Sub-millisecond evaluation with zero external calls:

- **Amount thresholds** - Hard caps and soft limits per transaction
- **Allowlists/Denylists** - Approved and blocked recipients
- **Currency restrictions** - Block crypto or specific currencies
- **Velocity limits** - Per-agent rate limits and cumulative spend

## Layer 2: Velocity & Behavioral Analysis

Stateful analysis backed by Redis:

- Transaction frequency (per minute, hour, day)
- Cumulative spend windows
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
`,
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(DOC_SECTIONS[0].id);

  const activeContent = DOC_SECTIONS.find((s) => s.id === activeSection);

  return (
    <div className="flex min-h-screen bg-[#09090e]">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Documentation</h1>
          <p className="text-zinc-400 mb-8">Complete guide to integrating IntentGuard</p>

          <div className="flex gap-8">
            {/* Sidebar Navigation */}
            <aside className="w-64 flex-shrink-0">
              <nav className="sticky top-8 space-y-2">
                {DOC_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                      activeSection === section.id
                        ? "bg-violet-600/20 text-violet-400 border border-violet-500/30"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Content */}
            <div className="flex-1">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
                <h2 className="text-2xl font-semibold text-white mb-6">{activeContent?.title}</h2>
                <div className="prose prose-invert prose-zinc max-w-none">
                  <div className="text-zinc-300 leading-relaxed whitespace-pre-line">
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
