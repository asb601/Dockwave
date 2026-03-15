"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";

/** Conditionally renders Sidebar on authenticated routes only. */
export default function SidebarGate() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const hiddenRoutes = ["/", "/login"];
  if (!pathname || hiddenRoutes.includes(pathname)) return null;

  return (
    <>
      <button
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
        className="btn-icon fixed top-3 left-3 z-30 h-10 w-10 shadow-sm md:hidden"
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
