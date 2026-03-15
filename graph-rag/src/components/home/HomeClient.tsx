"use client";

import { useState } from "react";
import UploadSection from "@/components/UploadSection";
import Link from "next/link";
import {
  FolderIcon,
  FileIcon,
  FolderPlusIcon,
  MoreVertical,
  ChevronDownIcon,
  PlusIcon,
  X,
} from "lucide-react";
import { useFilesAndFolders } from "@/hooks/useFilesAndFolders";
import type { FileItem, Folder } from "@/types";

/* ── Create Folder Form ────────────────────────────────────────────────────── */

function CreateFolderForm({
  folders,
  onCreated,
  onCancel,
}: {
  folders: Folder[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/user/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, parentId }),
      });
      if (res.ok) {
        setName("");
        setParentId(null);
        onCreated();
      } else if (res.status === 409) {
        alert("Folder already exists.");
      } else {
        alert("Failed to create folder.");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card card-padded mb-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FolderPlusIcon className="w-5 h-5" /> Create Folder
      </h3>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="input flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />

        {/* Parent selector */}
        <div className="relative sm:w-52">
          <button
            type="button"
            className="btn btn-outline w-full justify-between"
            onClick={() => setSelectOpen((v) => !v)}
          >
            <span className="truncate">
              {parentId
                ? folders.find((f) => f.id === parentId)?.name
                : "Root Directory"}
            </span>
            <ChevronDownIcon className="w-4 h-4 shrink-0 ml-2" />
          </button>

          {selectOpen && (
            <div className="dropdown left-0 right-0 max-h-48 overflow-y-auto">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setParentId(null);
                  setSelectOpen(false);
                }}
              >
                Root Directory
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setParentId(f.id);
                    setSelectOpen(false);
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn btn-primary"
          disabled={creating || !name.trim()}
          onClick={handleCreate}
        >
          {creating ? "Creating\u2026" : "Create"}
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Folder Card ───────────────────────────────────────────────────────────── */

function FolderCard({
  folder,
  onDelete,
}: {
  folder: Folder;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group card hover:bg-accent transition relative">
      <Link href={`/folders/${folder.id}`} className="p-4 sm:p-5 block">
        <div className="flex flex-col items-center text-center">
          <FolderIcon className="w-10 h-10 mb-3" />
          <p className="font-semibold truncate w-full">{folder.name}</p>
          <p className="text-xs text-muted-foreground mt-1">Folder</p>
        </div>
      </Link>
      <button
        onClick={() => onDelete(folder.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1"
        aria-label={`Delete folder ${folder.name}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ── File Card ─────────────────────────────────────────────────────────────── */

function FileCard({
  file,
  onOpen,
  onDelete,
}: {
  file: FileItem;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group card hover:bg-accent transition relative">
      <div
        className="p-4 sm:p-5 cursor-pointer"
        onClick={() => onOpen(file.id)}
      >
        <div className="flex flex-col items-center text-center">
          <FileIcon className="w-10 h-10 mb-3" />
          <p className="font-semibold truncate w-full">{file.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(file.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        onClick={() => onDelete(file.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1"
        aria-label={`Delete file ${file.name}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ── Empty State ───────────────────────────────────────────────────────────── */

function EmptyWorkspace({ onCreateFolder }: { onCreateFolder: () => void }) {
  return (
    <div className="text-center py-16 sm:py-20">
      <FolderIcon className="w-12 h-12 mx-auto text-muted-foreground" />
      <h3 className="text-xl font-semibold mt-4">Your workspace is empty</h3>
      <p className="text-muted-foreground mt-2">
        Create a folder or upload files to get started.
      </p>
      <button
        className="btn btn-primary mt-6"
        onClick={onCreateFolder}
      >
        Create your first folder
      </button>
    </div>
  );
}

/* ── Upload Modal ──────────────────────────────────────────────────────────── */

function UploadModal({
  folders,
  files,
  loading,
  onClose,
  onUploaded,
}: {
  folders: Folder[];
  files: FileItem[];
  loading: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  return (
    <div className="modal-sheet-backdrop">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="modal-sheet">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Upload Files</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <UploadSection
          folders={folders}
          files={files}
          loading={loading}
          onFileUploaded={() => {
            onClose();
            onUploaded();
          }}
        />
      </div>
    </div>
  );
}

/* ── HomeClient ────────────────────────────────────────────────────────────── */

export default function HomeClient() {
  const { folders, files, loading, refresh } = useFilesAndFolders();
  const [searchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  async function openFile(fileId: string) {
    try {
      const res = await fetch(`/api/user/files/${fileId}/presign`);
      if (!res.ok) return alert("Failed to open file");
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      alert("Failed to open file");
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/user/files/${fileId}/delete`, { method: "DELETE" });
    await refresh();
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("Delete this folder?")) return;
    await fetch(`/api/user/folders/${folderId}/delete`, { method: "DELETE" });
    await refresh();
  }

  const rootFolders = folders.filter((f) => !f.parentId);
  const rootFiles = files.filter((f) => !f.folderId);
  const hasContent = rootFolders.length > 0 || rootFiles.length > 0;

  const filteredFolders = rootFolders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const filteredFiles = rootFiles.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="h-full overflow-y-auto">
      {/* Actions bar */}
      <div className="page-container pt-4 flex justify-end">
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
                  setShowCreateForm(true);
                  setNewOpen(false);
                }}
                className="dropdown-item"
              >
                📁 <span>Create Folder</span>
              </button>
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

      <main className="page-container py-6 max-w-6xl">
        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 skeleton" />
            ))}
          </div>
        )}

        {/* Create folder form */}
        {!loading && showCreateForm && (
          <CreateFolderForm
            folders={folders}
            onCreated={() => {
              setShowCreateForm(false);
              refresh();
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* Empty state */}
        {!loading && !hasContent && !showCreateForm && (
          <EmptyWorkspace onCreateFolder={() => setShowCreateForm(true)} />
        )}

        {/* Content grid */}
        {!loading && hasContent && (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {filteredFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onDelete={handleDeleteFolder}
              />
            ))}
            {filteredFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onOpen={openFile}
                onDelete={handleDeleteFile}
              />
            ))}
          </div>
        )}
      </main>

      {/* Upload modal */}
      {showUploadPanel && (
        <UploadModal
          folders={folders}
          files={files}
          loading={loading}
          onClose={() => setShowUploadPanel(false)}
          onUploaded={refresh}
        />
      )}
    </div>
  );
}
