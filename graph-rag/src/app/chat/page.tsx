import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ChatClient from "@/components/ChatClient";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  return (
    <div className="h-full flex flex-col">
      <ChatClient />
    </div>
  );
}
