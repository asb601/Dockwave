import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAccessRequestEmail } from "@/lib/mail";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Already has access
  if (user.aiAccess) {
    return NextResponse.json({ status: "already_approved" });
  }

  // Check for existing pending request
  const existing = await prisma.aiAccessRequest.findFirst({
    where: { userId, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ status: "already_pending" });
  }

  // Create request with unique approval token
  const request = await prisma.aiAccessRequest.create({
    data: { userId },
  });

  // Build approval URL
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const approveUrl = `${baseUrl}/api/ai-access/approve?token=${request.token}`;

  // Send email to admin
  try {
    await sendAccessRequestEmail({
      userName: user.name || user.email || "Unknown",
      userEmail: user.email || "no-email",
      approveUrl,
    });
  } catch (err) {
    console.error("Failed to send access request email:", err);
    // Don't fail the request — the DB record is created, admin can approve via DB if email fails
  }

  return NextResponse.json({ status: "pending", requestId: request.id });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { aiAccess: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.aiAccess) {
    return NextResponse.json({ hasAccess: true, status: "approved" });
  }

  const pending = await prisma.aiAccessRequest.findFirst({
    where: { userId: session.user.id, status: "PENDING" },
  });

  return NextResponse.json({
    hasAccess: false,
    status: pending ? "pending" : "none",
  });
}
