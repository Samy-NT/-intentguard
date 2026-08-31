import type { Metadata } from "next";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";

export const metadata: Metadata = {
  title: "Use Cases",
  description:
    "Practical Aurel use cases for securing autonomous actions before execution: payments, approvals, procurement, data access, external tools, and operational workflows.",
  alternates: {
    canonical: "/use-cases",
  },
};

const useCases = [
  {
    label: "Financial actions",
    title: "Payments, payouts, renewals",
    decision: "ALLOW / FLAG / BLOCK",
    text: "Verify invoices, SaaS renewals, marketplace payouts, wallet transfers, card payments, and vendor charges before money moves.",
  },
  {
    label: "Procurement",
    title: "Purchases and vendor changes",
    decision: "POLICY GATE",
    text: "Check supplier identity, purchase limits, category scope, approval provenance, and contract boundaries before an agent places an order.",
  },
  {
    label: "Data access",
    title: "Exports and sensitive reads",
    decision: "SCOPE CHECK",
    text: "Stop agents from exporting private records, pulling restricted datasets, or mixing user-visible tasks with hidden extraction instructions.",
  },
  {
    label: "Operational tools",
    title: "Deploys, tickets, account changes",
    decision: "INTENT LOCK",
    text: "Validate whether an autonomous tool call matches the mission before it changes infrastructure, closes support cases, or modifies an account.",
  },
  {
    label: "Agent platforms",
    title: "Action runtime guardrails",
    decision: "RUNTIME VERDICT",
    text: "Wrap high-consequence tools with a single verification step so every action has policy, behavior, semantic intent, and audit context.",
  },
  {
    label: "Audit and compliance",
    title: "Signed decision records",
    decision: "AUDIT READY",
    text: "Preserve tamper-checkable evidence of what the agent intended, which policy was applied, and why the decision was allowed, flagged, or blocked.",
  },
];

const lanes = [
  ["Agent request", "The agent proposes an action with context, target, scope, and supporting trace."],
  ["Intent firewall", "Aurel checks policy, behavior, semantic alignment, provenance, and risk."],
  ["Decision pass", "The runtime receives allow, flag, or block before the downstream tool executes."],
];

export default function UseCasesPage() {
  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow="Use cases / autonomous actions" title="Where the gate belongs">
        Aurel belongs before high-consequence autonomous actions. Payments are one
        important lane; the broader pattern is intent verification before an agent&apos;s
        decision passes into a real tool, system, workflow, or external service.
      </AurelPublicHeader>

      <AurelGridSection>
        <div className="grid border border-stone-800 md:grid-cols-3">
          {lanes.map(([title, text], index) => (
            <article
              key={title}
              className={`aurel-surface-line min-h-[210px] bg-black/55 p-6 ${
                index < lanes.length - 1 ? "border-b border-stone-800 md:border-b-0 md:border-r" : ""
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-700">
                PASS {String(index + 1).padStart(2, "0")}
              </div>
              <h2 className="mt-8 text-xl font-black uppercase tracking-tight text-stone-100">{title}</h2>
              <p className="mt-4 leading-7 text-stone-400">{text}</p>
            </article>
          ))}
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="mb-10 grid gap-6 lg:grid-cols-[0.72fr_1fr] lg:items-end">
          <div>
            <div className="aurel-kicker mb-3">Use-case matrix</div>
            <h2 className="aurel-title text-3xl md:text-5xl">Autonomy needs a checkpoint.</h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-stone-400">
            Use Aurel wherever an agent can cross from recommendation into execution.
            The endpoint can protect financial actions today, and the model generalizes
            to any action where intent, policy, and auditability matter.
          </p>
        </div>

        <div className="grid border border-stone-800 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((item, index) => (
            <article
              key={item.title}
              className="aurel-surface-line min-h-[260px] border-b border-stone-800 bg-black/55 p-6 md:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-700">
                  {String(index + 1).padStart(2, "0")} / {item.label}
                </div>
                <div className="border border-stone-800 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">
                  {item.decision}
                </div>
              </div>
              <h3 className="mt-9 text-xl font-black uppercase tracking-tight text-stone-100">{item.title}</h3>
              <p className="mt-4 leading-7 text-stone-400">{item.text}</p>
            </article>
          ))}
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="grid gap-8 border-y border-stone-800 py-12 lg:grid-cols-[0.85fr_1fr] lg:items-center">
          <div>
            <div className="aurel-kicker mb-3">Feature lane / payments</div>
            <h2 className="aurel-title text-3xl md:text-5xl">Money is the first proof.</h2>
          </div>
          <div className="text-lg leading-8 text-stone-400">
            The live console still uses a payment scenario because financial actions
            make intent risk easy to inspect: target, amount, provenance, policy,
            velocity, decision, and signed audit. Aurel&apos;s product position is broader:
            secure the intent before any autonomous action executes.
          </div>
        </div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
