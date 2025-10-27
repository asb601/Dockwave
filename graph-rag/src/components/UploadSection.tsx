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
      const err = await res.json().catch(() => ({} as any));
      alert(err?.error || 'File upload failed');
    }
  }

  return (
    <div className="space-y-6">
      {/* Add file */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-100 mb-4">Add file</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-neutral-400 text-sm">Destination</label>
            <select
              value={destFolderId}
              onChange={(e) => setDestFolderId(e.target.value)}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 focus:border-neutral-700"
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
            className="block w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-neutral-800 file:text-neutral-100 hover:file:bg-neutral-700"
            onChange={handleFileUpload}
          />
          <p className="text-xs text-neutral-500">Max 10MB. PDF, TXT, DOCX supported.</p>
        </div>
      </div>

      {/* Your files */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <h3 className="text-sm font-semibold text-neutral-100 mb-4">Your files</h3>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-neutral-900 border border-neutral-800 animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900 p-6 text-center text-sm text-neutral-400">
            No files uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <span className="truncate text-neutral-200 text-sm">{file.name}</span>
                <span className="text-xs text-neutral-500">{new Date(file.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
