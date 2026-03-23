/**
 * PATCH /api/ai-actions/edit-note
 *
 * Internal endpoint called by the Python AI agent to edit an existing note.
 * Authenticated via SERVICE_TOKEN.
 *
 * Body: { user_email, note_id, title?, content? }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function verifyServiceToken(req: Request): boolean {
  const token = req.headers.get("x-service-token");
  const expected = process.env.SERVICE_TOKEN;
  if (!expected || !token) return false;
  return token === expected;
}

type Body = {
  user_email: string;
  note_id: string;
  title?: string;
  content?: string;
};

export async function PATCH(req: Request) {
  if (!verifyServiceToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const { user_email, note_id, title, content } = body;

  if (!user_email || !note_id) {
    return NextResponse.json(
      { error: "Missing required fields: user_email, note_id" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email: user_email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify note exists and belongs to user
  const existing = await prisma.note.findFirst({
    where: { id: note_id, userId: user.id, deleted: false },
  });
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const note = await prisma.note.update({
    where: { id: note_id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
  });

  return NextResponse.json({ ok: true, note });
}

/**
 * GET /api/ai-actions/edit-note?user_email=...
 *
 * Fetch all notes for a user (for the agent to find which note to edit).
 */
export async function GET(req: Request) {
  if (!verifyServiceToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get("user_email");

  if (!userEmail) {
    return NextResponse.json({ error: "Missing user_email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const notes = await prisma.note.findMany({
    where: { userId: user.id, deleted: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  return NextResponse.json({ notes });
}
