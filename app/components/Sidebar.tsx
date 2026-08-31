"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  Key,
  Building2,
  ShieldCheck,
  GitPullRequestArrow,
  PlugZap,
  BookOpen,
  CreditCard,
  MessageSquare,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Reviews", href: "/dashboard/reviews", icon: GitPullRequestArrow },
  { label: "Integrations", href: "/dashboard/integrations", icon: PlugZap },
  { label: "Audit Trail", href: "/dashboard/audit", icon: ShieldCheck },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "API Keys", href: "/dashboard/api-keys", icon: Key },
  { label: "Workspaces", href: "/dashboard/workspaces", icon: Building2 },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Support", href: "/support", icon: MessageSquare },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen border-r border-stone-800 bg-black/90 transition-all duration-300 z-50 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-stone-800">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center border border-stone-700 bg-stone-100">
              <img src="/logo.png" alt="Aurel" className="h-6 w-6" />
            </span>
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-stone-100">
              Aurel
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
      <nav className="p-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 border px-3 py-2.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "border-stone-500 bg-stone-100 text-black"
                  : "border-transparent text-stone-500 hover:border-stone-800 hover:bg-stone-950 hover:text-stone-200"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="border border-stone-700 px-2 py-0.5 text-[10px] text-stone-400">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-stone-800">
        <Link
          href="/auth/logout"
          className={`flex items-center gap-3 border border-transparent px-3 py-2.5 font-mono text-xs uppercase tracking-[0.08em] text-stone-500 transition-colors hover:border-stone-800 hover:bg-stone-950 hover:text-stone-200 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </Link>
      </div>
    </aside>
  );
}
