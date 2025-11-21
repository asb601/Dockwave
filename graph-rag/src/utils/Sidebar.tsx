"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Calendar as CalIcon, Home, ChevronLeft } from "lucide-react";

const SIDEBAR_KEY = "app.sidebar.collapsed";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem(SIDEBAR_KEY, nv ? "1" : "0"); } catch {}
      return nv;
    });
  };

  const Item = ({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) => (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-md px-3 py-2 transition-colors border border-transparent hover:border-[color:var(--border)] hover:bg-[color:var(--secondary)]`}
    >
      <Icon className="h-4 w-4 text-[color:var(--foreground)]" />
      {!collapsed && <span className="truncate text-[color:var(--foreground)]">{label}</span>}
    </Link>
  );

  return (
    <aside
      className={`h-dvh border-r border-[color:var(--border)] bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)] transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      } flex flex-col`}
    >
      <div className="flex justify-end gap-2 px-3 py-3">

        <button
          aria-label="Toggle sidebar"
          onClick={toggle}
          className="grid place-items-center h-7 w-7 rounded-md border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--foreground)]"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      <nav className="px-3 py-2 flex-1 overflow-auto">
        <div className="text-xs uppercase tracking-wide mb-2 opacity-70">Main</div>
        <div className="space-y-1">
          <Item href="/home" icon={Home} label="Home" />
          <Item href="/chat" icon={MessageSquare} label="Chat" />
          <Item href="/calendar" icon={CalIcon} label="Calendar" />
        </div>
      </nav>

      <div className="px-3 py-3 text-xs opacity-70">
        {!collapsed && <div>v1.0</div>}
      </div>
    </aside>
  );
}
