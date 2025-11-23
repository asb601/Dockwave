// src/app/api/calendar/events/route.ts
// NOTE: Run `npx prisma generate` so that `prisma.calendarEvent` is available.
// recurrenceRule uses iCal RRULE syntax (e.g. FREQ=DAILY;INTERVAL=1)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma, Priority } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type TaskInput = {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: string;
  completed?: boolean;
};

type CreateEventBody = {
  title: string;
  description?: string;
  start: string;
  end?: string;
  isAllDay?: boolean;
  color?: string;
  tasks?: TaskInput[];
};

type UpdateEventBody = {
  id: string;
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  isAllDay?: boolean;
  color?: string;
};

// GET /api/calendar/events?start=ISO&end=ISO
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const userId = session.user.id as string;

  const where: Prisma.CalendarEventWhereInput = { userId, deleted: false };
  if (start && end) {
    where.start = { gte: new Date(start), lte: new Date(end) };
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { start: 'asc' },
    include: { tasks: true }
  });
  return NextResponse.json({ events });
}

// POST /api/calendar/events
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json()) as CreateEventBody;
  const userId = session.user.id as string;

  const { title, description, start, end, isAllDay, color, tasks } = body;
  if (!title || !start) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      description,
      start: new Date(start),
      end: end ? new Date(end) : new Date(start),
      isAllDay: !!isAllDay,
      color: color || '#3b82f6',
      userId,
      tasks: tasks && Array.isArray(tasks) ? {
        create: tasks.map((t: TaskInput) => ({
          title: t.title,
          description: t.description,
          dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
          dueTime: t.dueTime,
          priority: (t.priority ? t.priority.toUpperCase() : 'MEDIUM') as Priority,
          completed: !!t.completed,
        }))
      } : undefined
    }
  });
  return NextResponse.json({ event }, { status: 201 });
}

// PATCH /api/calendar/events (update)
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json()) as UpdateEventBody;
  const userId = session.user.id as string;
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId, deleted: false } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const event = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...('title' in updates ? { title: updates.title } : {}),
      ...('description' in updates ? { description: updates.description } : {}),
      ...('start' in updates && updates.start ? { start: new Date(updates.start) } : {}),
      ...('end' in updates && updates.end ? { end: new Date(updates.end) } : {}),
      ...('isAllDay' in updates ? { isAllDay: !!updates.isAllDay } : {}),
      ...('color' in updates ? { color: updates.color } : {}),
    }
  });
  return NextResponse.json({ event });
}

// DELETE /api/calendar/events?id=eventId (soft delete)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = session.user.id as string;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId, deleted: false } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.calendarEvent.update({ where: { id }, data: { deleted: true } });
  return NextResponse.json({ success: true });
}

