"use client";

import { useEffect, useState } from 'react';
import UploadSection from '@/components/UploadSection';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

type FolderSummary = { id: string; name: string };
type UserFile = { id: string; name: string; s3Key: string; createdAt: string; folderId?: string | null };

export default function ClientFolderUpload({ defaultFolderId }: { defaultFolderId: string }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/user/files-folders');
        const data = (await res.json()) as { folders?: FolderSummary[]; files?: UserFile[] };
        if (!active) return;
        setFolders(data.folders || []);
        setFiles((data.files || []).filter((file) => file.folderId === defaultFolderId));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [defaultFolderId]);

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 bg-[color:var(--primary)] text-[color:var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity min-h-[44px]"
      >
        Upload
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-lg bg-[color:var(--card)] border border-[color:var(--border)] rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Upload Files</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-[color:var(--secondary)] rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <UploadSection
              folders={folders}
              files={files}
              loading={loading}
              defaultFolderId={defaultFolderId}
              onFileUploaded={() => { setOpen(false); router.refresh(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
