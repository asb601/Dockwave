import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const request = await prisma.aiAccessRequest.findUnique({
    where: { token },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!request) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
  }

  if (request.status === "APPROVED") {
    // Already approved — redirect to a success page
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/ai-access/approved?already=true`);
  }

  // Approve: update request status + grant user access
  await prisma.$transaction([
    prisma.aiAccessRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED" },
    }),
    prisma.user.update({
      where: { id: request.userId },
      data: { aiAccess: true },
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return NextResponse.redirect(
    `${baseUrl}/ai-access/approved?user=${encodeURIComponent(request.user.name || request.user.email || "User")}`
  );
}
