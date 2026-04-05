import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ai-access/approve?token=xxx
 *
 * Requires admin session authentication AND a valid request token.
 * This prevents unauthorized approval if the token URL leaks.
 */
export async function GET(req: Request) {
  // --- Admin auth check ---
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Admin authentication required" },
      { status: 403 }
    );
  }

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
