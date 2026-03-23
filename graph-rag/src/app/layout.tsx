import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import RouteChrome from "@/components/layout/RouteChrome";

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
  title: "Docwave",
  description: "Docs + Chat + Calendar",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const user = session?.user
    ? {
        email: (session.user.email as string | null) ?? null,
        isAdmin: isAdminEmail(session.user.email),
        name: (session.user.name as string | null) ?? null,
        image: (session.user.image as string | null) ?? null,
      }
    : null;

  return (
    <html lang="en" className="dark">
      <body
        className={`${sans.variable} ${display.variable} ${mono.variable} font-sans antialiased overflow-x-hidden`}
      >
        <RouteChrome user={user}>{children}</RouteChrome>
      </body>
    </html>
  );
}
