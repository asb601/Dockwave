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
  Upload,
  X,
} from "lucide-react";
import { useFilesAndFolders } from "@/hooks/useFilesAndFolders";
import type { FileItem, Folder } from "@/types";

/* ── Greeting helper ───────────────────────────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const TODAY = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

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
      <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
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
    <div className="group card hover:bg-accent transition-all relative">
      <Link href={`/folders/${folder.id}`} className="flex items-center gap-3 p-3.5 sm:p-4">
        <div className="shrink-0 h-10 w-10 rounded-xl bg-secondary border border-border grid place-items-center">
          <FolderIcon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{folder.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Folder</p>
        </div>
      </Link>
      <button
        onClick={() => onDelete(folder.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1 rounded-md hover:bg-destructive/10"
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
    <div className="group card hover:bg-accent transition-all relative">
      <div
        className="flex items-center gap-3 p-3.5 sm:p-4 cursor-pointer"
        onClick={() => onOpen(file.id)}
      >
        <div className="shrink-0 h-10 w-10 rounded-xl bg-secondary border border-border grid place-items-center">
          <FileIcon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(file.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        onClick={() => onDelete(file.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-1 rounded-md hover:bg-destructive/10"
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
      <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary border border-border grid place-items-center mb-4">
        <FolderIcon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg sm:text-xl font-semibold">Your workspace is empty</h3>
      <p className="text-muted-foreground mt-2 text-sm">
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

/* ── Section header ────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      {children}
    </h3>
  );
}

/* ── HomeClient ────────────────────────────────────────────────────────────── */

export default function HomeClient() {
  const { folders, files, loading, refresh } = useFilesAndFolders();
  const [searchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

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
    <div className="page-container py-4 sm:py-6 max-w-5xl">
      {/* ── Greeting header ─────────────────────────────────────────── */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{getGreeting()}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{TODAY}</p>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="btn btn-outline gap-1.5 text-sm"
        >
          <FolderPlusIcon className="w-4 h-4" />
          <span>New Folder</span>
        </button>
        <button
          onClick={() => setShowUploadPanel(true)}
          className="btn btn-primary gap-1.5 text-sm"
        >
          <Upload className="w-4 h-4" />
          <span>Upload</span>
        </button>
      </div>

      {/* ── Create folder form ──────────────────────────────────────── */}
      {showCreateForm && (
        <CreateFolderForm
          folders={folders}
          onCreated={() => {
            setShowCreateForm(false);
            refresh();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!loading && !hasContent && !showCreateForm && (
        <EmptyWorkspace onCreateFolder={() => setShowCreateForm(true)} />
      )}

      {/* ── Content ─────────────────────────────────────────────────── */}
      {!loading && hasContent && (
        <div className="space-y-8">
          {/* Folders */}
          {filteredFolders.length > 0 && (
            <section>
              <SectionLabel>
                Folders ({filteredFolders.length})
              </SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onDelete={handleDeleteFolder}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Files */}
          {filteredFiles.length > 0 && (
            <section>
              <SectionLabel>
                Files ({filteredFiles.length})
              </SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFiles.map((file) => (
                  <FileCard
                    key={file.id}
                    file={file}
                    onOpen={openFile}
                    onDelete={handleDeleteFile}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Upload modal ────────────────────────────────────────────── */}
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
