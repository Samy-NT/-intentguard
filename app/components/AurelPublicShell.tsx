import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, LifeBuoy, Mail, ShieldCheck, Scale } from "lucide-react";

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
  return (
    <>
      <header className="aurel-public-nav sticky top-0 z-50 border-b border-stone-800/80 bg-black/90 backdrop-blur-xl">
        <div className="aurel-shell flex min-h-16 items-center justify-between gap-4">
          <Link href="/" className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-stone-100">Aurels</Link>
          <nav className="hidden items-center gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500 md:flex">
            <Link href="/capabilities" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-100"><ShieldCheck className="h-3.5 w-3.5" />Capabilities</Link>
            <Link href="/use-cases" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-100"><ArrowUpRight className="h-3.5 w-3.5" />Use cases</Link>
            <Link href="/docs" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-100"><BookOpen className="h-3.5 w-3.5" />Docs</Link>
            <Link href="/support" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-100"><LifeBuoy className="h-3.5 w-3.5" />Support</Link>
          </nav>
          <Link href="/auth/login" className="aurel-button px-3 py-2 text-[10px]">Sign in</Link>
        </div>
      </header>
      <main className="aurel-main">{children}</main>
      <footer className="border-t border-stone-800/80 px-5 py-7 md:px-8">
        <div className="aurel-shell flex flex-col gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Aurels · The intent firewall for autonomous actions</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/mentions-legales" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-300"><Scale className="h-3.5 w-3.5" />Mentions légales</Link>
            <Link href="/politique-de-confidentialite" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-300"><ShieldCheck className="h-3.5 w-3.5" />Confidentialité</Link>
            <Link href="mailto:aurels.dev@gmail.com" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-300"><Mail className="h-3.5 w-3.5" />Contact</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

export function AurelAuthHeader() {
  return (
    <header className="aurel-public-nav sticky top-0 z-50 border-b border-stone-800/80 bg-black/90 backdrop-blur-xl">
      <div className="aurel-shell flex min-h-16 items-center justify-between">
        <Link href="/" className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-stone-100">Aurels</Link>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
          <Link href="/capabilities" className="hidden items-center gap-1.5 transition-colors hover:text-stone-100 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" />Capabilities</Link>
          <Link href="/mentions-legales" className="hidden items-center gap-1.5 transition-colors hover:text-stone-100 sm:inline-flex"><Scale className="h-3.5 w-3.5" />Legal</Link>
          <Link href="/support" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-100"><LifeBuoy className="h-3.5 w-3.5" />Support</Link>
        </div>
      </div>
    </header>
  );
}

export function AurelGridSection({ children }: { children: ReactNode }) {
  return (
    <section className="border-b border-stone-800/80 px-5 py-12 md:px-8">
      <div className="aurel-shell">{children}</div>
    </section>
  );
}

