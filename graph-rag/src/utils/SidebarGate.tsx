"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/utils/Sidebar";

export default function SidebarGate() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!pathname || pathname === "/" || pathname === "/login") return null;

  return (
    <>
      {/* Mobile hamburger button – only visible on small screens */}
      <button
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-30 grid place-items-center h-10 w-10 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] md:hidden shadow-sm"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
    </>
  );
}
