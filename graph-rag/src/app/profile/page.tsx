import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { files: true, folders: { include: { children: true } } },
  });

  if (!user) {
    return (
      <p className="page-container py-6 text-muted-foreground">
        User not found.
      </p>
    );
  }

  const rootFolders = user.folders.filter((f) => !f.parentId);
  const avatar = (user.image as string | null) ?? null;
  const provider = session?.user?.provider ?? null;

  return (
    <div className="page-container py-8 max-w-5xl">
      {/* Header card */}
      <div className="card card-padded flex items-center gap-5 mb-8">
        {avatar ? (
          <Image
            src={avatar}
            alt={user.name || "Profile"}
            width={80}
            height={80}
            className="rounded-full ring-2 ring-border"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-secondary border border-border grid place-items-center text-xl font-semibold">
            {(user.name?.[0] || "U").toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{user.name || "No Name"}</h1>
          {provider === "google" ? (
            <p className="text-sm text-muted-foreground">
              Gmail: {user.email || "Not linked"}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              GitHub ID: {user.githubId || "Not linked"}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Email: {user.email || "Not provided"}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Folders", value: user.folders.length },
          { label: "Root folders", value: rootFolders.length },
          { label: "Files", value: user.files.length },
        ].map(({ label, value }) => (
          <div key={label} className="card card-padded">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Folders */}
      <section className="card mb-8">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Folders</h2>
        </div>
        <div className="card-body">
          {user.folders.length === 0 ? (
            <p className="text-muted-foreground">No folders yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {user.folders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/folders/${folder.id}`}
                  className="group rounded-xl border border-border bg-card hover:bg-secondary transition-colors p-4"
                >
                  <p className="font-medium">{folder.name}</p>
                  {folder.children?.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {folder.children.length} subfolder(s)
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Files */}
      <section className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Files</h2>
        </div>
        <div className="card-body">
          {user.files.length === 0 ? (
            <p className="text-muted-foreground">No files uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {user.files.map((file) => (
                <li
                  key={file.id}
                  className="flex justify-between items-center rounded-lg border border-border bg-card px-4 py-3"
                >
                  <p>{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
