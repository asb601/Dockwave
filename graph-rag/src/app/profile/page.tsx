// app/profile/page.tsx
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: session!.user!.id as string },
    include: { files: true, folders: { include: { children: true } } },
  });

  if (!user) return <p className="max-w-3xl mx-auto p-6 text-gray-400">User not found.</p>;

  const rootFolders = user.folders.filter((f: any) => !f.parentId);
  const avatar = (user.image as string | null) || null;

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Background Aesthetics (neutral) */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 via-gray-800/10 to-gray-950" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_70%)]" />

      {/* Top Navbar (match HomeClient) */}
      <nav className="sticky top-0 relative z-10 backdrop-blur-xl border-b border-gray-800/50 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-3">
          {/* Brand */}
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gray-800 rounded-xl grid place-items-center shadow-lg shadow-black/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">IntelliDoc AI</span>
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Home link to mirror simple nav action */}
          <Link
            href="/home"
            className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg shadow-black/20"
          >
            Home
          </Link>

          {/* Profile avatar (small) */}
          <div className="ml-2">
            {avatar ? (
              <Link href="/profile" className="block">
                <Image
                  src={avatar}
                  alt={user.name || "Profile"}
                  width={32}
                  height={32}
                  className="rounded-full ring-1 ring-gray-800 hover:ring-gray-700 transition-colors"
                />
              </Link>
            ) : (
              <Link href="/profile" className="block">
                <div className="h-8 w-8 rounded-full bg-gray-800 border border-gray-700 grid place-items-center text-[10px] text-gray-300">
                  {(user.name?.[0] || "U").toUpperCase()}
                </div>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 flex items-center gap-5 mb-8 backdrop-blur">
          {avatar ? (
            <Image
              src={avatar}
              alt={user.name || "Profile Image"}
              width={80}
              height={80}
              className="rounded-full ring-2 ring-gray-800"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-gray-800 border border-gray-700 grid place-items-center text-white text-xl font-semibold">
              {(user.name?.[0] || "U").toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{user.name || "No Name"}</h1>
            <p className="text-sm text-gray-400">GitHub ID: {user.githubId || "Not linked"}</p>
            <p className="text-sm text-gray-400">Email: {user.email || "Not provided"}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-gray-400">Folders</p>
            <p className="mt-1 text-xl font-semibold">{user.folders.length}</p>
          </div>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-gray-400">Root folders</p>
            <p className="mt-1 text-xl font-semibold">{rootFolders.length}</p>
          </div>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-gray-400">Files</p>
            <p className="mt-1 text-xl font-semibold">{user.files.length}</p>
          </div>
        </div>

        {/* Folders */}
        <section className="mb-8 bg-gray-900/60 border border-gray-800 rounded-2xl backdrop-blur">
          <div className="px-6 py-5 border-b border-gray-800">
            <h2 className="text-lg font-semibold">Folders</h2>
          </div>
          <div className="p-6">
            {user.folders.length === 0 ? (
              <p className="text-gray-400">No folders yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {user.folders.map((folder: any) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="group rounded-xl border border-gray-800 bg-gray-900/60 hover:bg-gray-900 transition-colors p-4"
                  >
                    <p className="font-medium text-white group-hover:text-white/90">{folder.name}</p>
                    {folder.children?.length > 0 && (
                      <p className="mt-1 text-xs text-gray-400">{folder.children.length} subfolder(s)</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Files */}
        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl backdrop-blur">
          <div className="px-6 py-5 border-b border-gray-800">
            <h2 className="text-lg font-semibold">Files</h2>
          </div>
          <div className="p-6">
            {user.files.length === 0 ? (
              <p className="text-gray-400">No files uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {user.files.map((file: any) => (
                  <li
                    key={file.id}
                    className="flex justify-between items-center rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3"
                  >
                    <p className="text-white">{file.name}</p>
                    <p className="text-gray-400 text-xs">{new Date(file.createdAt).toLocaleDateString()}</p>
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

