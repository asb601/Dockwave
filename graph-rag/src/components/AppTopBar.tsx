"use client";

import Link from "next/link";
import Image from "next/image";
import { FileText, PlusIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

type UserInfo = { name: string | null; image: string | null };

export default function AppTopBar({
  user,
  search,
  onSearchChange,
  onNewCreateFolder,
  onNewUploadFile,
}: {
  user: UserInfo;
  search?: string;
  onSearchChange?: (v: string) => void;
  onNewCreateFolder?: () => void;
  onNewUploadFile?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 relative z-50 backdrop-blur-xl border-b border-gray-800/50 bg-gray-950/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-3">
        {/* Brand */}
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gray-800 rounded-xl grid place-items-center shadow-lg shadow-black/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">IntelliDoc AI</span>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search (optional) */}
        {typeof search !== "undefined" && onSearchChange && (
          <div className="relative w-full max-w-xl mr-2">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-900/70 border border-gray-800 rounded-lg placeholder:text-gray-400 focus:ring-2 focus:ring-gray-700/60 focus:border-transparent outline-none transition-all text-white"
            />
          </div>
        )}

        {/* New dropdown */}
        {(onNewCreateFolder || onNewUploadFile) && (
          <div className="relative mr-2">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-lg shadow-black/20"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-gray-950/95 border border-gray-800 rounded-lg shadow-xl z-50 backdrop-blur">
                {onNewCreateFolder && (
                  <button
                    onClick={() => { onNewCreateFolder?.(); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-900 transition-colors"
                  >
                    <span className="w-4 h-4 text-gray-300">📁</span>
                    <span>Create Folder</span>
                  </button>
                )}
                {onNewUploadFile && (
                  <button
                    onClick={() => { onNewUploadFile?.(); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-900 transition-colors"
                  >
                    <span className="w-4 h-4 text-gray-300">⬆️</span>
                    <span>Upload File</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Profile avatar */}
        <div className="ml-2">
          {user?.image ? (
            <Link href="/profile" className="block">
              <Image
                src={user.image}
                alt={user.name ?? "Profile"}
                width={32}
                height={32}
                className="rounded-full ring-1 ring-gray-800 hover:ring-gray-700 transition-colors"
              />
            </Link>
          ) : (
            <Link href="/profile" className="block">
              <div className="h-8 w-8 rounded-full bg-gray-800 border border-gray-700 grid place-items-center text-[10px] text-gray-300">
                {(user?.name?.[0] ?? "U").toUpperCase()}
              </div>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
