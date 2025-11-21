"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ApiErrorResponse = { error?: string };

const parseErrorResponse = async (res: Response): Promise<ApiErrorResponse> => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

export default function FolderUpload({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folderId", folderId);

      const res = await fetch("/api/user/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await parseErrorResponse(res);
        alert(err.error || "Upload failed");
        return;
      }

      setFile(null);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">Add file</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[color:var(--foreground)] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-[color:var(--border)] file:text-sm file:font-medium file:bg-[color:var(--card)] file:text-[color:var(--foreground)] hover:file:bg-[color:var(--accent)]"
        />
        <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">Max 10MB. PDF, TXT, DOCX supported.</p>
      </div>
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="inline-flex w-full items-center justify-center rounded-lg bg-[color:var(--primary)] px-4 py-2 text-sm font-medium text-[color:var(--primary-foreground)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "Upload to this folder"}
      </button>
    </div>
  );
}
