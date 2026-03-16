import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FileText } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

/** Top navigation bar (server component) shown on the landing page. */
export default async function AppNav() {
  const session = await getServerSession(authOptions);
  const isAuthed = !!session?.user?.id;
  const userName = (session?.user?.name as string | null) ?? null;
  const userImage = (session?.user?.image as string | null) ?? null;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl grid place-items-center border border-border bg-secondary">
            <FileText className="w-4 h-4" />
          </div>
          <span className="font-semibold">Docwave</span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {!isAuthed ? (
            <Button asChild className="btn btn-primary">
              <Link href="/login">Login</Link>
            </Button>
          ) : (
            <>
              <Button asChild className="btn btn-primary">
                <Link href="/home">Home</Link>
              </Button>
              <Button asChild variant="outline" className="btn btn-outline">
                <Link href="/api/auth/signout?callbackUrl=/">Logout</Link>
              </Button>
              <Link href="/profile" className="block shrink-0">
                {userImage ? (
                  <Image
                    src={userImage}
                    alt={userName ?? "Profile"}
                    width={28}
                    height={28}
                    className="rounded-full ring-1 ring-border"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-secondary border border-border grid place-items-center text-[10px]">
                    {(userName?.[0] ?? "U").toUpperCase()}
                  </div>
                )}
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
