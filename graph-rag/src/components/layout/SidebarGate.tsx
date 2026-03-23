"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Sparkles, LogOut, Settings, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";

const PAGE_TITLES: Record<string, string> = {
  "/home": "Home",
  "/chat": "Chat",
  "/calendar": "Calendar",
  "/notes": "Notes",
  "/profile": "Profile",
};

type UserInfo = { name: string | null; image: string | null; email?: string | null; isAdmin?: boolean } | null;

/** Conditionally renders Sidebar + mobile top bar on authenticated routes. */
export default function SidebarGate({ user }: { user?: UserInfo }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* close dropdown on outside click */
  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  const hiddenRoutes = ["/", "/login"];
  if (!pathname || hiddenRoutes.includes(pathname)) return null;

  const pageTitle =
    PAGE_TITLES[pathname] ??
    (pathname?.startsWith("/folders") ? "Files" : "Docwave");

  const userName = user?.name ?? null;
  const userImage = user?.image ?? null;
  const isAdmin = user?.isAdmin ?? false;
  const initial = (userName?.[0] ?? "U").toUpperCase();

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed top-0 inset-x-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 md:hidden">
        {/* Left: menu + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="shrink-0 h-9 w-9 rounded-lg border border-border bg-card grid place-items-center active:scale-95 transition-transform"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold truncate">{pageTitle}</span>
          </div>
        </div>

        {/* Right: profile avatar with dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            aria-label="Profile menu"
            onClick={() => setProfileOpen((v) => !v)}
            className="shrink-0 h-8 w-8 rounded-full overflow-hidden border border-border bg-card grid place-items-center active:scale-95 transition-transform"
          >
            {userImage ? (
              <Image
                src={userImage}
                alt={userName ?? "Profile"}
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            ) : (
              <span className="text-[11px] font-bold">{initial}</span>
            )}
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              {userName && (
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold truncate">{userName}</p>
                </div>
              )}
              <Link
                href="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/ai-access"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  AI Requests
                </Link>
              )}
              <Link
                href="/api/auth/signout?callbackUrl=/"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </Link>
            </div>
          )}
        </div>
      </header>

      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
    </>
  );
}
