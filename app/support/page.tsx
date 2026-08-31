"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/app/components/Sidebar";
import { CheckCircle2, BookOpen, Settings, Key } from "lucide-react";

const Github = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setFormData({ name: "", email: "", subject: "", message: "" });
    }, 1000);
  };

  const FAQ_ITEMS = [
    {
      question: "How do I integrate Aurel with my agent?",
      answer: "Install the SDK, initialize it with your API key, and call the verify method before each protected action. Payments are the first supported example in the docs.",
    },
    {
      question: "What happens when semantic analysis is unavailable?",
      answer: "You can configure a fail mode in your workspace settings: allow (proceed), flag (require review), or block (stop the action).",
    },
    {
      question: "Can I customize the verification rules?",
      answer: "Yes, you can configure action thresholds, velocity limits, allowlists/denylists, and semantic sensitivity in your workspace settings.",
    },
    {
      question: "How are API keys secured?",
      answer: "API keys are hashed using SHA-256 (with optional HMAC pepper) and never stored in plaintext. You can revoke keys at any time.",
    },
    {
      question: "What data is sent to Claude for semantic analysis?",
      answer: "Only the action details needed for verification, plus agent context. For payment examples, this includes amount, currency, and recipient, not sensitive payment credentials.",
    },
  ];

  return (
    <div className="flex min-h-screen aurel-bg">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="aurel-kicker mb-3">Support / operations desk</div>
          <h1 className="aurel-title text-4xl mb-2">Support</h1>
          <p className="text-stone-400 mb-8">Get help putting Aurel before autonomous action execution.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Contact Form */}
            <div className="aurel-panel p-8">
              <h2 className="text-xl font-black uppercase tracking-tight text-stone-100 mb-6">Contact us</h2>
              
              {submitted ? (
                <div className="border border-emerald-500/50 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-emerald-400">Message Sent</h3>
                      <p className="text-sm text-stone-400">We&apos;ll get back to you within 24 hours.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-stone-400 mb-2">
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-stone-400 mb-2">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                      placeholder="you@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-stone-400 mb-2">
                      Subject
                    </label>
                    <select
                      id="subject"
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="aurel-field w-full px-4 py-3"
                    >
                      <option value="">Select a topic</option>
                      <option value="integration">Integration Help</option>
                      <option value="billing">Billing Question</option>
                      <option value="bug">Bug Report</option>
                      <option value="feature">Feature Request</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-stone-400 mb-2">
                      Message
                    </label>
                    <textarea
                      id="message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="aurel-field w-full resize-none px-4 py-3 placeholder-zinc-500"
                      placeholder="Describe your issue or question..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="aurel-button w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? "Sending..." : "Send Message"}
                  </button>
                </form>
              )}
            </div>

            {/* FAQ */}
            <div className="space-y-6">
              <div className="aurel-panel p-8">
                <h2 className="text-xl font-black uppercase tracking-tight text-stone-100 mb-6">Frequently asked questions</h2>
                <div className="space-y-4">
                  {FAQ_ITEMS.map((item, index) => (
                    <details key={index} className="group">
                      <summary className="flex cursor-pointer items-center justify-between text-stone-300 transition-colors hover:text-white">
                        <span className="font-medium">{item.question}</span>
                        <span className="text-zinc-500 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <p className="mt-2 text-sm leading-relaxed text-stone-400">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>

              {/* Quick Links */}
              <div className="aurel-panel p-8">
                <h2 className="text-xl font-black uppercase tracking-tight text-stone-100 mb-4">Quick links</h2>
                <div className="space-y-3">
                  <Link href="/docs" className="flex items-center gap-3 text-stone-400 transition-colors hover:text-white">
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    <span>Documentation</span>
                  </Link>
                  <Link href="/dashboard/settings" className="flex items-center gap-3 text-stone-400 transition-colors hover:text-white">
                    <Settings className="w-4 h-4 flex-shrink-0" />
                    <span>Workspace Settings</span>
                  </Link>
                  <Link href="/dashboard/api-keys" className="flex items-center gap-3 text-stone-400 transition-colors hover:text-white">
                    <Key className="w-4 h-4 flex-shrink-0" />
                    <span>API Keys</span>
                  </Link>
                  <a
                    href="https://github.com/Samy-NT/Aurel"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-stone-400 transition-colors hover:text-white"
                  >
                    <Github className="w-4 h-4 flex-shrink-0" />
                    <span>GitHub Repository</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
