import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";
import { capabilities, getCapability } from "@/lib/capabilities";

export function generateStaticParams() {
  return capabilities.map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const capability = getCapability(params.slug);
  if (!capability) return { title: "Capability not found" };
  return {
    title: capability.shortLabel,
    description: capability.summary,
    alternates: { canonical: `/capabilities/${capability.slug}` },
  };
}

export default function CapabilityDetailPage({ params }: { params: { slug: string } }) {
  const capability = getCapability(params.slug);
  if (!capability) notFound();

  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow={`Capabilities / ${capability.eyebrow}`} title={capability.name}>
        {capability.summary} {capability.outcome}
      </AurelPublicHeader>

      <AurelGridSection>
        <Link href="/capabilities" className="mb-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500 hover:text-stone-100"><ArrowLeft className="h-3.5 w-3.5" /> All capabilities</Link>
        <div className="grid gap-px border border-stone-800 bg-stone-800 md:grid-cols-3">
          <div className="bg-black/70 p-6 md:col-span-2">
            <div className="aurel-kicker mb-4">What Aurels enforces</div>
            <div className="space-y-4">
              {capability.controls.map((control) => <div key={control} className="flex gap-3 border-b border-stone-800/80 pb-4 text-sm leading-7 text-stone-300 last:border-0 last:pb-0"><Check className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-400" />{control}</div>)}
            </div>
          </div>
          <div className="bg-stone-950 p-6">
            <ShieldCheck className="h-6 w-6 text-stone-300" />
            <div className="mt-8 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">Best for</div>
            <p className="mt-3 text-sm leading-7 text-stone-300">{capability.bestFor}</p>
          </div>
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="mb-8 grid gap-5 lg:grid-cols-[0.7fr_1fr] lg:items-end">
          <div><div className="aurel-kicker mb-3">Detection signals</div><h2 className="aurel-title text-3xl md:text-4xl">Know when the lane changes.</h2></div>
          <p className="max-w-xl text-sm leading-7 text-stone-400">Signals feed the same decision pipeline as Aurels&apos; existing policy, behavioral, semantic, and signed-audit layers.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {capability.signals.map((signal, index) => <div key={signal} className="border border-stone-800 bg-black/60 p-5"><CircleAlert className="h-4 w-4 text-amber-400" /><div className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600">Signal 0{index + 1}</div><p className="mt-3 text-sm leading-6 text-stone-300">{signal}</p></div>)}
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div className="flex flex-col gap-5 border-y border-stone-800 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="aurel-kicker mb-3">Next move</div><h2 className="aurel-title text-2xl md:text-4xl">Put the checkpoint in the path.</h2></div>
          <div className="flex flex-wrap gap-3"><Link href="/docs" className="aurel-button px-5 py-3">Read integration docs</Link><Link href="/support" className="aurel-button-ghost px-5 py-3">Request pilot access</Link></div>
        </div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
