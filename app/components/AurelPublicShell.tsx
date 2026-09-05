import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BarChart3, BookOpen, Boxes, ChevronDown, Code2, LifeBuoy, Mail, Rocket, ShieldCheck, Scale } from "lucide-react";

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
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 transition-colors hover:text-stone-100 [&::-webkit-details-marker]:hidden">
                Explore <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-4 grid w-56 gap-1 border border-stone-700 bg-black/95 p-2 shadow-2xl backdrop-blur-xl">
                <Link href="/plugins" className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-stone-900 hover:text-stone-100"><Boxes className="h-3.5 w-3.5" />Plugins</Link>
                <Link href="/benchmark" className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-stone-900 hover:text-stone-100"><BarChart3 className="h-3.5 w-3.5" />Benchmark</Link>
                <Link href="/api-reference" className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-stone-900 hover:text-stone-100"><Code2 className="h-3.5 w-3.5" />API reference</Link>
                <Link href="/security" className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-stone-900 hover:text-stone-100"><ShieldCheck className="h-3.5 w-3.5" />Security</Link>
                <Link href="/startup" className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-stone-900 hover:text-stone-100"><Rocket className="h-3.5 w-3.5" />Startup</Link>
              </div>
            </details>
            <Link href="/support" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-100"><LifeBuoy className="h-3.5 w-3.5" />Support</Link>
          </nav>
          <Link href="/auth/login" className="aurel-button px-3 py-2 text-[10px]">Sign in</Link>
        </div>
      </header>
      <main className="aurel-main">{children}</main>
      <footer className="border-t border-stone-800/80 px-5 py-12 md:px-8 md:py-16">
        <div className="aurel-shell">
          <div className="grid gap-10 border-b border-stone-800/80 pb-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
            <div>
              <div className="mb-4 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-stone-200">Aurels</div>
              <p className="max-w-xs text-sm leading-6 text-stone-500">The intent firewall for autonomous actions.</p>
            </div>
            <div>
              <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">Product</div>
              <div className="grid gap-2 text-xs text-stone-500">
                <Link href="/capabilities" className="transition-colors hover:text-stone-200">Capabilities</Link>
                <Link href="/use-cases" className="transition-colors hover:text-stone-200">Use cases</Link>
                <Link href="/plugins" className="transition-colors hover:text-stone-200">Plugins</Link>
                <Link href="/billing" className="transition-colors hover:text-stone-200">Billing</Link>
              </div>
            </div>
            <div>
              <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">Resources</div>
              <div className="grid gap-2 text-xs text-stone-500">
                <Link href="/docs" className="transition-colors hover:text-stone-200">Documentation</Link>
                <Link href="/api-reference" className="transition-colors hover:text-stone-200">API reference</Link>
                <Link href="/benchmark" className="transition-colors hover:text-stone-200">Benchmark</Link>
                <Link href="/security" className="transition-colors hover:text-stone-200">Security</Link>
              </div>
            </div>
            <div>
              <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-600">Company</div>
              <div className="grid gap-2 text-xs text-stone-500">
                <Link href="/startup" className="transition-colors hover:text-stone-200">Startup</Link>
                <Link href="/support" className="transition-colors hover:text-stone-200">Support</Link>
                <Link href="/mentions-legales" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-200"><Scale className="h-3.5 w-3.5" />Mentions légales</Link>
                <Link href="/politique-de-confidentialite" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-200"><ShieldCheck className="h-3.5 w-3.5" />Confidentialité</Link>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Aurels</span>
            <Link href="mailto:aurels.dev@gmail.com" className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-300"><Mail className="h-3.5 w-3.5" />Contact aurels.dev@gmail.com</Link>
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

