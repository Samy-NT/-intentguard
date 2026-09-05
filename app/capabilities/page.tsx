import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Boxes, Cloud, Code2, Fingerprint, GitBranch, Radar, ShieldCheck, Siren, Wrench } from "lucide-react";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";
import { agentTypes, capabilities } from "@/lib/capabilities";

export const metadata: Metadata = {
  title: "Capabilities",
  description: "Aurels capabilities for observing, governing, and enforcing secure autonomous agent actions.",
  alternates: { canonical: "/capabilities" },
};

const icons = [Activity, ShieldCheck, Radar, GitBranch, Fingerprint, Wrench, Siren];
const agentIcons = [Cloud, Code2, Boxes];

export default function CapabilitiesPage() {
  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow="Platform / capabilities" title="One control plane for agent risk">
        Aurels connects visibility, posture, exposure, identity, runtime boundaries, MCP controls, and response into one intent-aware security layer. Start with the capability your team needs now; keep the same audit model as your agent estate grows.
      </AurelPublicHeader>

      <AurelGridSection>
        <div className="mb-9 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="aurel-kicker mb-3">Seven control surfaces</div>
            <h2 className="aurel-title text-3xl md:text-5xl">From inventory to response.</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-stone-400">Every surface shares agent identity, policy version, evidence, and a decision that can be allowed, flagged, or blocked.</p>
        </div>
        <div className="grid border border-stone-800 bg-stone-800 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, index) => {
            const Icon = icons[index];
            return (
              <Link key={capability.slug} href={`/capabilities/${capability.slug}`} className="group aurel-surface-line min-h-[280px] bg-black/70 p-6 transition-colors hover:bg-stone-950">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center border border-stone-700 bg-stone-950 text-stone-200 transition-colors group-hover:border-stone-400 group-hover:text-white"><Icon className="h-5 w-5" /></div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="mt-7 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">{capability.shortLabel}</div>
                <h3 className="mt-2 text-xl font-black uppercase tracking-tight text-stone-100">{capability.name}</h3>
                <p className="mt-3 text-sm leading-6 text-stone-400">{capability.summary}</p>
                <div className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-stone-300 group-hover:text-white">Explore capability →</div>
              </Link>
            );
          })}
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="mb-9 grid gap-5 lg:grid-cols-[0.65fr_1fr] lg:items-end">
          <div>
            <div className="aurel-kicker mb-3">Agent type coverage</div>
            <h2 className="aurel-title text-3xl md:text-5xl">Meet agents where they run.</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-stone-400">Use the same intent firewall across managed SaaS agents, developer machines, and cloud or homegrown runtimes.</p>
        </div>
        <div className="grid gap-px border border-stone-800 bg-stone-800 md:grid-cols-3">
          {agentTypes.map((agent, index) => {
            const Icon = agentIcons[index];
            return (
            <Link key={agent.slug} href={`/use-cases/agent-type/${agent.slug}`} className="group aurel-surface-line bg-black/70 p-6 transition-colors hover:bg-stone-950">
              <div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center border border-stone-700 bg-stone-950 text-stone-300 group-hover:border-stone-400"><Icon className="h-4 w-4" /></div><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">{agent.eyebrow}</div></div>
              <h3 className="mt-8 text-xl font-black uppercase tracking-tight text-stone-100">{agent.name}</h3>
              <p className="mt-3 text-sm leading-6 text-stone-400">{agent.summary}</p>
              <div className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-stone-300 group-hover:text-white">View coverage →</div>
            </Link>
            );
          })}
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="grid gap-8 border-y border-stone-800 py-10 lg:grid-cols-[0.7fr_1fr] lg:items-center">
          <div>
            <div className="aurel-kicker mb-3">Operating principle</div>
            <h2 className="aurel-title text-3xl md:text-4xl">Evidence before execution.</h2>
          </div>
          <div className="text-lg leading-8 text-stone-400">Capabilities are useful only when they converge at the action boundary. Aurels carries context from discovery to decision, then preserves the signed record for review and response.</div>
        </div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
