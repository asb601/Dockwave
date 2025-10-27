"use client"

import { useEffect, useState } from "react"
import UploadSection from "@/components/UploadSection"
import Link from "next/link"
import ChatBotSection from "@/components/ChatBotSection"
import { FolderIcon, FileIcon, GridIcon, ListIcon, SearchIcon, TrashIcon, EyeIcon, FileText, UploadIcon, FolderPlusIcon, ChevronDownIcon } from "lucide-react"
import AppTopBar from "@/components/AppTopBar"

type Folder = { id: string; name: string; parentId?: string | null }
type FileItem = { id: string; name: string; createdAt: string; s3Key: string; folderId?: string | null }

type UserInfo = { name: string | null; image: string | null }

export default function HomeClient({ user }: { user: UserInfo }) {
  const [activeTab, setActiveTab] = useState<"files" | "chat">("files")
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")

  // New folder creation states
  const [newFolderName, setNewFolderName] = useState("")
  const [parentForNew, setParentForNew] = useState<string | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isSelectOpen, setIsSelectOpen] = useState(false)

  // Plus button dropdown and upload modal state
  const [showPlusDropdown, setShowPlusDropdown] = useState(false)
  const [showUploadPanel, setShowUploadPanel] = useState(false)

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch("/api/user/files-folders")
      const data = await res.json()
      setFolders(data.folders || [])
      setFiles(data.files || [])
    } catch (err) {
      setFolders([])
      setFiles([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setCreatingFolder(true)
    try {
      const res = await fetch("/api/user/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: parentForNew }),
      })
      if (res.ok) {
        setNewFolderName("")
        setParentForNew(null)
        setShowCreateForm(false)
        await fetchData()
      } else if (res.status === 409) {
        alert("A folder with this name already exists here.")
      } else {
        const err = await res.json().catch(() => ({}) as any)
        alert(err?.error || "Failed to create folder")
      }
    } finally {
      setCreatingFolder(false)
    }
  }

  const rootFolders = folders.filter((f) => !f.parentId)
  const rootFiles = files.filter((f) => !f.folderId)
  const hasContent = rootFolders.length > 0 || rootFiles.length > 0

  const filteredFolders = rootFolders.filter(folder => 
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredFiles = rootFiles.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  async function openFileInBrowser(fileId: string) {
    try {
      const res = await fetch(`/api/user/files/${fileId}/presign`)
      if (!res.ok) return alert('Failed to open file')
      const { url } = await res.json()
      window.open(url, '_blank', 'noreferrer')
    } catch (e) {
      alert('Failed to open file')
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Are you sure you want to delete this file?")) return
    await fetch(`/api/user/files/${fileId}/delete`, { method: "DELETE" })
    await fetchData()
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm("Are you sure you want to delete this folder?")) return
    await fetch(`/api/user/folders/${folderId}/delete`, { method: "DELETE" })
    await fetchData()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Background Aesthetics (neutral) */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 via-gray-800/10 to-gray-950" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_70%)]" />

      <AppTopBar
        user={user}
        search={searchQuery}
        onSearchChange={setSearchQuery}
        onNewCreateFolder={() => setShowCreateForm(true)}
        onNewUploadFile={() => setShowUploadPanel(true)}
      />

      {/* Tabs */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-6">
        <div className="inline-flex rounded-lg border border-gray-800 bg-gray-900/60 p-1 backdrop-blur">
          <button
            onClick={() => setActiveTab("files")}
            className={`px-4 py-2 rounded-md text-sm ${activeTab === "files" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Files
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-md text-sm ${activeTab === "chat" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-6">
        {activeTab === "chat" && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 backdrop-blur">
            <ChatBotSection />
          </div>
        )}

        {activeTab === "files" && (
          <div>
            {/* Create Folder Form */}
            {showCreateForm && (
              <div className="mb-6 bg-gray-900/60 rounded-2xl border border-gray-800 p-6 backdrop-blur">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gray-800 rounded-lg grid place-items-center">
                    <FolderPlusIcon className="w-5 h-5 text-gray-200" />
                  </div>
                  <h3 className="text-lg font-semibold">Create New Folder</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="px-4 py-2 bg-gray-950/70 border border-gray-800 rounded-lg placeholder:text-gray-400 focus:ring-2 focus:ring-gray-700/60 focus:border-transparent outline-none transition-all text-white"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateFolder(); } }}
                  />

                  <div className="relative">
                    <button
                      onClick={() => setIsSelectOpen(!isSelectOpen)}
                      className="w-full px-4 py-2 bg-gray-950/70 border border-gray-800 rounded-lg text-left focus:ring-2 focus:ring-gray-700/60 focus:border-transparent outline-none transition-all flex items-center justify-between text-gray-300"
                    >
                      <span className="text-gray-400">
                        {parentForNew ? folders.find((f) => f.id === parentForNew)?.name : "Root Directory"}
                      </span>
                      <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isSelectOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isSelectOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-gray-950/95 border border-gray-800 rounded-lg shadow-xl z-10 overflow-hidden backdrop-blur">
                        <button
                          onClick={() => { setParentForNew(null); setIsSelectOpen(false) }}
                          className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-900 hover:text-white transition-colors"
                        >
                          Root Directory
                        </button>
                        {folders.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => { setParentForNew(f.id); setIsSelectOpen(false) }}
                            className="w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-900 hover:text-white transition-colors"
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={handleCreateFolder}
                      disabled={creatingFolder || !newFolderName.trim()}
                      className="flex-1 px-4 py-2 bg-gray-800 text-white hover:bg-gray-700 disabled:bg-gray-700 disabled:text-gray-400 rounded-lg transition-all disabled:cursor-not-allowed shadow-lg shadow-black/20"
                    >
                      {creatingFolder ? "Creating..." : "Create"}
                    </button>
                    <button
                      onClick={() => { setShowCreateForm(false); setNewFolderName(""); setParentForNew(null) }}
                      className="px-4 py-2 bg-gray-800 text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
                      onKeyDown={(e) => { /* prevent form submit on enter here */ }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!hasContent && !showCreateForm ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-700/20 to-gray-600/20 rounded-3xl grid place-items-center mx-auto mb-6">
                  <FolderIcon className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Your workspace is empty</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">Start by creating folders to organize your work or upload your first document</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg shadow-black/20"
                >
                  Create your first folder
                </button>
              </div>
            ) : (
              <>
                {/* Content Grid/List */}
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {/* Folders */}
                    {filteredFolders.map((folder) => (
                      <div key={folder.id} className="group relative">
                        <Link
                          href={`/folders/${folder.id}`}
                          className="block p-4 bg-gray-900/60 hover:bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-all duration-200 backdrop-blur"
                        >
                          <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-gray-800 rounded-lg grid place-items-center mb-3 group-hover:scale-105 transition-transform">
                              <FolderIcon className="w-6 h-6 text-gray-200" />
                            </div>
                            <span className="text-sm font-medium truncate w-full text-white">{folder.name}</span>
                            <span className="text-xs text-gray-400 mt-1">Folder</span>
                          </div>
                        </Link>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          className="absolute top-2 right-2 p-1 bg-gray-800/80 hover:bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <TrashIcon className="w-3 h-3 text-gray-200" />
                        </button>
                      </div>
                    ))}

                    {/* Files */}
                    {filteredFiles.map((file) => (
                      <div key={file.id} className="group relative">
                        <div
                          className="block p-4 bg-gray-900/60 hover:bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-all duration-200 cursor-pointer backdrop-blur"
                          onClick={() => openFileInBrowser(file.id)}
                        >
                          <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-gray-800 rounded-lg grid place-items-center mb-3 group-hover:scale-105 transition-transform">
                              <FileIcon className="w-6 h-6 text-gray-200" />
                            </div>
                            <span className="text-sm font-medium truncate w-full text-white">{file.name}</span>
                            <span className="text-xs text-gray-400 mt-1">{new Date(file.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); openFileInBrowser(file.id) }} className="p-1 bg-gray-800/80 hover:bg-gray-800 rounded">
                            <EyeIcon className="w-3 h-3 text-gray-200" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id) }} className="p-1 bg-gray-800/80 hover:bg-gray-800 rounded">
                            <TrashIcon className="w-3 h-3 text-gray-200" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-800">
                      <div className="col-span-6">Name</div>
                      <div className="col-span-3">Modified</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-1">Actions</div>
                    </div>

                    {/* Folders */}
                    {filteredFolders.map((folder) => (
                      <Link
                        key={folder.id}
                        href={`/folders/${folder.id}`}
                        className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-900 rounded-lg border border-transparent hover:border-gray-800 transition-all group"
                      >
                        <div className="col-span-6 flex items-center gap-3">
                          <FolderIcon className="w-5 h-5 text-gray-300" />
                          <span className="font-medium text-white">{folder.name}</span>
                        </div>
                        <div className="col-span-3 text-gray-400 text-sm">—</div>
                        <div className="col-span-2 text-gray-400 text-sm">Folder</div>
                        <div className="col-span-1 flex items-center gap-1">
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteFolder(folder.id) }} className="p-1 text-gray-400 hover:text-gray-200 rounded">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </Link>
                    ))}

                    {/* Files */}
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-900 rounded-lg border border-transparent hover:border-gray-800 transition-all group cursor-pointer"
                        onClick={() => openFileInBrowser(file.id)}
                      >
                        <div className="col-span-6 flex items-center gap-3">
                          <FileIcon className="w-5 h-5 text-gray-300" />
                          <span className="font-medium text-white">{file.name}</span>
                        </div>
                        <div className="col-span-3 text-gray-400 text-sm">{new Date(file.createdAt).toLocaleDateString()}</div>
                        <div className="col-span-2 text-gray-400 text-sm">File</div>
                        <div className="col-span-1 flex items-center gap-1">
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); openFileInBrowser(file.id) }} className="p-1 text-gray-300 hover:text-gray-100 rounded">
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteFile(file.id) }} className="p-1 text-gray-300 hover:text-gray-100 rounded">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUploadPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowUploadPanel(false)} />
          <div className="relative z-10 w-full max-w-lg bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload Files</h3>
              <button onClick={() => setShowUploadPanel(false)} className="p-2 hover:bg-gray-900 rounded-lg transition-colors" aria-label="Close">×</button>
            </div>
            <UploadSection folders={folders} files={files} loading={loading} onFileUploaded={() => { setShowUploadPanel(false); fetchData(); }} />
          </div>
        </div>
      )}
    </div>
  )
}