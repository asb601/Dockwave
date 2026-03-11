import Link from 'next/link';

export default function ChatBotSection() {
  return (
    <div className="bg-[color:var(--card)] border border-[color:var(--border)] rounded-2xl p-6 sm:p-8 text-center">
      <h2 className="text-xl font-semibold text-[color:var(--foreground)] mb-2">Chat</h2>
      <p className="text-[color:var(--muted-foreground)] mb-6">Open the chatbot to ask questions about your files.</p>
      <Link
        href="/chat"
        className="inline-flex items-center justify-center rounded-lg bg-[color:var(--primary)] text-[color:var(--primary-foreground)] border border-[color:var(--border)] px-5 py-2.5 text-sm hover:opacity-90 transition-opacity min-h-[44px]"
      >
        Open Chat
      </Link>
    </div>
  );
}
