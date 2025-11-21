// Updated HomeClient Component with improved folder/file grid UI
"use client";

import { useEffect, useState } from "react";
import UploadSection from "@/components/UploadSection";
import Link from "next/link";
import { FolderIcon, FileIcon, FolderPlusIcon, MoreVertical, ChevronDownIcon } from "lucide-react";
import { PlusIcon } from "lucide-react";

// Types
interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
}

interface FileItem {
  id: string;
  name: string;
  createdAt: string;
  s3Key: string;
  folderId?: string | null;
}

export default function HomeClient() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery] = useState("");

  // Folder creation state
  const [newFolderName, setNewFolderName] = useState("");
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  // Upload modal
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/user/files-folders");
      const data = await res.json();
      setFolders(data.folders || []);
      setFiles(data.files || []);
    } catch {
      setFolders([]);
      setFiles([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;

    setCreatingFolder(true);
    try {
      const res = await fetch("/api/user/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: parentForNew }),
      });

      if (res.ok) {
        setNewFolderName("");
        setParentForNew(null);
        setShowCreateForm(false);
        await fetchData();
      } else if (res.status === 409) {
        alert("Folder already exists.");
      } else {
        alert("Failed to create folder.");
      }
    } finally {
      setCreatingFolder(false);
    }
  }

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
    await fetchData();
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("Delete this folder?")) return;

    await fetch(`/api/user/folders/${folderId}/delete`, { method: "DELETE" });
    await fetchData();
  }

  // Root items only
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
      {/* Minimal page header with only '+ New' actions */}
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
                onClick={() => { setShowCreateForm(true); setNewOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-[color:var(--accent)]"
              >
                📁 Create Folder
              </button>
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

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Folder Create Form */}
        {showCreateForm && (
          <div className="p-4 border border-[color:var(--border)] rounded-lg bg-[color:var(--card)] mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FolderPlusIcon className="w-5 h-5" /> Create Folder
            </h3>

            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="border border-[color:var(--border)] bg-[color:var(--background)] p-2 rounded"
              />

              {/* Parent folder selector */}
              <div className="relative w-full md:w-64">
                <button
                  className="border  text-white border-[color:var(--border)] bg-[color:var(--background)] p-2 rounded w-full flex justify-between"
                  onClick={() => setIsSelectOpen(!isSelectOpen)}
                >
                  {parentForNew
                    ? folders.find((f) => f.id === parentForNew)?.name
                    : "Root Directory"}
                  <ChevronDownIcon className="w-4 h-4" />
                </button>

                {isSelectOpen && (
                  <div className="absolute   left-0 right-0 border border-[color:var(--border)] bg-[color:var(--card)] rounded mt-1 z-10">
                    <button
                      className="block  w-full px-3 py-2 text-left hover:bg-[color:var(--accent)]"
                      onClick={() => {
                        setParentForNew(null);
                        setIsSelectOpen(false);
                      }}
                    >
                      Root Directory
                    </button>

                    {folders.map((f) => (
                      <button
                        key={f.id}
                        className="block w-full px-3 py-2 text-left hover:bg-[color:var(--accent)]"
                        onClick={() => {
                          setParentForNew(f.id);
                          setIsSelectOpen(false);
                        }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="px-4 py-2 rounded-md bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90"
                disabled={creatingFolder || !newFolderName.trim()}
                onClick={handleCreateFolder}
              >
                {creatingFolder ? "Creating…" : "Create"}
              </button>

              <button
                className="px-4 py-2 rounded-md border border-[color:var(--border)]"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewFolderName("");
                  setParentForNew(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasContent && !showCreateForm && (
          <div className="text-center py-20">
            <FolderIcon className="w-12 h-12 mx-auto text-[color:var(--muted-foreground)]" />
            <h3 className="text-xl font-semibold mt-4">Your workspace is empty</h3>
            <p className="text-[color:var(--muted-foreground)] mt-2">
              Create a folder or upload files to get started.
            </p>
            <button
              className="mt-6 px-6 py-3 rounded-md bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90"
              onClick={() => setShowCreateForm(true)}
            >
              Create your first folder
            </button>
          </div>
        )}

        {/* CONTENT DISPLAY (Grid only) */}
        {hasContent && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {/* FOLDERS */}
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="group border border-[color:var(--border)] rounded-xl p-5 bg-[color:var(--card)] hover:bg-[color:var(--accent)] transition relative"
                >
                  <Link href={`/folders/${folder.id}`}>
                    <div className="flex flex-col items-center text-center">
                      <FolderIcon className="w-10 h-10 mb-3 text-[color:var(--foreground)]" />
                      <p className="font-semibold truncate w-full">{folder.name}</p>
                      <p className="text-xs text-[color:var(--muted-foreground)] mt-1">
                        Folder
                      </p>
                    </div>
                  </Link>

                  {/* ACTION (Delete) */}
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition text-[color:var(--destructive)]"
                    aria-label="Delete folder"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* FILES */}
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className="group border border-[color:var(--border)] rounded-xl p-5 bg-[color:var(--card)] hover:bg-[color:var(--accent)] transition relative"
                >
                  <div
                    className="flex flex-col items-center text-center cursor-pointer"
                    onClick={() => openFileInBrowser(file.id)}
                  >
                    <FileIcon className="w-10 h-10 mb-3 text-[color:var(--foreground)]" />
                    <p className="font-semibold truncate w-full">{file.name}</p>
                    <p className="text-xs text-[color:var(--muted-foreground)] mt-1">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDeleteFile(file.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition text-[color:var(--destructive)]"
                    aria-label="Delete file"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* UPLOAD MODAL */}
      {showUploadPanel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[color:var(--card)] p-6 rounded-lg border border-[color:var(--border)] max-w-lg w-full relative">
            <button
              className="absolute right-4 top-4 text-xl"
              onClick={() => setShowUploadPanel(false)}
            >
              ×
            </button>

            <h3 className="text-lg font-semibold mb-4">Upload Files</h3>

            <UploadSection
              folders={folders}
              files={files}
              loading={loading}
              onFileUploaded={() => {
                setShowUploadPanel(false);
                fetchData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

