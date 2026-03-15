"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Calendar as CalIcon,
  Home,
  ChevronLeft,
  X,
  Sparkles,
  User,
  LogOut,
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
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useLocalStorage(
    "app.sidebar.collapsed",
    false,
  );

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

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
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold text-sm">Papermind</span>
              </div>
              <button
                aria-label="Close menu"
                onClick={onMobileClose}
                className="h-8 w-8 rounded-md hover:bg-secondary grid place-items-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="px-3 py-4 flex-1 overflow-y-auto no-scrollbar">
              <div className="space-y-1">
                {NAV_ITEMS.map(({ href, Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={onMobileClose}
                    className={`sidebar-link ${
                      isActive(href)
                        ? "bg-secondary border-border font-semibold"
                        : ""
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </nav>

            <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border space-y-1">
              <Link
                href="/profile"
                onClick={onMobileClose}
                className="flex items-center gap-2 py-1.5 text-sm text-foreground hover:text-foreground/80 transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Profile
              </Link>
              <Link
                href="/api/auth/signout?callbackUrl=/"
                className="flex items-center gap-2 py-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </Link>
            </div>
          </aside>
        </>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex sidebar ${
          collapsed ? "w-[4.5rem]" : "w-56"
        } flex-col shrink-0`}
      >
        {/* Brand */}
        <div
          className={`flex items-center ${
            collapsed ? "justify-center" : "justify-between"
          } px-3 py-3 border-b border-border`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="text-sm font-bold truncate">Papermind</span>
            </div>
          )}
          <button
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((v) => !v)}
            className="shrink-0 h-7 w-7 rounded-md hover:bg-secondary grid place-items-center transition-colors"
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <nav className="px-2 py-3 flex-1 overflow-y-auto no-scrollbar">
          <div className="space-y-1">
            {NAV_ITEMS.map(({ href, Icon, label }) => (
              <Link
                key={href}
                href={href}
                className={`sidebar-link ${
                  isActive(href)
                    ? "bg-secondary border-border font-semibold"
                    : ""
                } ${collapsed ? "justify-center px-0" : ""}`}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            ))}
          </div>
        </nav>

        <div className="px-3 py-3 text-xs text-muted-foreground border-t border-border">
          {!collapsed && <span>v1.0</span>}
        </div>
      </aside>
    </>
  );
}
