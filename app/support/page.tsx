"use client";

import Link from "next/link";
import { Sidebar } from "@/app/components/Sidebar";
import { AlertTriangle, BookOpen, ExternalLink, Key, Mail, Settings } from "lucide-react";

const FAQ_ITEMS = [
  {
    question: "How do I integrate Aurels with my agent?",
    answer:
      "Install the SDK or one of the packaged plugins, set an operator API key, and call Aurel before each protected action.",
  },
  {
    question: "What happens when semantic analysis is unavailable?",
    answer:
      "Workspace settings control the fail mode: allow, flag, or block. Production pilots should use flag or block.",
  },
  {
    question: "Can I customize verification rules?",
    answer:
      "Yes. Settings controls payment policy, velocity, recipients, categories, webhooks, audit retention, and action-security rules.",
  },
  {
    question: "How are API keys secured?",
    answer:
      "API keys are hashed server-side with optional peppering, stored without plaintext, and can be revoked from the dashboard.",
  },
  {
    question: "What data is sent for semantic analysis?",
    answer:
      "Aurel sends the transaction fields and bounded agent context needed for intent analysis, not payment credentials.",
  },
];

export default function SupportPage() {
  const subject = encodeURIComponent("Aurels pilot support request");
  const body = encodeURIComponent(
    "Hi,\n\nI want help with an Aurels pilot.\n\nWorkspace/use case:\nIntegration target:\nProduction deadline:\n"
  );

  return (
    <div className="flex min-h-screen aurel-bg">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="mx-auto max-w-6xl">
          <div className="aurel-kicker mb-3">Support / operations desk</div>
          <h1 className="aurel-title mb-2 text-4xl">Support</h1>
          <p className="mb-8 max-w-3xl text-stone-400">
            Use the operational links below for setup and pilot approval. A hosted contact form should
            only be enabled after an email or ticketing provider is wired in.
          </p>

          <div className="mb-8 border border-amber-500/30 bg-amber-500/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
              <div>
                <h2 className="text-sm font-semibold text-amber-200">Contact form disabled</h2>
                <p className="mt-1 text-sm leading-6 text-amber-100/70">
                  This build does not pretend to send support tickets. Connect Resend, Zendesk, Linear,
                  or another provider before enabling in-app ticket submission.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.85fr_1fr]">
            <section className="aurel-panel p-8">
              <h2 className="mb-6 text-xl font-black uppercase tracking-tight text-stone-100">Pilot help</h2>
              <div className="space-y-3">
                <a
                  href={`mailto:aurels.dev@gmail.com?subject=${subject}&body=${body}`}
                  className="aurel-button flex items-center justify-center gap-2 px-4 py-3"
                >
                  <Mail className="h-4 w-4" />
                  Email support
                </a>
                <Link href="/dashboard/settings" className="aurel-button-ghost flex items-center justify-center gap-2 px-4 py-3">
                  <Settings className="h-4 w-4" />
                  Configure policy
                </Link>
                <Link href="/dashboard/api-keys" className="aurel-button-ghost flex items-center justify-center gap-2 px-4 py-3">
                  <Key className="h-4 w-4" />
                  Manage API keys
                </Link>
                <a
                  href="https://github.com/Samy-NT/intentguard/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aurel-button-ghost flex items-center justify-center gap-2 px-4 py-3"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open GitHub issue
                </a>
              </div>
            </section>

            <section className="aurel-panel p-8">
              <h2 className="mb-6 text-xl font-black uppercase tracking-tight text-stone-100">Frequently asked questions</h2>
              <div className="space-y-4">
                {FAQ_ITEMS.map((item) => (
                  <details key={item.question} className="group border-b border-stone-800 pb-4 last:border-b-0 last:pb-0">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 text-stone-300 transition-colors hover:text-white">
                      <span className="font-medium">{item.question}</span>
                      <span className="text-zinc-500 transition-transform group-open:rotate-180">v</span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-stone-400">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-8 aurel-panel p-8">
            <h2 className="mb-4 text-xl font-black uppercase tracking-tight text-stone-100">Quick links</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/docs" className="flex items-center gap-3 border border-stone-800 bg-black/40 p-4 text-stone-400 transition-colors hover:border-stone-500 hover:text-white">
                <BookOpen className="h-4 w-4 flex-shrink-0" />
                <span>Documentation</span>
              </Link>
              <Link href="/plugins" className="flex items-center gap-3 border border-stone-800 bg-black/40 p-4 text-stone-400 transition-colors hover:border-stone-500 hover:text-white">
                <Settings className="h-4 w-4 flex-shrink-0" />
                <span>Plugins</span>
              </Link>
              <Link href="/dashboard/audit" className="flex items-center gap-3 border border-stone-800 bg-black/40 p-4 text-stone-400 transition-colors hover:border-stone-500 hover:text-white">
                <Key className="h-4 w-4 flex-shrink-0" />
                <span>Audit logs</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
