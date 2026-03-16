"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type UserInfo = { name: string | null; image: string | null } | null;

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
  const initial = (userName?.[0] ?? "U").toUpperCase();

  return (
    <div className="hidden md:flex items-center justify-end h-12 px-4 border-b border-border bg-background/80 backdrop-blur-xl shrink-0 z-20">
      <div className="relative" ref={ref}>
        <button
          aria-label="Profile menu"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 h-8 w-8 rounded-full overflow-hidden border border-border bg-card grid place-items-center hover:ring-2 hover:ring-border transition-all"
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

        {open && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            {userName && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-semibold truncate">{userName}</p>
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
