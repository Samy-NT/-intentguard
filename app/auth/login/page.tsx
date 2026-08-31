"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiKeyHeaders, storeApiKey } from "@/app/dashboard/api-key";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/logs", { headers: apiKeyHeaders(apiKey) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Invalid API key");
      storeApiKey(apiKey);
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid API key");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="aurel-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-stone-700 bg-stone-100">
              <img src="/logo.png" alt="Aurel" className="h-7 w-7" />
            </span>
            <h1 className="font-mono text-lg font-semibold uppercase tracking-[0.24em] text-stone-100">
              Aurel
            </h1>
          </Link>
          <p className="text-stone-500 mt-3">Sign in with a workspace API key</p>
        </div>

        {/* Form */}
        <div className="aurel-panel p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="api-key" className="block text-sm font-medium text-stone-400 mb-2">
                API key
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
              disabled={isLoading}
              className="aurel-button w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-500 mt-6">
          Create and revoke keys from{" "}
          <Link href="/dashboard/api-keys" className="aurel-link underline">
            API key settings
          </Link>
        </p>
      </div>
    </div>
  );
}
