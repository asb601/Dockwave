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
    <nav className="sticky top-0 z-40 bg-[color:var(--background)] border-b border-[color:var(--border)]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
        {/* Brand */}
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg grid place-items-center border border-[color:var(--border)] bg-[color:var(--card)]">
            <FileText className="w-5 h-5 text-[color:var(--foreground)]" />
          </div>
          <span className="text-lg font-semibold text-[color:var(--foreground)]">IntelliDoc AI</span>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search (optional) */}
        {typeof search !== "undefined" && onSearchChange && (
          <div className="relative w-full max-w-md mr-2">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
            />
          </div>
        )}

        {/* New dropdown */}
        {(onNewCreateFolder || onNewUploadFile) && (
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[color:var(--card)] border border-[color:var(--border)] rounded-md shadow-sm z-50">
                {onNewCreateFolder && (
                  <button
                    onClick={() => { onNewCreateFolder?.(); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[color:var(--foreground)] hover:bg-[color:var(--accent)]"
                  >📁 <span>Create Folder</span></button>
                )}
                {onNewUploadFile && (
                  <button
                    onClick={() => { onNewUploadFile?.(); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[color:var(--foreground)] hover:bg-[color:var(--accent)]"
                  >⬆️ <span>Upload File</span></button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Profile avatar */}
        <div>
          {user?.image ? (
            <Link href="/profile" className="block">
              <Image src={user.image} alt={user.name ?? 'Profile'} width={32} height={32} className="rounded-full border border-[color:var(--border)]" />
            </Link>
          ) : (
            <Link href="/profile" className="block">
              <div className="h-8 w-8 rounded-full bg-[color:var(--card)] border border-[color:var(--border)] grid place-items-center text-[10px] text-[color:var(--foreground)]">
                {(user?.name?.[0] ?? 'U').toUpperCase()}
              </div>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
