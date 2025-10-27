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
        const err = await res.json().catch(() => ({} as any));
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
        <label className="mb-2 block text-sm font-medium text-neutral-200">Add file</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-neutral-800 file:text-neutral-100 hover:file:bg-neutral-700"
        />
        <p className="mt-2 text-xs text-neutral-500">Max 10MB. PDF, TXT, DOCX supported.</p>
      </div>
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="inline-flex w-full items-center justify-center rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white border border-neutral-700 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "Upload to this folder"}
      </button>
    </div>
  );
}
