import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Check, CircleAlert, CircleSlash, ShieldCheck } from "lucide-react";
import { AUREL } from "@/lib/seo";

const contactHref = `mailto:${AUREL.email}?subject=Aurels%20startup%20access`;

const problemPoints = [
  "Un agent lit vos emails, tickets, docs ou pages web.",
  "Une mauvaise instruction peut se cacher dans ce contexte.",
  "L'agent peut ensuite envoyer un email, lancer une commande, toucher une API ou declencher un paiement.",
];

const steps = [
  {
    label: "01",
    title: "Connect the agent",
    body: "Ajoutez Aurels avant les actions sensibles: paiement, email, CRM, support, data, outils dev.",
  },
  {
    label: "02",
    title: "Set the limits",
    body: "Definissez ce qui est normal: montants, destinataires, outils autorises, mission de l'agent.",
  },
  {
    label: "03",
    title: "Verify each action",
    body: "Avant execution, Aurels lit le contexte et repond simplement: allow, flag ou block.",
  },
];

const useCases = ["Payments", "Support", "CRM / Sales ops", "Internal data", "Developer tools"];

const faq = [
  {
    question: "Est-ce que ca remplace les permissions ?",
    answer:
      "Non. Les permissions disent ce qu'un agent peut faire. Aurels verifie si l'action qu'il veut faire a du sens dans le contexte.",
  },
  {
    question: "Est-ce difficile a installer ?",
    answer:
      "L'objectif est un branchement simple via API, SDK ou plugin. Vous commencez sur quelques actions sensibles, pas sur tout le produit.",
  },
  {
    question: "Que se passe-t-il si l'action est douteuse ?",
    answer:
      "Vous choisissez la politique: bloquer, demander une revue humaine, ou laisser passer avec un signal dans l'audit.",
  },
  {
    question: "Pourquoi c'est utile pour une startup ?",
    answer:
      "Parce que les agents donnent de la vitesse, mais aussi plus de surface d'attaque. Aurels ajoute un controle avant les erreurs couteuses.",
  },
];

export const metadata: Metadata = {
  title: "Aurels for Startups",
  description:
    "Une landing page simple pour comprendre Aurels: un pare-feu qui verifie l'intention des agents IA avant les actions sensibles.",
  alternates: {
    canonical: "/startup",
  },
};

