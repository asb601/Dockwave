// app/profile/page.tsx
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id as string },
    include: { files: true, folders: { include: { children: true } } },
  });

  if (!user) return <p className="max-w-3xl mx-auto p-6 text-[color:var(--muted-foreground)]">User not found.</p>;

  const rootFolders = user.folders.filter((folder) => !folder.parentId);
  const avatar = (user.image as string | null) || null;
  // Get provider from session.user if available
  const provider = session?.user?.provider || null;

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      

      {/* Main content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 flex items-center gap-5 mb-8">
          {avatar ? (
            <Image src={avatar} alt={user.name || "Profile Image"} width={80} height={80} className="rounded-full ring-2 ring-[color:var(--border)]" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-[color:var(--secondary)] border border-[color:var(--border)] grid place-items-center text-xl font-semibold">
              {(user.name?.[0] || "U").toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{user.name || "No Name"}</h1>
            {provider === "google" ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">Gmail ID: {user.email || "Not linked"}</p>
            ) : (
              <p className="text-sm text-[color:var(--muted-foreground)]">GitHub ID: {user.githubId || "Not linked"}</p>
            )}
            <p className="text-sm text-[color:var(--muted-foreground)]">Email: {user.email || "Not provided"}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">Folders</p>
            <p className="mt-1 text-xl font-semibold">{user.folders.length}</p>
          </div>
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">Root folders</p>
            <p className="mt-1 text-xl font-semibold">{rootFolders.length}</p>
          </div>
          <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">Files</p>
            <p className="mt-1 text-xl font-semibold">{user.files.length}</p>
          </div>
        </div>

        {/* Folders */}
        <section className="mb-8 bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl">
          <div className="px-6 py-5 border-b border-[color:var(--border)]">
            <h2 className="text-lg font-semibold">Folders</h2>
          </div>
          <div className="p-6">
            {user.folders.length === 0 ? (
              <p className="text-[color:var(--muted-foreground)]">No folders yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {user.folders.map((folder) => (
                  <Link key={folder.id} href={`/folders/${folder.id}`} className="group rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--secondary)] transition-colors p-4">
                    <p className="font-medium">{folder.name}</p>
                    {folder.children?.length > 0 && <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{folder.children.length} subfolder(s)</p>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Files */}
        <section className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl">
          <div className="px-6 py-5 border-b border-[color:var(--border)]">
            <h2 className="text-lg font-semibold">Files</h2>
          </div>
          <div className="p-6">
            {user.files.length === 0 ? (
              <p className="text-[color:var(--muted-foreground)]">No files uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {user.files.map((file) => (
                  <li key={file.id} className="flex justify-between items-center rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3">
                    <p>{file.name}</p>
                    <p className="text-[color:var(--muted-foreground)] text-xs">{new Date(file.createdAt).toLocaleDateString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

