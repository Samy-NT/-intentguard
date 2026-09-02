import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

export function AurelPublicHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-stone-800/80 px-5 py-16 md:px-8">
      <div className="aurel-shell">
        <Link href="/" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-stone-500 transition-colors hover:text-stone-100">
          <span className="flex h-6 w-6 items-center justify-center border border-stone-800 bg-stone-100">
            <Image src="/logo.png" alt="Aurels" width={16} height={16} className="h-4 w-4" />
          </span>
          Aurels
        </Link>
        <div className="mt-12 grid gap-7 lg:grid-cols-[0.78fr_1fr] lg:items-end">
          <div>
            <div className="aurel-kicker mb-4">{eyebrow}</div>
            <h1 className="aurel-title max-w-4xl text-4xl md:text-6xl">{title}</h1>
          </div>
          <div className="max-w-2xl text-lg leading-8 text-stone-400">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function AurelPublicMain({ children }: { children: ReactNode }) {
  return <main className="aurel-main">{children}</main>;
}

export function AurelGridSection({ children }: { children: ReactNode }) {
  return (
    <section className="border-b border-stone-800/80 px-5 py-12 md:px-8">
      <div className="aurel-shell">{children}</div>
    </section>
  );
}

