// Updated HomeClient Component with improved folder/file grid UI
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

// ── Sub-components ────────────────────────────────────────────────────────────

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
    <div className="p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--card)] mb-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FolderPlusIcon className="w-5 h-5" /> Create Folder
      </h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="flex-1 border border-[color:var(--border)] bg-[color:var(--background)] p-2.5 rounded-md text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] min-h-[44px]"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />

        {/* Parent folder selector */}
        <div className="relative sm:w-52">
          <button
            type="button"
            className="border border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--foreground)] p-2.5 rounded-md w-full flex justify-between items-center min-h-[44px]"
            onClick={() => setSelectOpen((v) => !v)}
          >
            <span className="truncate">
              {parentId ? folders.find((f) => f.id === parentId)?.name : "Root Directory"}
            </span>
            <ChevronDownIcon className="w-4 h-4 shrink-0 ml-2" />
          </button>
          {selectOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 border border-[color:var(--border)] bg-[color:var(--card)] rounded-md z-10 max-h-48 overflow-y-auto shadow-md">
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left hover:bg-[color:var(--accent)] text-[color:var(--foreground)] min-h-[44px]"
                onClick={() => { setParentId(null); setSelectOpen(false); }}
              >
                Root Directory
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="block w-full px-3 py-2.5 text-left hover:bg-[color:var(--accent)] text-[color:var(--foreground)] min-h-[44px]"
                  onClick={() => { setParentId(f.id); setSelectOpen(false); }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="px-4 py-2.5 rounded-md bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px]"
          disabled={creating || !name.trim()}
          onClick={handleCreate}
        >
          {creating ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          className="px-4 py-2.5 rounded-md border border-[color:var(--border)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)] transition-colors min-h-[44px]"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FolderCard({ folder, onDelete }: { folder: Folder; onDelete: (id: string) => void }) {
  return (
    <div className="group border border-[color:var(--border)] rounded-xl p-4 sm:p-5 bg-[color:var(--card)] hover:bg-[color:var(--accent)] transition relative">
      <Link href={`/folders/${folder.id}`}>
        <div className="flex flex-col items-center text-center">
          <FolderIcon className="w-10 h-10 mb-3 text-[color:var(--foreground)]" />
          <p className="font-semibold truncate w-full text-[color:var(--foreground)]">{folder.name}</p>
          <p className="text-xs text-[color:var(--muted-foreground)] mt-1">Folder</p>
        </div>
      </Link>
      <button
        onClick={() => onDelete(folder.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--destructive)] p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label={`Delete folder ${folder.name}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}

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
    <div className="group border border-[color:var(--border)] rounded-xl p-4 sm:p-5 bg-[color:var(--card)] hover:bg-[color:var(--accent)] transition relative">
      <div
        className="flex flex-col items-center text-center cursor-pointer"
        onClick={() => onOpen(file.id)}
      >
        <FileIcon className="w-10 h-10 mb-3 text-[color:var(--foreground)]" />
        <p className="font-semibold truncate w-full text-[color:var(--foreground)]">{file.name}</p>
        <p className="text-xs text-[color:var(--muted-foreground)] mt-1">
          {new Date(file.createdAt).toLocaleDateString()}
        </p>
      </div>
      <button
        onClick={() => onDelete(file.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--destructive)] p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label={`Delete file ${file.name}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyWorkspace({ onCreateFolder }: { onCreateFolder: () => void }) {
  return (
    <div className="text-center py-16 sm:py-20">
      <FolderIcon className="w-12 h-12 mx-auto text-[color:var(--muted-foreground)]" />
      <h3 className="text-xl font-semibold mt-4 text-[color:var(--foreground)]">Your workspace is empty</h3>
      <p className="text-[color:var(--muted-foreground)] mt-2">
        Create a folder or upload files to get started.
      </p>
      <button
        className="mt-6 px-6 py-3 rounded-md bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90 transition-opacity min-h-[44px]"
        onClick={onCreateFolder}
      >
        Create your first folder
      </button>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-[color:var(--card)] p-6 rounded-t-2xl sm:rounded-2xl border border-[color:var(--border)] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Upload Files</h3>
          <button
            className="p-2 hover:bg-[color:var(--secondary)] rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-[color:var(--foreground)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <UploadSection
          folders={folders}
          files={files}
          loading={loading}
          onFileUploaded={() => { onClose(); onUploaded(); }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeClient() {
  const { folders, files, loading, refresh } = useFilesAndFolders();
  const [searchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  async function openFileInBrowser(fileId: string) {
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
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFiles = rootFiles.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      {/* Page header */}
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
            <ChevronDownIcon
              className={`w-4 h-4 transition-transform ${newOpen ? "rotate-180" : ""}`}
            />
          </button>
          {newOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md z-50 shadow-md">
              <button
                onClick={() => { setShowCreateForm(true); setNewOpen(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-[color:var(--accent)] text-[color:var(--foreground)] min-h-[44px] flex items-center gap-2"
              >
                📁 <span>Create Folder</span>
              </button>
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

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-xl bg-[color:var(--secondary)] border border-[color:var(--border)] animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Folder creation form */}
        {!loading && showCreateForm && (
          <CreateFolderForm
            folders={folders}
            onCreated={() => { setShowCreateForm(false); refresh(); }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* Empty state */}
        {!loading && !hasContent && !showCreateForm && (
          <EmptyWorkspace onCreateFolder={() => setShowCreateForm(true)} />
        )}

        {/* Content grid */}
        {!loading && hasContent && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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
                onOpen={openFileInBrowser}
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

