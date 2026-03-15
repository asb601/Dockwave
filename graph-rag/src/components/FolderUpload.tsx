"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        const err = await res.json().catch(() => ({} as { error?: string }));
        alert(err?.error || "Upload failed");
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
        <label className="label">Add file</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="input-file w-full"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Max 10MB. PDF, TXT, DOCX supported.
        </p>
      </div>
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="btn btn-primary w-full"
      >
        {uploading ? "Uploading\u2026" : "Upload to this folder"}
      </button>
    </div>
  );
}
