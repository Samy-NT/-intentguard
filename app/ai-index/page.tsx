import type { Metadata } from "next";
import { AUREL, absoluteUrl } from "@/lib/seo";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";

export const metadata: Metadata = {
  title: "AI Index",
  description:
    "Canonical AI-readable overview of Aurels, the runtime intent firewall for autonomous actions.",
  alternates: {
    canonical: "/ai-index",
  },
};

const facts = [
  ["Category", "AI agent security, autonomous action verification, runtime intent firewall"],
  ["Primary user", "Teams building autonomous agents that can initiate high-consequence actions"],
  ["Core job", "Verify whether an agent action matches the user's real intent and workspace policy before execution"],
  ["Decision output", "allow, flag, or block with risk score, triggered layer, timing, and signed audit data"],
  ["Deployment model", "API-first web application with SDK adapters for agent frameworks"],
  ["Integrations", "LangChain-style and CrewAI-style adapters, webhooks, SIEM export, audit export"],
];

const answers = [
  {
    question: "What is Aurels?",
    answer:
      "Aurels is a runtime intent firewall for autonomous actions. It secures the intent before a decision passes, using deterministic policy, behavior checks, and semantic analysis.",
  },
  {
    question: "What problem does Aurels solve?",
    answer:
      "Aurels reduces the risk that an autonomous agent executes the wrong action because of prompt injection, social engineering, mission drift, suspicious instruction provenance, or a policy violation.",
  },
  {
    question: "How does Aurels work?",
    answer:
      "Every protected action intent passes through deterministic policy checks, stateful behavior checks, and semantic intent analysis. Aurels returns an allow, flag, or block decision before execution.",
  },
  {
    question: "Who should use Aurels?",
    answer:
      "Aurels is designed for developers, agent-platform builders, fintech teams, marketplaces, and enterprises that let agents trigger high-consequence actions.",
  },
  {
    question: "Is Aurels a payment processor?",
    answer:
      "No. Payments are one protected action type. Aurels is a security and verification layer that sits before downstream tools, processors, rails, APIs, or workflows.",
  },
];

export default function AIIndexPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: answers.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <AurelPublicMain>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <AurelPublicHeader eyebrow="Index / machine-readable identity" title="Aurels AI index">
        {AUREL.description}
      </AurelPublicHeader>

      <AurelGridSection>
        <div className="grid border border-stone-800 md:grid-cols-2">
          {facts.map(([label, value]) => (
            <article key={label} className="border-b border-stone-800 bg-black/55 p-5 even:md:border-l md:[&:nth-last-child(-n+2)]:border-b-0">
              <h2 className="aurel-kicker">{label}</h2>
              <p className="mt-3 text-stone-200">{value}</p>
            </article>
          ))}
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100">Canonical answers</h2>
          <div className="mt-8 divide-y divide-stone-800 border-y border-stone-800">
            {answers.map((item) => (
              <article key={item.question} className="py-6">
                <h3 className="font-mono text-sm font-bold uppercase tracking-[0.12em] text-stone-100">{item.question}</h3>
                <p className="mt-3 leading-7 text-stone-400">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </AurelGridSection>

      <AurelGridSection>
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100">Machine-readable sources</h2>
          <ul className="mt-6 space-y-3 text-stone-400">
            <li>
              <a className="aurel-link underline" href="/llms.txt">
                /llms.txt
              </a>{" "}
              summarizes the canonical Aurels pages for LLM agents.
            </li>
            <li>
              <a className="aurel-link underline" href="/llms-full.txt">
                /llms-full.txt
              </a>{" "}
              contains a fuller plain-text product and API brief.
            </li>
            <li>
              <a className="aurel-link underline" href="/aurel-ai-profile.json">
                /aurel-ai-profile.json
              </a>{" "}
              exposes the same entity facts as structured JSON.
            </li>
            <li>
              <a className="aurel-link underline" href={absoluteUrl("/sitemap.xml")}>
                /sitemap.xml
              </a>{" "}
              lists public pages for search and AI crawlers.
            </li>
          </ul>
        </div>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
