"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/app/components/Sidebar";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, Key, Mail, Send, Settings } from "lucide-react";

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
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    workspace_id: "",
    category: "setup",
    severity: "normal",
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const subject = encodeURIComponent("Aurels pilot support request");
  const body = encodeURIComponent(
    "Hi,\n\nI want help with an Aurels pilot.\n\nWorkspace/use case:\nIntegration target:\nProduction deadline:\n"
  );

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setNotice(null);

    const payload = Object.fromEntries(
      Object.entries(form)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value)
    );

    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok) {
      setNotice({
        type: "error",
        text: data.error ?? `Support request failed with HTTP ${res.status}`,
      });
      return;
    }

    setNotice({ type: "success", text: "Support request submitted." });
    setForm((current) => ({ ...current, subject: "", message: "" }));
  }

  return (
    <div className="flex min-h-screen flex-col aurel-bg lg:flex-row">
      <Sidebar variant="public" />

      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
        <div className="mx-auto max-w-6xl">
          <div className="aurel-kicker mb-3">Support / operations desk</div>
          <h1 className="aurel-title mb-2 text-4xl">Support</h1>
          <p className="mb-8 max-w-3xl text-stone-400">
            Send setup, incident, billing, and integration requests to the configured support
            intake. Email and GitHub fallbacks stay available for pilots.
          </p>

          <div className="aurel-support-notice mb-8 border border-blue-500/30 bg-blue-500/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-300" />
              <div>
                <h2 className="text-sm font-semibold text-blue-200">Configurable support intake</h2>
                <p className="mt-1 text-sm leading-6 text-blue-100/70">
                  The form posts to <span className="font-mono">SUPPORT_WEBHOOK_URL</span> and signs
                  deliveries when <span className="font-mono">SUPPORT_WEBHOOK_SECRET</span> is set.
                  If the backend is not configured, use email or GitHub below.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.85fr_1fr]">
            <section className="aurel-panel p-8">
              <h2 className="mb-6 text-xl font-black uppercase tracking-tight text-stone-100">Open a request</h2>
              {notice && (
                <div
                  className={`mb-5 border p-3 text-sm ${
                    notice.type === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/30 bg-red-500/10 text-red-200"
                  }`}
                >
                  {notice.text}
                </div>
              )}
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sr-only" htmlFor="support-name">Name</label>
                  <input
                    id="support-name"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Name"
                    className="aurel-field px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                  />
                  <label className="sr-only" htmlFor="support-email">Email</label>
                  <input
                    id="support-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder="Email"
                    className="aurel-field px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sr-only" htmlFor="support-company">Company</label>
                  <input
                    id="support-company"
                    value={form.company}
                    onChange={(e) => setField("company", e.target.value)}
                    placeholder="Company"
                    className="aurel-field px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                  />
                  <label className="sr-only" htmlFor="support-workspace">Workspace ID</label>
                  <input
                    id="support-workspace"
                    value={form.workspace_id}
                    onChange={(e) => setField("workspace_id", e.target.value)}
                    placeholder="Workspace ID"
                    className="aurel-field px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sr-only" htmlFor="support-category">Category</label>
                  <select
                    id="support-category"
                    value={form.category}
                    onChange={(e) => setField("category", e.target.value)}
                    className="aurel-field px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                  >
                    <option value="setup">Setup</option>
                    <option value="integration">Integration</option>
                    <option value="incident">Incident</option>
                    <option value="security">Security</option>
                    <option value="billing">Billing</option>
                    <option value="other">Other</option>
                  </select>
                  <label className="sr-only" htmlFor="support-severity">Severity</label>
                  <select
                    id="support-severity"
                    value={form.severity}
                    onChange={(e) => setField("severity", e.target.value)}
                    className="aurel-field px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <label className="sr-only" htmlFor="support-subject">Subject</label>
                <input
                  id="support-subject"
                  required
                  minLength={3}
                  maxLength={160}
                  value={form.subject}
                  onChange={(e) => setField("subject", e.target.value)}
                  placeholder="Subject"
                  className="aurel-field w-full px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                />
                <label className="sr-only" htmlFor="support-message">Message</label>
                <textarea
                  id="support-message"
                  required
                  minLength={10}
                  maxLength={4000}
                  value={form.message}
                  onChange={(e) => setField("message", e.target.value)}
                  placeholder="What should the operator know?"
                  rows={6}
                  className="aurel-field w-full resize-none px-3 py-2 text-sm outline-none focus:border-blue-500/50"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="aurel-button flex w-full items-center justify-center gap-2 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {sending ? "Submitting..." : "Submit request"}
                </button>
              </form>
            </section>

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
          </div>

          <section className="mt-8 aurel-panel p-8">
            <h2 className="mb-6 text-xl font-black uppercase tracking-tight text-stone-100">Frequently asked questions</h2>
            <div className="grid gap-4 md:grid-cols-2">
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
