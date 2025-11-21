import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { headers } from "next/headers";
import AppNav from "@/utils/AppNav";
import SidebarGate from "@/utils/SidebarGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IntelliDoc",
  description: "Docs + Chat + Calendar",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || hdrs.get("next-url") || "";
  const isLanding = pathname === "/" || pathname === "";

  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex min-h-dvh">
          {/* Sidebar decided on the client to avoid header/pathname mismatches */}
          <SidebarGate />
          <main className="flex-1 min-w-0">
            {isLanding && <AppNav />}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
