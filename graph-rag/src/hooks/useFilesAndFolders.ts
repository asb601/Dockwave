"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileItem, Folder } from "@/types";

interface FilesAndFoldersState {
  folders: Folder[];
  files: FileItem[];
  loading: boolean;
}

/**
 * Hook for fetching and managing files and folders from the API.
 * Provides refresh capability and optional folder-scoped filtering.
 */
export function useFilesAndFolders(filterFolderId?: string): FilesAndFoldersState & { refresh: () => Promise<void> } {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/files-folders");
      const data = await res.json() as { folders?: Folder[]; files?: FileItem[] };
      const allFolders = data.folders || [];
      const allFiles = data.files || [];
      setFolders(allFolders);
      setFiles(
        filterFolderId
          ? allFiles.filter((f) => f.folderId === filterFolderId)
          : allFiles
      );
    } catch {
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [filterFolderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { folders, files, loading, refresh: fetchData };
}
