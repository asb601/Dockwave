"use client";

import { useEffect, useRef, useState } from "react";
import { SendIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

/* ── Empty State ───────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
      Ask anything about your documents&hellip;
    </div>
  );
}

/* ── Message Bubble ────────────────────────────────────────────────────────── */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`w-fit max-w-[85vw] sm:max-w-[72ch] lg:max-w-[80ch] rounded-2xl px-4 py-2.5 text-sm lg:text-base leading-relaxed ${
        isUser
          ? "ml-auto bg-primary text-primary-foreground"
          : "card card-padded"
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
  );
}

/* ── Message List ──────────────────────────────────────────────────────────── */

function MessageList({
  messages,
  endRef,
}: {
  messages: Message[];
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="mx-auto px-3 sm:px-4 py-6 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <MessageBubble key={idx} message={m} />
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

/* ── Chat Input ────────────────────────────────────────────────────────────── */

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
    <form onSubmit={onSubmit} className="border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto px-3 sm:px-4 py-3 sm:py-4 flex gap-2 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
        <input
          ref={inputRef}
          type="text"
          placeholder="Send a message"
          className="input flex-1 rounded-xl px-4 py-3 text-sm lg:text-base"
        />
        <button
          type="submit"
          disabled={sending}
          aria-label="Send message"
          className="btn btn-primary rounded-xl px-4 py-3"
        >
          <SendIcon className="w-4 h-4" />
          <span className="hidden sm:inline">
            {sending ? "Sending\u2026" : "Send"}
          </span>
        </button>
      </div>
    </form>
  );
}

/* ── Main ChatClient ───────────────────────────────────────────────────────── */

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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <MessageList messages={messages} endRef={endRef} />
      </div>
      <ChatInput inputRef={inputRef} onSubmit={onSubmit} sending={sending} />
    </div>
  );
}
