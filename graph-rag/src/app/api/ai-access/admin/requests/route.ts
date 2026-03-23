import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { requestId?: string; action?: string };
  const requestId = body.requestId?.trim();
  const action = body.action?.trim();

  if (!requestId || !action || !["approve", "deny"].includes(action)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const request = await prisma.aiAccessRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const nextStatus = action === "approve" ? "APPROVED" : "DENIED";
  await prisma.$transaction([
    prisma.aiAccessRequest.update({
      where: { id: requestId },
      data: { status: nextStatus },
    }),
    ...(action === "approve"
      ? [
          prisma.user.update({
            where: { id: request.userId },
            data: { aiAccess: true },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, status: nextStatus });
}