"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

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
        const err = await res.json().catch(() => ({} as any));
        alert(err?.error || "Failed to create folder");
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
      const err = await res.json().catch(() => ({} as any));
      alert(err?.error || "Upload failed");
    }
  }

  return (
    <aside className="space-y-8">
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Add file here</h3>
        <input ref={fileRef} type="file" className="block w-full text-foreground" onChange={uploadToThisFolder} />
      </div>
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Create subfolder</h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Subfolder name"
            value={subfolderName}
            onChange={(e) => setSubfolderName(e.target.value)}
            className="flex-1 border border-border rounded px-3 py-2 bg-background"
          />
          <Button onClick={createSubfolder} disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </aside>
  );
}