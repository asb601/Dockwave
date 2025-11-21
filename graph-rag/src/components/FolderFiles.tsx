"use client";

import { useRouter } from "next/navigation";

type FileItem = { id: string; name: string; createdAt: string | Date };
type ApiErrorResponse = { error?: string };

const parseErrorResponse = async (res: Response): Promise<ApiErrorResponse> => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

export default function FolderFiles({ files }: { files: FileItem[] }) {
  const router = useRouter();

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/user/files/${fileId}/delete`, { method: "DELETE" });
      if (!res.ok) {
        const error = await parseErrorResponse(res);
        alert(error.error || "Failed to delete file");
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
    } catch {
      alert("Failed to open file");
    }
  }

  if (!files || files.length === 0) {
    return <div className="text-[color:var(--muted-foreground)]">No files in this folder.</div>;
  }

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.id} className="flex justify-between items-center p-3 border border-[color:var(--border)] rounded-lg bg-[color:var(--card)]">
          <span className="truncate text-[color:var(--foreground)]">{file.name}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[color:var(--muted-foreground)]">
              {new Date(file.createdAt).toLocaleString()}
            </span>
            <button
              onClick={() => openFile(file.id)}
              className="text-sm px-2 py-1 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--accent)]"
              title="Open"
            >
              Open
            </button>
            <button
              onClick={() => handleDeleteFile(file.id)}
              className="text-sm px-2 py-1 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--accent)] text-[color:var(--destructive)]"
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
