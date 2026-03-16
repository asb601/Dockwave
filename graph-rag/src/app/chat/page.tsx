import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ChatClient from "@/components/ChatClient";
import AiAccessGate from "@/components/AiAccessGate";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { aiAccess: true },
  });

  if (!user?.aiAccess) {
    return (
      <div className="absolute inset-0 flex flex-col overflow-hidden pt-14 md:pt-0">
        <AiAccessGate>
          <></>
        </AiAccessGate>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden pt-14 md:pt-0">
      <ChatClient />
    </div>
  );
}
