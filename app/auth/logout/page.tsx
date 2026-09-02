"use client";

import { useEffect } from "react";
import Link from "next/link";
import { storeApiKey } from "@/app/dashboard/api-key";

export default function LogoutPage() {
  useEffect(() => {
    storeApiKey("");
    fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      window.location.href = "/auth/login";
    });
  }, []);

  return (
    <div className="aurel-bg flex min-h-screen items-center justify-center p-4">
      <div className="aurel-panel w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-stone-100">Signing out</h1>
        <p className="mt-3 text-sm text-stone-500">Clearing the dashboard session.</p>
        <Link href="/auth/login" className="aurel-button mt-6 inline-flex px-4 py-3">
          Return to login
        </Link>
      </div>
    </div>
  );
}
