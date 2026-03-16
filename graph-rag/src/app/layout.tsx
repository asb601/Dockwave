import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AppNav from "@/components/layout/AppNav";
import SidebarGate from "@/components/layout/SidebarGate";
import DesktopTopBar from "@/components/layout/DesktopTopBar";

const sans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const display = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Papermind",
  description: "Docs + Chat + Calendar",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || hdrs.get("next-url") || "";
  const isLanding = pathname === "/" || pathname === "";

  const session = await getServerSession(authOptions);
  const user = session?.user
    ? {
        name: (session.user.name as string | null) ?? null,
        image: (session.user.image as string | null) ?? null,
      }
    : null;

  return (
    <html lang="en" className="dark">
      <body
        className={`${sans.variable} ${display.variable} ${mono.variable} font-sans antialiased overflow-x-hidden`}
      >
        <div className="flex h-dvh overflow-hidden">
          <SidebarGate user={user} />
          <main className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
            {isLanding && <AppNav />}
            {!isLanding && <DesktopTopBar user={user} />}
            <div className="relative flex-1 min-h-0 overflow-y-auto pt-14 md:pt-0">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
