"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Settings, Shield, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type UserInfo = { name: string | null; image: string | null; email?: string | null; isAdmin?: boolean } | null;

const PAGE_TITLES: Record<string, string> = {
  "/home": "Home",
  "/chat": "Chat",
  "/calendar": "Calendar",
  "/notes": "Notes",
  "/profile": "Profile",
  "/admin/ai-access": "AI Requests",
};

/** Desktop-only top bar with profile avatar dropdown in the right corner. */
export default function DesktopTopBar({ user }: { user?: UserInfo }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const hiddenRoutes = ["/", "/login"];
  if (!pathname || hiddenRoutes.includes(pathname)) return null;

  const userName = user?.name ?? null;
  const userImage = user?.image ?? null;
  const isAdmin = user?.isAdmin ?? false;
  const initial = (userName?.[0] ?? "U").toUpperCase();
  const pageTitle =
    PAGE_TITLES[pathname] ??
    (pathname?.startsWith("/folders") ? "Files" : "Docwave");

  return (
    <div className="hidden md:flex items-center justify-between h-14 px-5 border-b border-border bg-background/85 backdrop-blur-xl shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{pageTitle}</p>
          <p className="text-xs text-muted-foreground truncate">Docwave workspace</p>
        </div>
      </div>

      <div className="relative" ref={ref}>
        <button
          aria-label="Profile menu"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 items-center gap-3 rounded-full border border-border bg-card pl-2 pr-3 shadow-sm transition-all hover:bg-accent"
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
            <div className="grid h-8 w-8 place-items-center rounded-full border border-border bg-secondary text-[11px] font-bold">
              {initial}
            </div>
          )}
          <div className="text-left leading-tight">
            <p className="max-w-32 truncate text-sm font-medium">{userName || "User"}</p>
            <p className="text-[11px] text-muted-foreground">{isAdmin ? "Admin" : "Account"}</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-card shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            {userName && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-semibold truncate">{userName}</p>
                {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
              </div>
            )}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Settings
            </Link>
            {isAdmin && (
              <Link
                href="/admin/ai-access"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Shield className="w-4 h-4 text-muted-foreground" />
                AI Requests
              </Link>
            )}
            <Link
              href="/api/auth/signout?callbackUrl=/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
