import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/notes — list all notes for the authenticated user
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id as string;

  const notes = await prisma.note.findMany({
    where: { userId, deleted: false },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ notes });
}

// POST /api/notes — create a new note
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id as string;
  const body = await req.json();
  const { title, content } = body as { title?: string; content?: string };

  if (!title)
    return NextResponse.json(
      { error: "Missing required field: title" },
      { status: 400 },
    );

  const note = await prisma.note.create({
    data: { title, content: content ?? "", userId },
  });

  return NextResponse.json({ note }, { status: 201 });
}

// PATCH /api/notes — update an existing note
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id as string;
  const body = await req.json();
  const { id, title, content } = body as {
    id?: string;
    title?: string;
    content?: string;
  };

  if (!id)
    return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.note.findFirst({
    where: { id, userId, deleted: false },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const note = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
  });

  return NextResponse.json({ note });
}

// DELETE /api/notes?id=noteId — soft delete
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id as string;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id)
    return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.note.findFirst({
    where: { id, userId, deleted: false },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.note.update({ where: { id }, data: { deleted: true } });
  return NextResponse.json({ success: true });
}
