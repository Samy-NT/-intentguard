"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("Self-serve signup is not enabled yet. Use an admin API key to sign in.");
    setIsLoading(false);
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
          <p className="text-stone-500 mt-3">Create your account</p>
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
              <label htmlFor="name" className="block text-sm font-medium text-stone-400 mb-2">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                placeholder="John Doe"
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
              <label htmlFor="password" className="block text-sm font-medium text-stone-400 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-400 mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={8}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                required
                className="mt-1 border-zinc-700 bg-zinc-800 accent-stone-200"
              />
              <span className="text-sm text-stone-400">
                I agree to the{" "}
                <Link href="/terms" className="aurel-link underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="aurel-link underline">
                  Privacy Policy
                </Link>
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="aurel-button w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Creating account..." : "Create account"}
            </button>
          </form>

        </div>

        <p className="text-center text-stone-500 mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="aurel-link underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
