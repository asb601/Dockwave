import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import ChatClient from "@/components/ChatClient";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import Image from "next/image";

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const user = { name: (session.user.name as string | null) ?? null, image: (session.user.image as string | null) ?? null };

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Background Aesthetics */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 via-gray-800/10 to-gray-950" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_70%)]" />

      {/* Top Navigation (Brand + Home + Avatar) */}
      <nav className="relative z-10 backdrop-blur-xl border-b border-gray-800/50 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">IntelliDoc AI</span>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild className="bg-gray-800 hover:bg-gray-700 text-white transition-colors shadow-lg shadow-black/20">
                <Link href="/home">Home</Link>
              </Button>
              {user.image ? (
                <Link href="/profile" className="block">
                  <Image src={user.image} alt={user.name ?? "Profile"} width={32} height={32} className="rounded-full ring-1 ring-gray-800 hover:ring-gray-700 transition-colors" />
                </Link>
              ) : (
                <Link href="/profile" className="block">
                  <div className="h-8 w-8 rounded-full bg-gray-800 border border-gray-700 grid place-items-center text-[10px] text-gray-300">
                    {(user.name?.[0] ?? "U").toUpperCase()}
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="prose prose-invert max-w-none">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl/10">
            <ChatClient />
          </div>
        </div>
      </main>
    </div>
  );
}
