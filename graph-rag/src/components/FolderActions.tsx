"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

type ApiErrorResponse = { error?: string };

const parseErrorResponse = async (res: Response): Promise<ApiErrorResponse> => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

export default function FolderActions({ folderId }: { folderId: string }) {
  const [subfolderName, setSubfolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function createSubfolder() {
    const name = subfolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/user/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: folderId }),
      });
      if (res.ok) {
        setSubfolderName("");
        window.location.reload();
      } else if (res.status === 409) {
        alert("A folder with this name already exists here.");
      } else {
        const err = await parseErrorResponse(res);
        alert(err.error || "Failed to create folder");
      }
    } finally {
      setCreating(false);
    }
  }

  async function uploadToThisFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderId", folderId);
    const res = await fetch("/api/user/upload", { method: "POST", body: formData });
    if (res.ok) {
      if (fileRef.current) fileRef.current.value = "";
      window.location.reload();
    } else {
      const err = await parseErrorResponse(res);
      alert(err.error || "Upload failed");
    }
  }

  return (
    <aside className="space-y-6">
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Add file here</h3>
        <input
          ref={fileRef}
          type="file"
          className="block w-full text-sm text-[color:var(--foreground)] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-[color:var(--border)] file:text-sm file:font-medium file:bg-[color:var(--card)] file:text-[color:var(--foreground)] hover:file:bg-[color:var(--accent)]"
          onChange={uploadToThisFolder}
        />
      </div>
      <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Create subfolder</h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Subfolder name"
            value={subfolderName}
            onChange={(e) => setSubfolderName(e.target.value)}
            className="flex-1 border border-[color:var(--border)] rounded-md px-3 py-2 bg-[color:var(--background)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
          />
          <Button
            onClick={createSubfolder}
            disabled={creating}
            className="bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90"
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </aside>
  );
}