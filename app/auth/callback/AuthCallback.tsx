"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { storeSessionAuth } from "@/app/dashboard/api-key";
import { completeSupabaseDashboardAuth } from "@/lib/supabase/dashboard-auth";

export function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function complete() {
      try {
        const session = await completeSupabaseDashboardAuth(window.location.href);
        if (!active) return;
        storeSessionAuth(session.csrf_token);
        router.replace("/dashboard");
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Unable to complete sign-in");
      }
    }

    void complete();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="aurel-bg flex min-h-screen items-center justify-center p-4">
      <div className="aurel-panel w-full max-w-md p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-white">Sign-in failed</h1>
            <p className="mt-3 text-sm leading-6 text-stone-400">{error}</p>
            <Link href="/auth/login" className="aurel-button mt-6 inline-flex px-5 py-3">
              Back to login
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-stone-300" />
            <h1 className="mt-4 text-xl font-semibold text-white">Completing sign-in</h1>
            <p className="mt-3 text-sm leading-6 text-stone-400">
              Your workspace session is being verified.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
