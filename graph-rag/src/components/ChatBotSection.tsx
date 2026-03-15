import Link from "next/link";

export default function ChatBotSection() {
  return (
    <div className="card card-padded text-center">
      <h2 className="text-xl font-semibold mb-2">Chat</h2>
      <p className="text-muted-foreground mb-6">
        Open the chatbot to ask questions about your files.
      </p>
      <Link href="/chat" className="btn btn-primary">
        Open Chat
      </Link>
    </div>
  );
}
