"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Settings,
  Key,
  Building2,
  ShieldCheck,
  ScrollText,
  GitPullRequestArrow,
  PlugZap,
  Download,
  BookOpen,
  CreditCard,
  MessageSquare,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Capabilities", href: "/capabilities", icon: ShieldCheck },
  { label: "Use Cases", href: "/use-cases", icon: Activity },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Reviews", href: "/dashboard/reviews", icon: GitPullRequestArrow },
  { label: "Integrations", href: "/dashboard/integrations", icon: PlugZap },
  { label: "Plugins", href: "/plugins", icon: Download },
  { label: "Audit Trail", href: "/dashboard/audit", icon: ShieldCheck },
  { label: "Mandates", href: "/dashboard/mandates", icon: ScrollText },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "API Keys", href: "/dashboard/api-keys", icon: Key },
  { label: "Members", href: "/dashboard/members", icon: Users },
  { label: "Workspaces", href: "/dashboard/workspaces", icon: Building2 },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Support", href: "/support", icon: MessageSquare },
];

export function Sidebar({ variant = "workspace" }: { variant?: "workspace" | "public" }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isPublic = variant === "public";
  const items = isPublic
    ? NAV_ITEMS.filter((item) => ["/capabilities", "/use-cases", "/plugins", "/docs", "/support", "/billing"].includes(item.href))
    : NAV_ITEMS;

  const renderItems = (mobile = false) => (
    <nav className={mobile ? "space-y-1 p-3" : "space-y-2 p-4"}>
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => mobile && setMobileOpen(false)}
            className={`flex items-center gap-3 border px-3 py-2.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors ${
              isActive
                ? "border-stone-500 bg-stone-100 text-black"
                : "border-transparent text-stone-500 hover:border-stone-800 hover:bg-stone-950 hover:text-stone-200"
            }`}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed || mobile ? <span className="flex-1">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
    <aside
      className={`fixed left-0 top-0 z-50 hidden h-screen border-r border-stone-800 bg-black/90 transition-all duration-300 lg:block ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-stone-800">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center border border-stone-700 bg-stone-100">
              <Image src="/logo.png" alt="Aurels" width={24} height={24} className="h-6 w-6" />
            </span>
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-stone-100">
              Aurels
            </span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 text-stone-500 transition-colors hover:bg-stone-900 hover:text-stone-100"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      {renderItems()}

      {/* User section */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-stone-800 p-4">
        <Link
          href={isPublic ? "/auth/login" : "/auth/logout"}
          className={`flex items-center gap-3 border border-transparent px-3 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-stone-500 transition-colors hover:border-stone-800 hover:bg-stone-950 hover:text-stone-200 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {isPublic ? <Key className="h-5 w-5 flex-shrink-0" /> : <LogOut className="h-5 w-5 flex-shrink-0" />}
          {!collapsed && <span className="text-sm font-medium">{isPublic ? "Sign in" : "Logout"}</span>}
        </Link>
      </div>
    </aside>

    <div className="aurel-mobile-nav sticky top-0 z-50 flex h-16 items-center justify-between border-b border-stone-800 bg-black/95 px-4 lg:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center border border-stone-700 bg-stone-100">
          <Image src="/logo.png" alt="Aurels" width={24} height={24} className="h-6 w-6" />
        </span>
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-stone-100">Aurels</span>
      </Link>
      <button
        type="button"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
        className="border border-stone-700 p-2 text-stone-300 hover:bg-stone-900"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </div>
    {mobileOpen && (
      <div className="fixed inset-x-0 top-16 z-40 border-b border-stone-800 bg-black/95 shadow-2xl lg:hidden">
        {renderItems(true)}
        <Link href={isPublic ? "/auth/login" : "/auth/logout"} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 border-t border-stone-800 px-6 py-4 font-mono text-xs uppercase tracking-[0.08em] text-stone-400">
          {isPublic ? <Key className="h-5 w-5" /> : <LogOut className="h-5 w-5" />} {isPublic ? "Sign in" : "Logout"}
        </Link>
      </div>
    )}
    </>
  );
}
