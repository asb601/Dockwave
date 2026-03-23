"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Trash2,
  Search,
  FileText,
  Pencil,
  X,
  Check,
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Code,
  Link,
  Eye,
  EyeOff,
  ChevronLeft,
  PanelLeft,
  Home,
} from "lucide-react";
import NextLink from "next/link";

type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Toolbar helpers – wrap selected text or insert at cursor            */
/* ------------------------------------------------------------------ */

type WrapOp =
  | { type: "wrap"; before: string; after: string }
  | { type: "line"; prefix: string };

function applyFormat(
  ta: HTMLTextAreaElement,
  op: WrapOp,
  setText: (v: string) => void,
) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  let next: string;
  let cursorPos: number;

  if (op.type === "wrap") {
    const sel = value.slice(s, e);
    next = value.slice(0, s) + op.before + sel + op.after + value.slice(e);
    cursorPos = sel ? e + op.before.length + op.after.length : s + op.before.length;
  } else {
    // Find start of current line
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    next = value.slice(0, lineStart) + op.prefix + value.slice(lineStart);
    cursorPos = s + op.prefix.length;
  }

  setText(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(cursorPos, cursorPos);
  });
}

const TOOLBAR: { label: string; Icon: typeof Bold; op: WrapOp; shortcut?: string }[] = [
  { label: "Bold", Icon: Bold, op: { type: "wrap", before: "**", after: "**" }, shortcut: "b" },
  { label: "Italic", Icon: Italic, op: { type: "wrap", before: "_", after: "_" }, shortcut: "i" },
  { label: "Heading", Icon: Heading2, op: { type: "line", prefix: "## " } },
  { label: "Bullet list", Icon: List, op: { type: "line", prefix: "- " } },
  { label: "Numbered list", Icon: ListOrdered, op: { type: "line", prefix: "1. " } },
  { label: "Code", Icon: Code, op: { type: "wrap", before: "`", after: "`" } },
  { label: "Link", Icon: Link, op: { type: "wrap", before: "[", after: "](url)" } },
];

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function NotesClient() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Mobile: when a note is selected, hide the list
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  // Desktop: collapsible sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  /* ---- Data fetching ---- */

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  /* ---- CRUD ---- */

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Note", content: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        const newNote = data.note;
        setNotes((prev) => [newNote, ...prev]);
        setSelected(newNote);
        setEditing(true);
        setEditTitle(newNote.title);
        setEditContent(newNote.content);
        setMobileShowEditor(true);
        setTimeout(() => contentRef.current?.focus(), 80);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          title: editTitle,
          content: editContent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.note;
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
        setSelected(updated);
        setEditing(false);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
        if (selected?.id === id) {
          setSelected(null);
          setEditing(false);
          setMobileShowEditor(false);
        }
      }
    } catch {
      /* ignore */
    }
  };

  /* ---- Keyboard shortcuts in editor ---- */

  const handleEditorKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || !contentRef.current) return;

    if (e.key === "s") {
      e.preventDefault();
      handleSave();
      return;
    }

    const match = TOOLBAR.find((t) => t.shortcut === e.key);
    if (match) {
      e.preventDefault();
      applyFormat(contentRef.current, match.op, setEditContent);
    }
  };

  /* ---- Tab support ---- */

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = contentRef.current;
      if (!ta) return;
      const { selectionStart: s, value } = ta;
      const next = value.slice(0, s) + "  " + value.slice(s);
      setEditContent(next);
      requestAnimationFrame(() => {
        ta.setSelectionRange(s + 2, s + 2);
      });
    }
  };

  /* ---- Helpers ---- */

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()),
  );

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const openNote = (note: Note) => {
    setSelected(note);
    setEditing(false);
    setMobileShowEditor(true);
  };

  const startEditing = (note: Note) => {
    setEditing(true);
    setEditTitle(note.title);
    setEditContent(note.content);
    setShowPreview(false);
    setTimeout(() => contentRef.current?.focus(), 80);
  };

  /* ---- Render ---- */

  return (
    <div className="flex h-full overflow-hidden">
      {/* ========== Note list (sidebar) — desktop: collapsible ========== */}
      {sidebarOpen && (
        <div
          className={`${
            mobileShowEditor ? "hidden md:flex" : "flex"
          } w-full md:w-80 shrink-0 border-r border-border flex-col bg-background`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">Notes</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                title="New note"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                title="Close sidebar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-sm">
                {search ? "No matching notes" : "No notes yet"}
              </p>
              {!search && (
                <button
                  onClick={handleCreate}
                  className="mt-1 text-xs text-primary hover:underline"
                >
                  Create your first note
                </button>
              )}
            </div>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => openNote(note)}
                className={`w-full text-left px-4 py-3 border-b border-border transition-colors hover:bg-secondary/50 ${
                  selected?.id === note.id
                    ? "bg-secondary border-l-2 border-l-primary"
                    : ""
                }`}
              >
                <p className="text-sm font-medium truncate">{note.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {note.content || "Empty note"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {formatDate(note.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>
        </div>
      )}

      {/* ========== Main: note detail / editor ========== */}
      <div
        className={`${
          mobileShowEditor ? "flex" : "hidden md:flex"
        } flex-1 flex-col min-w-0 bg-background`}
      >
        {/* Header bar with home, sidebar toggle, new note */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <NextLink
            href="/home"
            className="shrink-0 h-8 w-8 rounded-lg border border-border bg-card grid place-items-center active:scale-95 transition-transform md:hidden"
            aria-label="Home"
          >
            <Home className="w-3.5 h-3.5" />
          </NextLink>
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="hidden md:grid shrink-0 h-8 w-8 rounded-lg border border-border bg-card place-items-center hover:bg-secondary transition-colors"
              aria-label="Open sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-sm font-semibold truncate flex-1 text-center">
            {selected ? selected.title : "Notes"}
          </span>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="shrink-0 h-8 w-8 rounded-lg border border-border bg-card grid place-items-center active:scale-95 transition-transform"
            aria-label="New note"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        ) : editing ? (
          /* -------- Edit mode -------- */
          <>
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <button
                onClick={() => { setEditing(false); setMobileShowEditor(false); }}
                className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 bg-transparent text-lg font-semibold focus:outline-none placeholder:text-muted-foreground"
                placeholder="Note title"
              />
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                title={showPreview ? "Hide preview" : "Show preview"}
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setSelected(null); setMobileShowEditor(false); }}
                className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                title="Close note"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Formatting toolbar */}
            <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-border bg-muted/30 overflow-x-auto no-scrollbar">
              {TOOLBAR.map(({ label, Icon, op, shortcut }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    if (contentRef.current) applyFormat(contentRef.current, op, setEditContent);
                  }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  title={`${label}${shortcut ? ` (⌘${shortcut.toUpperCase()})` : ""}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline">
                ⌘S save · ⌘B bold · ⌘I italic
              </span>
            </div>

            {/* Editor area (with optional preview) */}
            <div className="flex-1 flex min-h-0">
              <textarea
                ref={contentRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => { handleEditorKey(e); handleTab(e); }}
                className={`${
                  showPreview ? "w-1/2 border-r border-border" : "w-full"
                } resize-none bg-transparent px-4 py-3 text-sm leading-relaxed font-mono focus:outline-none placeholder:text-muted-foreground`}
                placeholder="Start writing markdown…"
              />
              {showPreview && (
                <div className="w-1/2 overflow-y-auto px-4 py-3 no-scrollbar">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editContent || "*Nothing yet…*"}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* -------- View mode -------- */
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <button
                onClick={() => setMobileShowEditor(false)}
                className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h1 className="flex-1 text-lg font-semibold truncate">
                {selected.title}
              </h1>
              <button
                onClick={() => startEditing(selected)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-secondary transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => handleDelete(selected.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setSelected(null); setEditing(false); setMobileShowEditor(false); }}
                className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                title="Close note"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 no-scrollbar">
              {selected.content ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  This note is empty.{" "}
                  <button
                    onClick={() => startEditing(selected)}
                    className="text-primary hover:underline"
                  >
                    Start writing
                  </button>
                </p>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
              Last updated {formatDate(selected.updatedAt)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