export default function StartupLandingPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#111111]">
      <header className="border-b border-black/10 px-5 py-5 md:px-8">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center border border-black/15 bg-white">
              <Image src="/logo.png" alt="Aurels" width={22} height={22} className="h-5 w-5" />
            </span>
            <span className="text-sm font-black uppercase tracking-[0.16em]">Aurels</span>
          </Link>
          <div className="hidden items-center gap-6 text-sm text-black/55 md:flex">
            <a href="#problem" className="transition-colors hover:text-black">
              Problem
            </a>
            <a href="#solution" className="transition-colors hover:text-black">
              Solution
            </a>
            <a href="#faq" className="transition-colors hover:text-black">
              FAQ
            </a>
          </div>
          <a
            href={contactHref}
            className="inline-flex items-center gap-2 border border-black bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#232323]"
          >
            Demander un acces
          </a>
        </nav>
      </header>

      <section className="px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_0.82fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
              <ShieldCheck className="h-4 w-4 text-[#2563eb]" />
              Built for startups using agents
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-normal text-black md:text-7xl">
              Stop unsafe agent actions.
            </h1>
            <p className="mt-8 max-w-2xl text-xl leading-9 text-black/68">
              Aurels est un pare-feu pour empecher les agents IA de faire la mauvaise action.
              Il verifie l&apos;intention juste avant l&apos;execution.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href={contactHref}
                className="inline-flex items-center justify-center border border-black bg-black px-6 py-3 font-semibold text-white transition-colors hover:bg-[#232323]"
              >
                Demander un acces
              </a>
              <Link
                href="/plugins"
                className="inline-flex items-center justify-center border border-black/15 bg-white px-6 py-3 font-semibold text-black transition-colors hover:border-black/35"
              >
                Voir les plugins
              </Link>
            </div>
          </div>

          <div className="border border-black/10 bg-white p-5 shadow-[12px_12px_0_#111111]">
            <div className="mb-4 flex items-center justify-between border-b border-black/10 pb-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Pre-action check</span>
              <span className="text-xs text-black/40">before execution</span>
            </div>
            <div className="space-y-3">
              <VerdictRow icon={<Check className="h-4 w-4" />} label="allow" text="La demande correspond a la mission." tone="green" />
              <VerdictRow icon={<CircleAlert className="h-4 w-4" />} label="flag" text="Un humain doit regarder avant." tone="amber" />
              <VerdictRow icon={<CircleSlash className="h-4 w-4" />} label="block" text="L'action ne doit pas partir." tone="red" />
            </div>
            <div className="mt-5 border-t border-black/10 pt-4 text-sm leading-6 text-black/55">
              Audit signe, politiques configurables, SDK et plugins pour proteger les actions sensibles sans rebatir votre stack.
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="border-y border-black/10 bg-white px-5 py-16 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#dc2626]">Problem</div>
            <h2 className="text-3xl font-black leading-tight md:text-5xl">Les agents agissent dans un monde bruyant.</h2>
          </div>
          <div className="grid gap-3">
            {problemPoints.map((point, index) => (
              <div key={point} className="grid grid-cols-[48px_1fr] border border-black/10 bg-[#f7f7f4]">
                <div className="border-r border-black/10 p-4 text-sm font-black text-black/35">0{index + 1}</div>
                <p className="p-4 text-lg leading-8 text-black/68">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="solution" className="px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#2563eb]">Solution</div>
            <h2 className="text-3xl font-black leading-tight md:text-5xl">Un controle simple avant l&apos;action.</h2>
            <p className="mt-5 text-lg leading-8 text-black/65">
              Aurels se place entre votre agent et ses outils. Il compare l&apos;action demandee avec la mission,
              les limites et le contexte. Le produit ne demande pas a vos equipes de lire des logs compliques:
              il donne une decision exploitable.
            </p>
          </div>

          <div className="mt-12 grid border border-black/10 bg-white md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.label} className={`p-6 ${index < steps.length - 1 ? "border-b border-black/10 md:border-b-0 md:border-r" : ""}`}>
                <div className="mb-10 text-xs font-black uppercase tracking-[0.18em] text-black/35">{step.label}</div>
                <h3 className="text-2xl font-black">{step.title}</h3>
                <p className="mt-4 leading-7 text-black/62">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-black/10 bg-[#111111] px-5 py-16 text-white md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.82fr_1fr] lg:items-center">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Startup use cases</div>
            <h2 className="text-3xl font-black leading-tight md:text-5xl">Protegez les endroits ou l&apos;agent peut faire mal.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            {useCases.map((item) => (
              <span key={item} className="border border-white/15 px-4 py-3 text-sm font-semibold text-white/80">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.72fr_1fr]">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#16a34a]">Proof</div>
            <h2 className="text-3xl font-black leading-tight md:text-5xl">Pas une promesse magique. Un point de controle.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProofItem title="Signed audit" body="Chaque decision peut laisser une preuve verifiable." />
            <ProofItem title="Policies" body="Vos limites restent explicites et configurables." />
            <ProofItem title="SDK + plugins" body="Branchez Aurels sur les agents et outils existants." />
            <ProofItem title="Public benchmark" body="Comparez les protections sur des scenarios concrets." />
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-black/10 bg-white px-5 py-20 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.55fr_1fr]">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-black/45">FAQ</div>
            <h2 className="text-3xl font-black leading-tight md:text-5xl">Questions simples.</h2>
          </div>
          <div className="divide-y divide-black/10 border-y border-black/10">
            {faq.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-black">
                  {item.question}
                  <span className="text-2xl font-normal text-black/35 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl leading-7 text-black/62">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 border-y border-black/10 py-10 md:flex-row md:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-black/40">Get started</div>
            <h2 className="mt-3 text-3xl font-black">Mettez Aurels avant votre prochaine action sensible.</h2>
          </div>
          <a
            href={contactHref}
            className="inline-flex items-center justify-center border border-black bg-black px-6 py-3 font-semibold text-white transition-colors hover:bg-[#232323]"
          >
            Demander un acces
          </a>
        </div>
      </section>
    </main>
  );
}

function VerdictRow({
  icon,
  label,
  text,
  tone,
}: {
  icon: ReactNode;
  label: string;
  text: string;
  tone: "green" | "amber" | "red";
}) {
  const toneClass = {
    green: "border-[#16a34a]/30 bg-[#16a34a]/8 text-[#166534]",
    amber: "border-[#d97706]/30 bg-[#d97706]/8 text-[#92400e]",
    red: "border-[#dc2626]/30 bg-[#dc2626]/8 text-[#991b1b]",
  }[tone];

  return (
    <div className={`grid grid-cols-[110px_1fr] items-center border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 font-mono text-sm font-black">{icon}{label}</div>
      <div className="text-sm text-black/62">{text}</div>
    </div>
  );
}

function ProofItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-black/10 bg-white p-5">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 leading-7 text-black/62">{body}</p>
    </div>
  );
}
