"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/utils/Sidebar";

export default function SidebarGate() {
  const pathname = usePathname();
  if (!pathname || pathname === "/"|| pathname === "/login") return null;
  return <Sidebar />;
}
