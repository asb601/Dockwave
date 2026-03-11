"use client";

import { useState } from "react";
import Link from "next/link";
import UploadSection from "@/components/UploadSection";
import { FileIcon, EyeIcon, TrashIcon, X } from "lucide-react";
import { FolderPlusIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { useFilesAndFolders } from "@/hooks/useFilesAndFolders";
import type { FileItem } from "@/types";

type UserInfo = { name: string | null; image: string | null };

export default function FolderClient({
  folderId,
  folderName,
  parent,
  initialFiles,
}: {
  user: UserInfo;
  folderId: string;
  folderName: string;
  parent?: { id: string; name: string } | null;
  initialFiles: FileItem[];
}) {
  const { folders, files, loading, refresh } = useFilesAndFolders(folderId);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Use initialFiles as fallback while hook loads
  const displayFiles = files.length > 0 || !loading ? files : initialFiles;

  async function openFileInBrowser(fileId: string) {
    try {
      const res = await fetch(`/api/user/files/${fileId}/presign`);
      if (!res.ok) return alert("Failed to open file");
      const { url } = await res.json();
      window.open(url, "_blank", "noreferrer");
    } catch {
      alert("Failed to open file");
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;
    await fetch(`/api/user/files/${fileId}/delete`, { method: "DELETE" });
    await refresh();
  }

  async function uploadFileToCurrentFolder(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folderId", folderId);
      const res = await fetch("/api/user/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }));
        alert(err?.error || "Upload failed");
        return;
      }
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }
  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const list = e.dataTransfer?.files;
    if (!list || list.length === 0) return;
    await uploadFileToCurrentFolder(list[0]);
  }

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="max-w-6xl mx-auto px-4 pt-4 flex justify-end">
        <div className="relative">
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)] transition-colors min-h-[44px]"
            aria-haspopup="menu"
            aria-expanded={newOpen}
          >
            <PlusIcon className="w-4 h-4" />
            <span>New</span>
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${newOpen ? "rotate-180" : ""}`} />
          </button>
          {newOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md z-50 shadow-md">
              <button
                onClick={() => { setShowUploadPanel(true); setNewOpen(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-[color:var(--accent)] text-[color:var(--foreground)] min-h-[44px] flex items-center gap-2"
              >
                ⬆️ <span>Upload File</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-[color:var(--muted-foreground)] flex flex-wrap items-center gap-1">
          <Link href="/home" className="hover:text-[color:var(--foreground)] transition-colors">Home</Link>
          {parent && (
            <>
              <span>/</span>
              <Link href={`/folders/${parent.id}`} className="hover:text-[color:var(--foreground)] transition-colors">{parent.name}</Link>
            </>
          )}
          <span>/</span>
          <span className="font-medium text-[color:var(--foreground)]">{folderName}</span>
        </nav>

        {/* Files grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-[color:var(--secondary)] border border-[color:var(--border)] animate-pulse" />
            ))}
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="text-center py-16">
            <FolderPlusIcon className="w-12 h-12 mx-auto text-[color:var(--muted-foreground)]" />
            <p className="text-[color:var(--muted-foreground)] mt-3">No files in this folder. Drop files here or click Upload.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {displayFiles.map((file) => (
              <div key={file.id} className="group relative">
                <div
                  className="block p-4 bg-[color:var(--card)] hover:bg-[color:var(--secondary)] rounded-xl border border-[color:var(--border)] transition-all duration-200 cursor-pointer"
                  onClick={() => openFileInBrowser(file.id)}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-[color:var(--secondary)] rounded-lg grid place-items-center mb-3 group-hover:scale-105 transition-transform">
                      <FileIcon className="w-6 h-6 text-[color:var(--foreground)]" />
                    </div>
                    <span className="text-sm font-medium truncate w-full text-[color:var(--foreground)]">{file.name}</span>
                    <span className="text-xs text-[color:var(--muted-foreground)] mt-1">{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); openFileInBrowser(file.id); }}
                    title="Open"
                    className="p-1.5 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded-lg transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                    title="Delete"
                    className="p-1.5 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded-lg transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drag overlay */}
      {(isDragging || uploading) && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--secondary)] px-8 py-6 text-center text-[color:var(--foreground)]">
              <div className="text-sm">{uploading ? "Uploading…" : "Drop files to upload to this folder"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUploadPanel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowUploadPanel(false)} />
          <div className="relative z-10 w-full sm:max-w-lg bg-[color:var(--card)] border border-[color:var(--border)] rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Upload Files</h3>
              <button
                onClick={() => setShowUploadPanel(false)}
                className="p-2 hover:bg-[color:var(--secondary)] rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-[color:var(--foreground)]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <UploadSection
              folders={folders}
              files={displayFiles}
              loading={loading}
              defaultFolderId={folderId}
              onFileUploaded={() => { setShowUploadPanel(false); refresh(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
