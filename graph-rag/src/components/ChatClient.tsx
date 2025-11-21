"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
      const assistant: Message = { role: "assistant", content: data?.message?.content ?? "(no response)" };
      setMessages((m) => [...m, assistant]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = inputRef.current?.value || "";
    if (!v.trim()) return;
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    sendMessage(v);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto px-4 py-6 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          {messages.length === 0 ? (
            <div className="h-64 grid place-items-center text-neutral-500 text-sm">Ask anything…</div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, idx) => (
                <div key={idx}>
                  <div
                    className={`w-fit max-w-[72ch] lg:max-w-[80ch] rounded-2xl px-4 py-2.5 text-sm lg:text-base leading-relaxed ${
                      m.role === "user"
                        ? "ml-auto bg-neutral-800 text-white"
                        : "bg-neutral-900 border border-neutral-800 text-neutral-200"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="border-t border-neutral-900 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto px-4 py-4 flex gap-2 max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <input
            ref={inputRef}
            type="text"
            placeholder="Send a message"
            className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm lg:text-base text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-3 rounded-xl border border-neutral-800 bg-neutral-800 text-white text-sm lg:text-base disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
