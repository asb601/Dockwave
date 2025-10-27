"use client";

import { useEffect, useState } from 'react';
import UploadSection from '@/components/UploadSection';
import { useRouter } from 'next/navigation';

export default function ClientFolderUpload({ defaultFolderId }: { defaultFolderId: string }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [files, setFiles] = useState<Array<{ id: string; name: string; s3Key: string; createdAt: string; folderId?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/user/files-folders');
        const data = await res.json();
        if (!active) return;
        setFolders(data.folders || []);
        setFiles((data.files || []).filter((f: any) => f.folderId === defaultFolderId));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [defaultFolderId]);

  return (
    <div>
      <button onClick={() => setOpen(true)} className='px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors'>
        Upload
      </button>

      {open && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <div className='absolute inset-0 bg-black/50' onClick={() => setOpen(false)} />
          <div className='relative z-10 w-full max-w-lg bg-gray-900/80 border border-gray-800 rounded-2xl p-6 backdrop-blur'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-semibold'>Upload Files</h3>
              <button onClick={() => setOpen(false)} className='p-2 hover:bg-gray-900 rounded-lg transition-colors' aria-label='Close'>×</button>
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
