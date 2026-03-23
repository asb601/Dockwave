/**
 * POST /api/ai-actions/create-task
 *
 * Internal endpoint called by the Python AI agent to create tasks on an
 * existing calendar event.  Authenticated via SERVICE_TOKEN.
 *
 * Body: { user_email, event_id, title, description?, due_date?, due_time?, priority? }
 */
import { NextResponse } from "next/server";
import { Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Body = {
  user_email: string;
  event_id: string;
  title: string;
  description?: string;
  due_date?: string;
  due_time?: string;
  priority?: string;
};

function verifyServiceToken(req: Request): boolean {
  const token = req.headers.get("x-service-token");
  const expected = process.env.SERVICE_TOKEN;
  if (!expected || !token) return false;
  return token === expected;
}

export async function POST(req: Request) {
  if (!verifyServiceToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const { user_email, event_id, title, description, due_date, due_time, priority } = body;

  if (!user_email || !event_id || !title) {
    return NextResponse.json(
      { error: "Missing required fields: user_email, event_id, title" },
      { status: 400 }
    );
  }

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { email: user_email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify event belongs to user
  const event = await prisma.calendarEvent.findFirst({
    where: { id: event_id, userId: user.id, deleted: false },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found or not owned by user" }, { status: 404 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description || undefined,
      dueDate: due_date ? new Date(due_date) : undefined,
      dueTime: due_time || undefined,
      priority: (priority ? priority.toUpperCase() : "MEDIUM") as Priority,
      eventId: event_id,
    },
  });

  return NextResponse.json({ ok: true, task }, { status: 201 });
}
