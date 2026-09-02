"use client";

import Link from "next/link";
import Image from "next/image";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

export default function SignupPage() {
  return (
    <div className="aurel-bg flex min-h-screen items-center justify-center p-4">
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
          <p className="mt-3 text-stone-500">Private beta access</p>
        </div>

        <div className="aurel-panel p-8">
          <div className="mb-6 flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
            <p className="text-sm leading-6 text-amber-100/75">
              Self-serve account creation is not enabled yet. Use a workspace API key to sign in,
              or request pilot access for a manually provisioned workspace.
            </p>
          </div>

          <div className="space-y-3">
            <Link href="/auth/login" className="aurel-button flex items-center justify-center gap-2 py-3">
              <KeyRound className="h-4 w-4" />
              Sign in with API key
            </Link>
            <Link href="/support" className="aurel-button-ghost flex items-center justify-center gap-2 py-3">
              <Mail className="h-4 w-4" />
              Request pilot access
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-stone-500">
          Dashboard user accounts, SSO, and invite flows are tracked in the production readiness audit.
        </p>
      </div>
    </div>
  );
}
