"use client";

import { useRouter } from "next/navigation";

type FileItem = { id: string; name: string; createdAt: string | Date };

export default function FolderFiles({ files }: { files: FileItem[] }) {
  const router = useRouter();

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/user/files/${fileId}/delete`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as any));
        alert(e?.error || "Failed to delete file");
        return;
      }
    } finally {
      router.refresh();
    }
  }

  async function openFile(fileId: string) {
    try {
      const res = await fetch(`/api/user/files/${fileId}/presign`);
      if (!res.ok) return alert("Failed to open file");
      const { url } = await res.json();
      window.open(url, "_blank", "noreferrer");
    } catch (e) {
      alert("Failed to open file");
    }
  }

  if (!files || files.length === 0) {
    return <div className="text-muted-foreground">No files in this folder.</div>;
  }

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.id} className="flex justify-between items-center p-3 border border-border rounded-lg bg-card">
          <span className="truncate">{file.name}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {new Date(file.createdAt).toLocaleString()}
            </span>
            <button
              onClick={() => openFile(file.id)}
              className="text-primary underline text-sm"
              title="Open"
            >
              Open
            </button>
            <button
              onClick={() => handleDeleteFile(file.id)}
              className="text-red-400 hover:text-red-300 text-sm"
              title="Delete"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
