"use client";

import Link from "next/link";
import { MessageSquare, Calendar as CalIcon, Home, ChevronLeft, X } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface SidebarProps {
  /** When true, show the mobile drawer overlay */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const NAV_ITEMS = [
  { href: "/home", Icon: Home, label: "Home" },
  { href: "/chat", Icon: MessageSquare, label: "Chat" },
  { href: "/calendar", Icon: CalIcon, label: "Calendar" },
] as const;

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useLocalStorage("app.sidebar.collapsed", false);

  return (
    <>
      {/* ── Mobile overlay drawer (visible only on small screens) ─────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] border-r border-[color:var(--border)] md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--border)]">
              <span className="font-semibold text-[color:var(--foreground)]">Menu</span>
              <button
                aria-label="Close menu"
                onClick={onMobileClose}
                className="grid place-items-center h-9 w-9 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="px-3 py-4 flex-1 overflow-auto">
              <div className="text-xs uppercase tracking-wide mb-2 opacity-70 px-3">Main</div>
              <div className="space-y-1">
                {NAV_ITEMS.map(({ href, Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={onMobileClose}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors border border-transparent hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)] min-h-[44px]"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-[color:var(--foreground)]" />
                    <span className="text-[color:var(--foreground)]">{label}</span>
                  </Link>
                ))}
              </div>
            </nav>
            <div className="px-4 py-3 text-xs opacity-70">v1.0</div>
          </aside>
        </>
      )}

      {/* ── Desktop sidebar (hidden on mobile) ───────────────────────── */}
      <aside
        className={`hidden md:flex h-dvh border-r border-[color:var(--border)] bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] transition-all duration-200 ${
          collapsed ? "w-16" : "w-64"
        } flex-col`}
      >
        <div className="flex justify-end px-3 py-3">
          <button
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((v) => !v)}
            className="grid place-items-center h-7 w-7 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--foreground)]"
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <nav className="px-3 py-2 flex-1 overflow-auto">
          {!collapsed && (
            <div className="text-xs uppercase tracking-wide mb-2 opacity-70">Main</div>
          )}
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors border border-transparent hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)] min-h-[44px]"
              >
                <Icon className="h-5 w-5 shrink-0 text-[color:var(--foreground)]" />
                {!collapsed && (
                  <span className="truncate text-[color:var(--foreground)]">{label}</span>
                )}
              </Link>
            ))}
          </div>
        </nav>

        <div className="px-3 py-3 text-xs opacity-70">
          {!collapsed && <div>v1.0</div>}
        </div>
      </aside>
    </>
  );
}
