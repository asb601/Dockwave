import Link from 'next/link';

export default function ChatBotSection() {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center">
      <h2 className="text-xl font-semibold text-neutral-100 mb-2">Chat</h2>
      <p className="text-neutral-400 mb-6">Open the chatbot to ask questions about your files.</p>
      <Link href="/chat" className="inline-flex items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700 px-5 py-2 text-sm text-white hover:bg-neutral-700">
        Open Chat
      </Link>
    </div>
  );
}
