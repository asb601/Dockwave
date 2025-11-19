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
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      {/* Main */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border border-[color:var(--border)] rounded-2xl p-6 bg-[color:var(--card)]">
          <ChatClient />
        </div>
      </main>
    </div>
  );
}
