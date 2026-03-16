"use client";

import Link from "next/link";
import Image from "next/image";
import {
  FileText,
  PlusIcon,
  ChevronDownIcon,
  SearchIcon,
  X,
} from "lucide-react";
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
  const [searchExpanded, setSearchExpanded] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link href="/home" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg grid place-items-center border border-border bg-card">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className="text-base sm:text-lg font-semibold hidden sm:block">
            Docwave
          </span>
        </Link>

        <div className="flex-1" />

        {/* Search */}
        {typeof search !== "undefined" && onSearchChange && (
          <>
            <div className="relative w-full max-w-xs sm:max-w-md hidden sm:block">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search files and folders\u2026"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="input pl-10"
              />
            </div>

            <button
              className="btn-icon sm:hidden h-9 w-9"
              onClick={() => setSearchExpanded((v) => !v)}
              aria-label="Toggle search"
            >
              {searchExpanded ? (
                <X className="w-4 h-4" />
              ) : (
                <SearchIcon className="w-4 h-4" />
              )}
            </button>
          </>
        )}

        {/* New menu */}
        {(onNewCreateFolder || onNewUploadFile) && (
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="btn btn-outline"
              aria-expanded={open}
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
              <ChevronDownIcon
                className={`w-4 h-4 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            {open && (
              <div className="dropdown">
                {onNewCreateFolder && (
                  <button
                    onClick={() => {
                      onNewCreateFolder();
                      setOpen(false);
                    }}
                    className="dropdown-item"
                  >
                    📁 <span>Create Folder</span>
                  </button>
                )}
                {onNewUploadFile && (
                  <button
                    onClick={() => {
                      onNewUploadFile();
                      setOpen(false);
                    }}
                    className="dropdown-item"
                  >
                    ⬆️ <span>Upload File</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Avatar */}
        <Link href="/profile" className="block shrink-0">
          {user?.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "Profile"}
              width={32}
              height={32}
              className="rounded-full border border-border"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-card border border-border grid place-items-center text-[10px]">
              {(user?.name?.[0] ?? "U").toUpperCase()}
            </div>
          )}
        </Link>
      </div>

      {/* Mobile search row */}
      {searchExpanded && typeof search !== "undefined" && onSearchChange && (
        <div className="sm:hidden px-4 pb-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              placeholder="Search files and folders\u2026"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input pl-10"
            />
          </div>
        </div>
      )}
    </nav>
  );
}
