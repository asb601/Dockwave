"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  Bot,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileText,
  Home,
  MessageSquare,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  History,
  X,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface Source {
  file: string;
  page: number | null;
  preview: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Source[];
}

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: Source[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

/* ── Chat History helpers ──────────────────────────────────────────────────── */

function hydrateMessages(messages: StoredMessage[]): Message[] {
  return messages.map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
  }));
}

/* ── Prompt suggestions for empty state ────────────────────────────────────── */

const SUGGESTIONS = [
  { icon: <Search className="w-4 h-4" />, label: "Summarise my latest upload" },
  { icon: <FileText className="w-4 h-4" />, label: "What are the key takeaways?" },
  { icon: <Sparkles className="w-4 h-4" />, label: "Compare two documents" },
  { icon: <MessageSquare className="w-4 h-4" />, label: "Explain this in simple terms" },
] as const;

/* ── Empty State ───────────────────────────────────────────────────────────── */

function EmptyState({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 sm:py-12 animate-in fade-in duration-500">
      <div className="mb-5 sm:mb-6 h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-secondary border border-border grid place-items-center">
        <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-center mb-1.5 sm:mb-2 tracking-tight">
        What can I help you find?
      </h2>
      <p className="text-muted-foreground text-center max-w-md text-xs sm:text-sm mb-6 sm:mb-8 px-2">
        Ask anything about your documents — summaries, comparisons, specific
        data, or just a quick explainer.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg px-2">
        {SUGGESTIONS.map(({ icon, label }) => (
          <button
            key={label}
            onClick={() => onPrompt(label)}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 sm:py-3 text-left text-[13px] sm:text-sm font-medium transition-all hover:bg-accent hover:border-foreground/20 hover:shadow-sm active:scale-[0.98]"
          >
            <span className="shrink-0 text-muted-foreground">{icon}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Typing indicator ──────────────────────────────────────────────────────── */

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 sm:gap-3 max-w-3xl">
      <div className="shrink-0 mt-0.5 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-secondary border border-border grid place-items-center">
        <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

/* ── References Panel ──────────────────────────────────────────────────────── */

function ReferencesPanel({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">
          {sources.length} reference{sources.length !== 1 ? "s" : ""}
        </span>
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <ul className="border-t border-border divide-y divide-border">
          {sources.map((s, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-2">
              <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">
                  {s.file}{s.page ? <span className="ml-1 text-muted-foreground font-normal">p.{s.page}</span> : null}
                </p>
                {s.preview && (
                  <p className="text-muted-foreground line-clamp-2 mt-0.5">{s.preview}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Message Bubble ────────────────────────────────────────────────────────── */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-2 sm:gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 mt-0.5 h-7 w-7 sm:h-8 sm:w-8 rounded-full grid place-items-center text-xs font-bold ${
          isUser
            ? "bg-secondary border border-border text-foreground"
            : "bg-secondary border border-border text-muted-foreground"
        }`}
      >
        {isUser ? <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-1 max-w-[min(80vw,44rem)]">
        <div
          className={`rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-[15px] leading-relaxed select-text ${
            isUser
              ? "rounded-tr-sm bg-secondary border border-border text-foreground"
              : "rounded-tl-sm bg-card border border-border prose-chat"
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {!isUser && message.sources && message.sources.length > 0 && (
          <ReferencesPanel sources={message.sources} />
        )}

        <span
          className={`text-[10px] text-muted-foreground/60 px-1 ${isUser ? "text-right" : "text-left"}`}
        >
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

/* ── Message List ──────────────────────────────────────────────────────────── */

function MessageList({
  messages,
  sending,
  endRef,
}: {
  messages: Message[];
  sending: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-3xl space-y-4 sm:space-y-5">
      {messages.map((m, idx) => (
        <MessageBubble key={idx} message={m} />
      ))}
      {sending && <TypingIndicator />}
      <div ref={endRef} />
    </div>
  );
}

/* ── Chat Composer ─────────────────────────────────────────────────────────── */

function ChatComposer({
  onSubmit,
  sending,
}: {
  onSubmit: (text: string) => void;
  sending: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const v = textareaRef.current?.value?.trim();
    if (!v || sending) return;
    onSubmit(v);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
  }

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-lg pb-20 md:pb-0">
      <div className="mx-auto max-w-3xl px-3 sm:px-4 py-2.5 sm:py-3 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-1.5 sm:p-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:border-foreground/20">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask about your documents…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 sm:py-2 text-sm sm:text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/50"
            onInput={resize}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending}
            aria-label="Send message"
            className={`shrink-0 h-8 w-8 sm:h-9 sm:w-9 rounded-xl grid place-items-center transition-all ${
              sending
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
            }`}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50 hidden sm:block">
          Docwave can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

/* ── Chat History Sidebar ───────────────────────────────────────────────── */

function ChatHistoryPanel({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold">Chat History</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNew}
            className="h-7 w-7 rounded-lg hover:bg-secondary grid place-items-center transition-colors"
            aria-label="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg hover:bg-secondary grid place-items-center transition-colors"
            aria-label="Close history"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        {sessions.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No conversations yet
          </p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 px-3 py-2 mx-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                s.id === activeId
                  ? "bg-secondary font-medium"
                  : "hover:bg-secondary/60"
              }`}
            >
              <button
                className="flex-1 text-left truncate min-w-0"
                onClick={() => { onSelect(s.id); onClose(); }}
              >
                {s.title}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="shrink-0 h-6 w-6 rounded grid place-items-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                aria-label="Delete chat"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Main ChatClient ───────────────────────────────────────────────────────── */

export default function ChatClient() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async (preferredSessionId?: string | null) => {
    const res = await fetch("/api/chat", { cache: "no-store" });
    if (!res.ok) {
      return;
    }

    const data = (await res.json()) as { sessions?: ChatSession[] };
    const nextSessions = data.sessions ?? [];
    setSessions(nextSessions);

    const targetId = preferredSessionId === undefined ? activeSessionId : preferredSessionId;
    if (targetId) {
      const active = nextSessions.find((session) => session.id === targetId);
      if (active) {
        setActiveSessionId(active.id);
        setMessages(hydrateMessages(active.messages));
        return;
      }
    }

    if (nextSessions.length > 0) {
      setActiveSessionId(nextSessions[0].id);
      setMessages(hydrateMessages(nextSessions[0].messages));
      return;
    }

    setActiveSessionId(null);
    setMessages([]);
  }, [activeSessionId]);

  // Load sessions from the database on mount
  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
  }

  function selectSession(id: string) {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    setActiveSessionId(id);
    setMessages(hydrateMessages(session.messages));
  }

  async function deleteSession(id: string) {
    const res = await fetch(`/api/chat/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    await refreshSessions(activeSessionId === id ? null : activeSessionId);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    const sessionId = activeSessionId;
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Request failed");
      }
      const assistant: Message = {
        role: "assistant",
        content: data?.message?.content ?? "(no response)",
        timestamp: data?.message?.timestamp ? new Date(data.message.timestamp) : new Date(),
        sources: (data?.sources ?? []) as Source[],
      };
      const nextSessionId = (data?.sessionId as string | undefined) ?? sessionId ?? null;
      setActiveSessionId(nextSessionId);
      setMessages((m) => [...m, assistant]);
      await refreshSessions(nextSessionId);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-0">
      {/* History panel — desktop: collapsible sidebar */}
      {desktopSidebarOpen && (
        <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-background flex-col">
          <ChatHistoryPanel
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={selectSession}
            onNew={startNewChat}
            onDelete={deleteSession}
            onClose={() => setDesktopSidebarOpen(false)}
          />
        </aside>
      )}

      {/* Mobile history overlay */}
      {historyOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border flex flex-col md:hidden animate-in slide-in-from-left duration-200">
            <ChatHistoryPanel
              sessions={sessions}
              activeId={activeSessionId}
              onSelect={selectSession}
              onNew={startNewChat}
              onDelete={deleteSession}
              onClose={() => setHistoryOpen(false)}
            />
          </aside>
        </>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Header with home button + history toggle + new chat */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <Link
            href="/home"
            className="shrink-0 h-8 w-8 rounded-lg border border-border bg-card grid place-items-center active:scale-95 transition-transform md:hidden"
            aria-label="Home"
          >
            <Home className="w-3.5 h-3.5" />
          </Link>
          {/* Mobile: open history overlay */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="shrink-0 h-8 w-8 rounded-lg border border-border bg-card grid place-items-center active:scale-95 transition-transform md:hidden"
            aria-label="Chat history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          {/* Desktop: toggle sidebar */}
          {!desktopSidebarOpen && (
            <button
              onClick={() => setDesktopSidebarOpen(true)}
              className="hidden md:grid shrink-0 h-8 w-8 rounded-lg border border-border bg-card place-items-center hover:bg-secondary transition-colors"
              aria-label="Open sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-sm font-semibold truncate flex-1 text-center">Chat</span>
          <button
            onClick={startNewChat}
            className="shrink-0 h-8 w-8 rounded-lg border border-border bg-card grid place-items-center active:scale-95 transition-transform"
            aria-label="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {hasMessages ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <MessageList messages={messages} sending={sending} endRef={endRef} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <EmptyState onPrompt={sendMessage} />
          </div>
        )}
        <ChatComposer onSubmit={sendMessage} sending={sending} />
      </div>
    </div>
  );
}
