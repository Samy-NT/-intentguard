import type { Metadata } from "next";
import Link from "next/link";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";
import { legalSections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site Aurels.",
  alternates: { canonical: "/mentions-legales" },
};

export default function LegalNoticePage() {
  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow="Legal / informations éditeur" title="Mentions légales">
        Informations relatives à l&apos;éditeur, à l&apos;hébergement, aux services proposés, à la propriété intellectuelle et aux responsabilités applicables au site Aurels.
      </AurelPublicHeader>
      <AurelGridSection>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-5">
          <div className="aurel-kicker">Dernière mise à jour : 4 septembre 2026</div>
          <Link href="/politique-de-confidentialite" className="aurel-link text-sm underline">Politique de confidentialité →</Link>
        </div>
        <div className="mx-auto max-w-4xl divide-y divide-stone-800 border-y border-stone-800">
          {legalSections.map((section) => (
            <section key={section.title} className="py-8">
              <h2 className="text-xl font-black uppercase tracking-tight text-stone-100">{section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-stone-400">
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && <ul className="list-disc space-y-2 pl-5">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
              </div>
            </section>
          ))}
        </div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
