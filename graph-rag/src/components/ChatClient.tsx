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
  FileText,
  MessageSquare,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
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

/* ── Message Bubble ────────────────────────────────────────────────────────── */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-2 sm:gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 mt-0.5 h-7 w-7 sm:h-8 sm:w-8 rounded-full grid place-items-center text-xs font-bold ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary border border-border text-muted-foreground"
        }`}
      >
        {isUser ? <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-1 max-w-[min(80vw,44rem)]">
        <div
          className={`rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-[15px] leading-relaxed ${
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
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
    <div className="border-t border-border bg-background/80 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-3xl px-3 sm:px-4 py-2.5 sm:py-3">
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
          Papermind can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

/* ── Main ChatClient ───────────────────────────────────────────────────────── */

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = {
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });
      const data = await res.json();
      const assistant: Message = {
        role: "assistant",
        content: data?.message?.content ?? "(no response)",
        timestamp: new Date(),
      };
      setMessages((m) => [...m, assistant]);
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
    <div className="flex flex-col h-full min-h-0">
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
  );
}
