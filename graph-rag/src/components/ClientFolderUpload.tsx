"use client";

import { useEffect, useState } from "react";
import UploadSection from "@/components/UploadSection";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type FolderSummary = { id: string; name: string };
type UserFile = {
  id: string;
  name: string;
  s3Key: string;
  createdAt: string;
  folderId?: string | null;
};

export default function ClientFolderUpload({
  defaultFolderId,
}: {
  defaultFolderId: string;
}) {
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
        const res = await fetch("/api/user/files-folders");
        const data = (await res.json()) as {
          folders?: FolderSummary[];
          files?: UserFile[];
        };
        if (!active) return;
        setFolders(data.folders || []);
        setFiles(
          (data.files || []).filter((f) => f.folderId === defaultFolderId),
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [defaultFolderId]);

  return (
    <div>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        Upload
      </button>

      {open && (
        <div className="modal-sheet-backdrop">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="modal-sheet sm:max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload Files</h3>
              <button
                onClick={() => setOpen(false)}
                className="btn-icon"
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
              onFileUploaded={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
