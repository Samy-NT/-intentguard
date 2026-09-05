import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Layers3 } from "lucide-react";
import { notFound } from "next/navigation";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";
import { agentTypes, getAgentType } from "@/lib/capabilities";

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

  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow={`Agent type / ${agent.eyebrow}`} title={agent.name}>
        {agent.summary} Aurels keeps the same intent, identity, boundary, and evidence model wherever this agent runs.
      </AurelPublicHeader>

      <AurelGridSection>
        <Link href="/capabilities" className="mb-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500 hover:text-stone-100"><ArrowLeft className="h-3.5 w-3.5" /> Platform capabilities</Link>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1fr] lg:items-start">
          <div className="border border-stone-800 bg-black/60 p-7"><Layers3 className="h-6 w-6 text-stone-300" /><div className="aurel-kicker mt-8">Coverage model</div><p className="mt-4 text-lg leading-8 text-stone-300">{agent.firstStep}</p></div>
          <div><div className="aurel-kicker mb-4">What gets covered</div><div className="space-y-4">{agent.coverage.map((item) => <div key={item} className="flex gap-3 border-b border-stone-800 pb-4 text-sm leading-7 text-stone-300 last:border-0"><Check className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-400" />{item}</div>)}</div></div>
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="grid gap-8 border-y border-stone-800 py-10 lg:grid-cols-[0.7fr_1fr] lg:items-center">
          <div><div className="aurel-kicker mb-3">Implementation path</div><h2 className="aurel-title text-3xl md:text-4xl">One checkpoint, any runtime.</h2></div>
          <p className="text-lg leading-8 text-stone-400">Start with discovery and a narrow action boundary. Then add posture checks, scoped identity, MCP controls, and response playbooks as the agent becomes more capable.</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/docs" className="aurel-button px-5 py-3">Read docs</Link><Link href="/capabilities" className="aurel-button-ghost px-5 py-3">Browse capabilities</Link><Link href="/support" className="aurel-button-ghost px-5 py-3">Request pilot access</Link></div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
