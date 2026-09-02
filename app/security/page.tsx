import type { Metadata } from "next";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Aurels protects autonomous actions with deterministic policy, behavior checks, semantic intent analysis, and signed audit trails.",
  alternates: {
    canonical: "/security",
  },
};

const layers = [
  {
    title: "Deterministic Rules",
    text: "Action limits, target allowlists and denylists, route restrictions, and workspace policy checks run before any semantic model call.",
  },
  {
    title: "Velocity Analysis",
    text: "Aurels tracks agent-level frequency and exposure windows to identify abnormal bursts, repeated attempts, and cumulative operational risk.",
  },
  {
    title: "Semantic Intent Analysis",
    text: "Aurels evaluates the agent context for prompt injection, social engineering, mission drift, suspicious provenance, and action-reasoning mismatch.",
  },
  {
    title: "Signed Audit Trail",
    text: "Persisted decisions can carry canonical HMAC-SHA256 signatures so exported audit records can be checked for tampering.",
  },
];

export default function SecurityPage() {
  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow="Security / pre-execution control" title="Security for autonomous execution">
        Aurels is built for teams that need runtime guardrails before autonomous agents can act.
        It verifies intent, checks workspace policy, and preserves an auditable decision trail.
      </AurelPublicHeader>

      <AurelGridSection>
        <div className="grid border border-stone-800 md:grid-cols-2">
          {layers.map((layer) => (
            <article key={layer.title} className="border-b border-stone-800 bg-black/55 p-6 even:md:border-l md:[&:nth-last-child(-n+2)]:border-b-0">
              <h2 className="text-xl font-black uppercase tracking-tight text-stone-100">{layer.title}</h2>
              <p className="mt-4 leading-7 text-stone-400">{layer.text}</p>
            </article>
          ))}
        </div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
