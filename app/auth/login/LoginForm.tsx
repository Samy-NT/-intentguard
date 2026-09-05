"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";
import { storeSessionAuth } from "@/app/dashboard/api-key";
import { requestSupabaseDashboardMagicLink } from "@/lib/supabase/dashboard-auth";
import { AurelAuthHeader } from "@/app/components/AurelPublicShell";

export function LoginForm() {
  const router = useRouter();
  const [isApiKeyLoading, setIsApiKeyLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsApiKeyLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Invalid API key");
      if (typeof data.csrf_token !== "string") throw new Error("Login did not return a CSRF token");
      storeSessionAuth(data.csrf_token);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid API key");
    } finally {
      setIsApiKeyLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsMagicLinkLoading(true);

    try {
      await requestSupabaseDashboardMagicLink(email, `${window.location.origin}/auth/callback`);
      setNotice("Check your email for the secure sign-in link.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send magic link");
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="aurel-bg min-h-screen">
      <AurelAuthHeader />
      <div className="flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-stone-700 bg-stone-100">
              <Image src="/logo.png" alt="Aurels" width={28} height={28} className="h-7 w-7" />
            </span>
            <h1 className="font-mono text-lg font-semibold uppercase tracking-[0.24em] text-stone-100">
              Aurels
            </h1>
          </Link>
          <p className="mt-3 text-stone-500">
            Sign in with your workspace identity. Agent integrations still use scoped API keys.
          </p>
        </div>

        <div className="aurel-panel p-8">
          <form onSubmit={handleMagicLink} className="space-y-5">
            {error && (
              <div className="border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
            {notice && (
              <div className="border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                {notice}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-stone-400">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                placeholder="ops@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={isMagicLinkLoading}
              className="aurel-button flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {isMagicLinkLoading ? "Sending link..." : "Email secure link"}
            </button>
          </form>

          <div className="my-6 border-t border-stone-800" />

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="api-key" className="mb-2 block text-sm font-medium text-stone-400">
                Workspace API key
              </label>
              <input
                id="api-key"
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                placeholder="ig_live_..."
              />
            </div>

            <button
              type="submit"
              disabled={isApiKeyLoading}
              className="aurel-button-ghost flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {isApiKeyLoading ? "Signing in..." : "Sign in with API key"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm text-stone-500">
          New to Aurels?{" "}
          <Link href="/support" className="aurel-link font-medium">
            Request pilot access
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
