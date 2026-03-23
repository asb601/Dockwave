"use client";

import { usePathname } from "next/navigation";
import AppNav from "@/components/layout/AppNav";
import SidebarGate from "@/components/layout/SidebarGate";
import DesktopTopBar from "@/components/layout/DesktopTopBar";

type UserInfo = {
  email: string | null;
  isAdmin: boolean;
  name: string | null;
  image: string | null;
} | null;

export default function RouteChrome({
  user,
  children,
}: {
  user: UserInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const isLanding = pathname === "/";
  const isAuthPage = pathname === "/login";

  return (
    <div className="flex h-dvh overflow-hidden">
      {!isLanding && !isAuthPage && <SidebarGate user={user} />}
      <main className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
        {isLanding && <AppNav user={user} />}
        {!isLanding && !isAuthPage && <DesktopTopBar user={user} />}
        <div
          className={`relative flex-1 min-h-0 overflow-y-auto ${
            !isLanding && !isAuthPage ? "pt-14 pb-20 md:pt-0 md:pb-0" : ""
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}