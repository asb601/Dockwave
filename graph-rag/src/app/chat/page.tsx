import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ChatClient from "@/components/ChatClient";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden pt-14 md:pt-0">
      <ChatClient />
    </div>
  );
}
