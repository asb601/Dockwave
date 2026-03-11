"use client";

import { useEffect, useRef, useState } from "react";
import { SendIcon } from "lucide-react";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-64 grid place-items-center text-[color:var(--muted-foreground)] text-sm">
      Ask anything…
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`w-fit max-w-[85vw] sm:max-w-[72ch] lg:max-w-[80ch] rounded-2xl px-4 py-2.5 text-sm lg:text-base leading-relaxed ${
      isUser
        ? "ml-auto bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
        : "bg-[color:var(--card)] border border-[color:var(--border)] text-[color:var(--foreground)]"
    }`}>
      {message.content}
    </div>
  );
}

function MessageList({ messages, endRef }: { messages: Message[]; endRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="mx-auto px-3 sm:px-4 py-6 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div key={idx}>
              <MessageBubble message={m} />
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

function ChatInput({
  inputRef,
  onSubmit,
  sending,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-[color:var(--border)] bg-[color:var(--background)]/95 backdrop-blur"
    >
      <div className="mx-auto px-3 sm:px-4 py-3 sm:py-4 flex gap-2 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
        <input
          ref={inputRef}
          type="text"
          placeholder="Send a message"
          className="flex-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-sm lg:text-base text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] min-h-[44px]"
        />
        <button
          type="submit"
          disabled={sending}
          aria-label="Send message"
          className="px-4 py-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)] text-sm lg:text-base disabled:opacity-60 hover:opacity-90 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center gap-2"
        >
          <SendIcon className="w-4 h-4" />
          <span className="hidden sm:inline">{sending ? "Sending…" : "Send"}</span>
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", content: text.trim() };
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
      };
      setMessages((m) => [...m, assistant]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, something went wrong." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = inputRef.current?.value || "";
    if (!v.trim()) return;
    if (inputRef.current) inputRef.current.value = "";
    sendMessage(v);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} endRef={endRef} />
      </div>
      <ChatInput inputRef={inputRef} onSubmit={onSubmit} sending={sending} />
    </div>
  );
}
