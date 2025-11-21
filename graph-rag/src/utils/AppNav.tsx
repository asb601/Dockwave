import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FileText } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default async function AppNav() {
  const session = await getServerSession(authOptions);
  const isAuthed = !!session?.user?.id;
  const userName = (session?.user?.name as string | null) ?? null;
  const userImage = (session?.user?.image as string | null) ?? null;

  return (
    <nav className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:var(--card)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--card)]/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl grid place-items-center border border-[color:var(--border)] bg-[color:var(--secondary)]">
              <FileText className="w-4 h-4 text-[color:var(--foreground)]" />
            </div>
            <Link href="/" className="font-semibold text-[color:var(--foreground)]">IntelliDoc</Link>
          </div>
          <div className="flex items-center gap-3">
            {!isAuthed ? (
              <Button asChild className="bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90">
                <Link href="/login">Login</Link>
              </Button>
            ) : (
              <>
                <Button asChild className="bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90">
                  <Link href="/home">Home</Link>
                </Button>
                <Button asChild variant="outline" className="border-[color:var(--border)] text-[color:var(--foreground)]">
                  <Link href="/api/auth/signout?callbackUrl=/">Logout</Link>
                </Button>
                <Link href="/profile" className="block">
                  {userImage ? (
                    <Image src={userImage} alt={userName ?? "Profile"} width={28} height={28} className="rounded-full ring-1 ring-[color:var(--border)]" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-[color:var(--secondary)] border border-[color:var(--border)] grid place-items-center text-[10px]">
                      {(userName?.[0] ?? "U").toUpperCase()}
                    </div>
                  )}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
