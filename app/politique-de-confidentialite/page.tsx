import type { Metadata } from "next";
import Link from "next/link";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";
import { privacySections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et de protection des données personnelles d'Aurels.",
  alternates: { canonical: "/politique-de-confidentialite" },
};

export default function PrivacyPolicyPage() {
  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow="Legal / RGPD" title="Politique de confidentialité">
        Cette politique explique comment Aurel traite les données personnelles dans le cadre du site, de ses comptes utilisateurs et de son API de vérification d&apos;intention.
      </AurelPublicHeader>
      <AurelGridSection>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-5">
          <div className="aurel-kicker">Dernière mise à jour : 5 septembre 2026</div>
          <Link href="/mentions-legales" className="aurel-link text-sm underline">Mentions légales →</Link>
        </div>
        <div className="mx-auto max-w-4xl divide-y divide-stone-800 border-y border-stone-800">
          {privacySections.map((section) => (
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
