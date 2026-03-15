"use client";

import { useState } from "react";
import Link from "next/link";
import UploadSection from "@/components/UploadSection";
import {
  FileIcon,
  EyeIcon,
  TrashIcon,
  X,
  FolderPlusIcon,
  ChevronDownIcon,
  PlusIcon,
} from "lucide-react";
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

  const displayFiles = files.length > 0 || !loading ? files : initialFiles;

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

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;
    await fetch(`/api/user/files/${fileId}/delete`, { method: "DELETE" });
    await refresh();
  }

  async function uploadToFolder(file: File) {
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
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const list = e.dataTransfer?.files;
    if (!list || list.length === 0) return;
    await uploadToFolder(list[0]);
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Actions bar */}
      <div className="page-container pt-4 flex justify-end max-w-6xl">
        <div className="relative">
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="btn btn-outline"
            aria-haspopup="menu"
            aria-expanded={newOpen}
          >
            <PlusIcon className="w-4 h-4" />
            <span>New</span>
            <ChevronDownIcon
              className={`w-4 h-4 transition-transform ${
                newOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {newOpen && (
            <div className="dropdown">
              <button
                onClick={() => {
                  setShowUploadPanel(true);
                  setNewOpen(false);
                }}
                className="dropdown-item"
              >
                ⬆️ <span>Upload File</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className="page-container py-6 sm:py-8 max-w-7xl"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-muted-foreground flex flex-wrap items-center gap-1">
          <Link
            href="/home"
            className="hover:text-foreground transition-colors"
          >
            Home
          </Link>
          {parent && (
            <>
              <span>/</span>
              <Link
                href={`/folders/${parent.id}`}
                className="hover:text-foreground transition-colors"
              >
                {parent.name}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="font-medium text-foreground">{folderName}</span>
        </nav>

        {/* File grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 skeleton" />
            ))}
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="text-center py-16">
            <FolderPlusIcon className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground mt-3">
              No files in this folder. Drop files here or click Upload.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {displayFiles.map((file) => (
              <div key={file.id} className="group relative">
                <div
                  className="card hover:bg-secondary p-4 cursor-pointer transition-all"
                  onClick={() => openFile(file.id)}
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-secondary rounded-lg grid place-items-center mb-3 group-hover:scale-105 transition-transform">
                      <FileIcon className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-medium truncate w-full">
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFile(file.id);
                    }}
                    title="Open"
                    className="btn-icon h-8 w-8 bg-primary text-primary-foreground"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id);
                    }}
                    title="Delete"
                    className="btn-icon h-8 w-8 bg-primary text-primary-foreground"
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
            <div className="rounded-2xl border-2 border-dashed border-border bg-secondary px-8 py-6 text-center">
              <p className="text-sm">
                {uploading
                  ? "Uploading\u2026"
                  : "Drop files to upload to this folder"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUploadPanel && (
        <div className="modal-sheet-backdrop">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowUploadPanel(false)}
          />
          <div className="modal-sheet">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload Files</h3>
              <button
                onClick={() => setShowUploadPanel(false)}
                className="btn-icon"
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
              onFileUploaded={() => {
                setShowUploadPanel(false);
                refresh();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
