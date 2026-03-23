/**
 * POST /api/ai-actions/create-event
 *
 * Internal endpoint called by the Python AI agent to create calendar events
 * on behalf of a user.  Authenticated via SERVICE_TOKEN (not NextAuth session).
 *
 * Body: { user_email, title, description?, start, end?, is_all_day?, color?, tasks?[] }
 */
import { NextResponse } from "next/server";
import { Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TaskInput = {
  title: string;
  description?: string;
  due_date?: string;
  due_time?: string;
  priority?: string;
  completed?: boolean;
};

type Body = {
  user_email: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  is_all_day?: boolean;
  color?: string;
  tasks?: TaskInput[];
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
  const { user_email, title, start, description, end, is_all_day, color, tasks } = body;

  if (!user_email || !title || !start) {
    return NextResponse.json(
      { error: "Missing required fields: user_email, title, start" },
      { status: 400 }
    );
  }

  // Resolve user by email
  const user = await prisma.user.findUnique({ where: { email: user_email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date(start);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format. Use ISO8601: YYYY-MM-DDTHH:MM:SS" },
      { status: 400 },
    );
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      description: description || undefined,
      start: startDate,
      end: endDate,
      isAllDay: !!is_all_day,
      color: color || "#3b82f6",
      userId: user.id,
      tasks:
        tasks && Array.isArray(tasks)
          ? {
              create: tasks.map((t) => ({
                title: t.title,
                description: t.description,
                dueDate: t.due_date ? new Date(t.due_date) : undefined,
                dueTime: t.due_time,
                priority: (t.priority
                  ? t.priority.toUpperCase()
                  : "MEDIUM") as Priority,
                completed: !!t.completed,
              })),
            }
          : undefined,
    },
    include: { tasks: true },
  });

  return NextResponse.json({ ok: true, event }, { status: 201 });
}
