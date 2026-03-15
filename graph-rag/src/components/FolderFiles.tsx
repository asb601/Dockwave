"use client";

import { useRouter } from "next/navigation";

type FileItem = { id: string; name: string; createdAt: string | Date };

export default function FolderFiles({ files }: { files: FileItem[] }) {
  const router = useRouter();

  async function handleDelete(fileId: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    const res = await fetch(`/api/user/files/${fileId}/delete`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: string }));
      alert(err?.error || "Failed to delete file");
    }
    router.refresh();
  }

  async function openFile(fileId: string) {
    try {
      const res = await fetch(`/api/user/files/${fileId}/presign`);
      if (!res.ok) return alert("Failed to open file");
      const { url } = await res.json();
      window.open(url, "_blank", "noreferrer");
    } catch {
      alert("Failed to open file");
    }
  }

  if (!files?.length) {
    return (
      <div className="text-muted-foreground">No files in this folder.</div>
    );
  }

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex justify-between items-center p-3 border border-border rounded-lg bg-card"
        >
          <span className="truncate">{file.name}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {new Date(file.createdAt).toLocaleString()}
            </span>
            <button
              onClick={() => openFile(file.id)}
              className="btn btn-outline text-sm px-2 py-1"
            >
              Open
            </button>
            <button
              onClick={() => handleDelete(file.id)}
              className="btn btn-danger text-sm px-2 py-1"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
