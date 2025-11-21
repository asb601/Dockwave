"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppTopBar from "@/components/AppTopBar";
import UploadSection from "@/components/UploadSection";
import { FileIcon, EyeIcon, TrashIcon } from "lucide-react";
import { FolderIcon, FolderPlusIcon, MoreVertical, ChevronDownIcon } from "lucide-react";
import { PlusIcon } from "lucide-react";

type UserInfo = { name: string | null; image: string | null };

type Folder = { id: string; name: string; parentId?: string | null };

type FileItem = { id: string; name: string; createdAt: string; s3Key: string; folderId?: string | null };
type FilesAndFoldersResponse = { folders?: Folder[]; files?: FileItem[] };

export default function FolderClient({
  user,
  folderId,
  folderName,
  parent,
  initialFiles,
}: {
  user: UserInfo;
  folderId: string;
  folderName: string;
  parent?: { id: string; name: string } | null;
  initialFiles: Array<{ id: string; name: string; createdAt: string; s3Key: string; folderId?: string | null }>;
}) {
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  // Drag & drop state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/user/files-folders");
      const data = (await res.json()) as FilesAndFoldersResponse;
      setFolders(data.folders || []);
      const byFolder = (data.files || []).filter((file) => file.folderId === folderId);
      setFiles(byFolder);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

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
    await fetchData();
  }

  // Upload a file (used by drop handler)
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
      await fetchData();
    } finally {
      setUploading(false);
    }
  }

  // Drag & drop handlers
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
    // Upload the first file; extend to multi-file later if needed
    await uploadFileToCurrentFolder(list[0]);
  }

  // Card grid like on Home page
  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      {/* Removed gradient overlays to use global theme */}

          <div className="max-w-6xl mx-auto px-4 pt-4 flex justify-end">
        <div className="relative">
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]"
            aria-haspopup="menu"
            aria-expanded={newOpen}
          >
            <PlusIcon className="w-4 h-4" />
            <span>New</span>
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${newOpen ? "rotate-180" : ""}`} />
          </button>
          {newOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md z-50">
            
              <button
                onClick={() => { setShowUploadPanel(true); setNewOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-[color:var(--accent)]"
              >
                ⬆️ Upload File
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        className="relative z-10 max-w-7xl mx-auto px-6 py-8"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-[color:var(--muted-foreground)]">
          <Link href="/home" className="hover:text-[color:var(--foreground)]">Home</Link>
          {parent && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/folders/${parent.id}`} className="hover:text-[color:var(--foreground)]">{parent.name}</Link>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="font-medium text-[color:var(--foreground)]">{folderName}</span>
        </nav>

        {/* Files list (no outer container) */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-[color:var(--secondary)] border border-[color:var(--border)] animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="text-sm text-[color:var(--muted-foreground)]">No files in this folder.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((file) => (
              <div key={file.id} className="group relative">
                {/* Card */}
                <div
                  className="block p-4 bg-[color:var(--card)] hover:bg-[color:var(--secondary)] rounded-xl border border-[color:var(--border)] transition-all duration-200 cursor-pointer"
                  onClick={() => openFileInBrowser(file.id)}
                >
                  {/* File Icon + Name */}
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-[color:var(--secondary)] rounded-lg grid place-items-center mb-3 group-hover:scale-105 transition-transform">
                      <FileIcon className="w-6 h-6 text-[color:var(--foreground)]" />
                    </div>
                    <span className="text-sm font-medium truncate w-full text-[color:var(--foreground)]">{file.name}</span>
                    <span className="text-xs text-[color:var(--muted-foreground)] mt-1">{new Date(file.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Floating Buttons (on hover) */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFileInBrowser(file.id);
                    }}
                    title="Open"
                    className="p-1.5 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded-lg transition-colors"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id);
                    }}
                    title="Delete"
                    className="p-1.5 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded-lg transition-colors"
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
              <div className="text-sm">{uploading ? "Uploading..." : "Drop files to upload to this folder"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal, opened via AppTopBar */}
      {showUploadPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowUploadPanel(false)} />
          <div className="relative z-10 w-full max-w-lg bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload Files</h3>
              <button onClick={() => setShowUploadPanel(false)} className="p-2 hover:bg-[color:var(--secondary)] rounded-lg transition-colors" aria-label="Close">×</button>
            </div>
            <UploadSection
              folders={folders}
              files={files}
              loading={loading}
              defaultFolderId={folderId}
              onFileUploaded={() => { setShowUploadPanel(false); fetchData(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
