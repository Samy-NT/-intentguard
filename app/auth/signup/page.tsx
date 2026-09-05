"use client";

import Link from "next/link";
import Image from "next/image";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { AurelAuthHeader } from "@/app/components/AurelPublicShell";

export default function SignupPage() {
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
          <p className="mt-3 text-stone-500">Private beta access</p>
        </div>

        <div className="aurel-panel p-8">
          <div className="mb-6 flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
            <p className="text-sm leading-6 text-amber-100/75">
              Dashboard identity uses Supabase Auth. Your email must be linked to a workspace member
              before the secure sign-in link can open the dashboard.
            </p>
          </div>

          <div className="space-y-3">
            <Link href="/auth/login" className="aurel-button flex items-center justify-center gap-2 py-3">
              <Mail className="h-4 w-4" />
              Sign in with email
            </Link>
            <Link href="/support" className="aurel-button-ghost flex items-center justify-center gap-2 py-3">
              <KeyRound className="h-4 w-4" />
              Request pilot access
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-stone-500">
          Workspace admins can keep API keys for agent integrations while operators use first-party dashboard identity.
        </p>
      </div>
      </div>
    </div>
  );
}
