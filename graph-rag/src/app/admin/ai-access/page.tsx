import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AiAccessRequestsClient from "@/components/AiAccessRequestsClient";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export default async function AdminAiAccessPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");
  if (!isAdminEmail(session.user.email)) redirect("/home");

  const requests = await prisma.aiAccessRequest.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          aiAccess: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const initialRequests = requests.map((request) => ({
    id: request.id,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    user: request.user,
  }));

  return <AiAccessRequestsClient initialRequests={initialRequests} />;
}