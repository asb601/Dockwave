"use client";

import Link from "next/link";
import {
  MessageSquare,
  Calendar as CalIcon,
  Home,
  ChevronLeft,
  X,
} from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const NAV_ITEMS = [
  { href: "/home", Icon: Home, label: "Home" },
  { href: "/chat", Icon: MessageSquare, label: "Chat" },
  { href: "/calendar", Icon: CalIcon, label: "Calendar" },
] as const;

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useLocalStorage(
    "app.sidebar.collapsed",
    false,
  );

  return (
    <>
      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onMobileClose}
            aria-hidden="true"
          />

          <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col sidebar md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold">Menu</span>
              <button
                aria-label="Close menu"
                onClick={onMobileClose}
                className="btn-icon h-9 w-9"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="px-3 py-4 flex-1 overflow-y-auto no-scrollbar">
              <div className="text-xs uppercase tracking-wide mb-2 text-muted-foreground px-3">
                Main
              </div>
              <div className="space-y-1">
                {NAV_ITEMS.map(({ href, Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={onMobileClose}
                    className="sidebar-link"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </nav>

            <div className="px-4 py-3 text-xs text-muted-foreground">v1.0</div>
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex sidebar ${
          collapsed ? "w-16" : "w-64"
        } flex-col`}
      >
        <div className="flex justify-end px-3 py-3">
          <button
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((v) => !v)}
            className="btn-icon h-7 w-7"
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <nav className="px-3 py-2 flex-1 overflow-y-auto no-scrollbar">
          {!collapsed && (
            <div className="text-xs uppercase tracking-wide mb-2 text-muted-foreground">
              Main
            </div>
          )}
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, Icon, label }) => (
              <Link key={href} href={href} className="sidebar-link group">
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            ))}
          </div>
        </nav>

        <div className="px-3 py-3 text-xs text-muted-foreground">
          {!collapsed && <span>v1.0</span>}
        </div>
      </aside>
    </>
  );
}
