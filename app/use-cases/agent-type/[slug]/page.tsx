import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Cloud, Code2, Layers3, ShieldAlert, TerminalSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";
import { agentTypes, getAgentType } from "@/lib/capabilities";

const AGENT_ICONS = {
  "agentic-saas": Cloud,
  "coding-personal-agents": TerminalSquare,
  "cloud-and-homegrown": Code2,
} as const;

export function generateStaticParams() {
  return agentTypes.map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const agent = getAgentType(params.slug);
  if (!agent) return { title: "Agent type not found" };
  return { title: agent.name, description: agent.summary, alternates: { canonical: `/use-cases/agent-type/${agent.slug}` } };
}

export default function AgentTypePage({ params }: { params: { slug: string } }) {
  const agent = getAgentType(params.slug);
  if (!agent) notFound();
  const AgentIcon = AGENT_ICONS[agent.slug as keyof typeof AGENT_ICONS] ?? Layers3;

  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow={`Agent type / ${agent.eyebrow}`} title={agent.name}>
        {agent.summary} Aurels keeps the same intent, identity, boundary, and evidence model wherever this agent runs.
      </AurelPublicHeader>

      <AurelGridSection>
        <Link href="/capabilities" className="mb-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500 hover:text-stone-100"><ArrowLeft className="h-3.5 w-3.5" /> Platform capabilities</Link>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1fr] lg:items-start">
          <div className="border border-stone-800 bg-black/60 p-7"><AgentIcon className="h-6 w-6 text-stone-300" /><div className="aurel-kicker mt-8">Who this is for</div><p className="mt-4 text-lg leading-8 text-stone-300">{agent.audience}</p><div className="mt-8 border-t border-stone-800 pt-5"><div className="aurel-kicker">First move</div><p className="mt-3 text-sm leading-7 text-stone-400">{agent.firstStep}</p></div></div>
          <div><div className="aurel-kicker mb-4">What gets covered</div><div className="space-y-4">{agent.coverage.map((item) => <div key={item} className="flex gap-3 border-b border-stone-800 pb-4 text-sm leading-7 text-stone-300 last:border-0"><Check className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-400" />{item}</div>)}</div></div>
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="mb-10 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
          <div><div className="aurel-kicker mb-3">Typical action surfaces</div><h2 className="aurel-title text-3xl md:text-5xl">Put the gate at the side effect.</h2></div>
          <p className="max-w-2xl text-lg leading-8 text-stone-400">Every profile has different tools, but the control point is the same: evaluate the proposed action before the external system changes.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">{agent.actionExamples.map((item, index) => <div key={item} className="aurel-surface-line min-h-[170px] border border-stone-800 bg-black/55 p-6"><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">Action 0{index + 1}</div><p className="mt-8 text-lg leading-7 text-stone-200">{item}</p></div>)}</div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1fr] lg:items-start">
          <div><div className="aurel-kicker mb-3">Risk patterns</div><h2 className="aurel-title text-3xl md:text-5xl">Know what can cross the boundary.</h2><p className="mt-5 max-w-md text-sm leading-7 text-stone-400">Use the profile as a starting point for policy design, then tune the controls to your workspace and threat model.</p></div>
          <div className="space-y-3">{agent.riskPatterns.map((item) => <div key={item} className="flex gap-3 border border-red-500/20 bg-red-950/10 p-4 text-sm leading-7 text-stone-300"><ShieldAlert className="mt-1 h-4 w-4 flex-shrink-0 text-red-400" />{item}</div>)}</div>
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="mb-8 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end"><div><div className="aurel-kicker mb-3">Implementation path</div><h2 className="aurel-title text-3xl md:text-5xl">One checkpoint, any runtime.</h2></div><p className="max-w-2xl text-lg leading-8 text-stone-400">Roll out in three deliberate steps. Start narrow, prove the decision boundary, then expand coverage without losing evidence.</p></div>
        <div className="grid gap-3 md:grid-cols-3">{agent.rollout.map((item) => <div key={item.step} className="aurel-surface-line min-h-[210px] border border-stone-800 bg-black/55 p-6"><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">{item.step}</div><h3 className="mt-8 text-xl font-black uppercase tracking-tight text-stone-100">{item.title}</h3><p className="mt-4 text-sm leading-7 text-stone-400">{item.text}</p></div>)}</div>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/docs" className="aurel-button px-5 py-3">Read docs</Link><Link href="/capabilities" className="aurel-button-ghost px-5 py-3">Browse capabilities</Link><Link href="/support" className="aurel-button-ghost px-5 py-3">Request pilot access</Link></div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
