import React, { useEffect, useRef, useState } from 'react';

interface Folder {
  id: string;
  name: string;
}

interface FileItem {
  id: string;
  name: string;
  s3Key: string;
  createdAt: string;
}

interface UploadSectionProps {
  folders: Folder[];
  files: FileItem[];
  loading: boolean;
  onFileUploaded: () => void;
  defaultFolderId?: string;
}

export default function UploadSection({ folders, files, loading, onFileUploaded, defaultFolderId }: UploadSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [destFolderId, setDestFolderId] = useState<string>(defaultFolderId || '');

  useEffect(() => {
    if (defaultFolderId) {
      setDestFolderId(defaultFolderId);
    }
  }, [defaultFolderId]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    if (destFolderId) formData.append('folderId', destFolderId);
    const res = await fetch('/api/user/upload', { method: 'POST', body: formData });
    if (res.ok) {
      onFileUploaded();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      const err = await res.json().catch(() => ({} as { error?: string }));
      alert(err?.error || 'File upload failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <h2 className="text-sm font-semibold mb-4">Add file</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-[color:var(--muted-foreground)]">Destination</label>
            <select
              value={destFolderId}
              onChange={(e) => setDestFolderId(e.target.value)}
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
            >
              <option value="">Root</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="block w-full text-sm text-[color:var(--foreground)] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-[color:var(--border)] file:text-sm file:font-medium file:bg-[color:var(--card)] file:text-[color:var(--foreground)] hover:file:bg-[color:var(--accent)]"
            onChange={handleFileUpload}
          />
          <p className="text-xs text-[color:var(--muted-foreground)]">Max 10MB. PDF, TXT, DOCX supported.</p>
        </div>
      </div>
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4">
        <h3 className="text-sm font-semibold mb-4">Your files</h3>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-[color:var(--secondary)] border border-[color:var(--border)] animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] p-6 text-center text-sm text-[color:var(--muted-foreground)]">
            No files uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2"
              >
                <span className="truncate text-sm">{file.name}</span>
                <span className="text-xs text-[color:var(--muted-foreground)]">{new Date(file.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
