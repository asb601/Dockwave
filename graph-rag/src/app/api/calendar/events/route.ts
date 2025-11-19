// src/app/api/calendar/events/route.ts
// NOTE: Run `npx prisma generate` so that `prisma.calendarEvent` is available.
// recurrenceRule uses iCal RRULE syntax (e.g. FREQ=DAILY;INTERVAL=1)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// GET /api/calendar/events?start=ISO&end=ISO
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const userId = session.user.id as string;

  const where: any = { userId, deleted: false };
  if (start && end) {
    where.start = { gte: new Date(start), lte: new Date(end) };
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { start: 'asc' },
    include: { attendees: true, reminders: true, series: true }
  });
  return NextResponse.json({ events });
}

// POST /api/calendar/events
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const userId = session.user.id as string;

  const { title, description, start, end, isAllDay, location, color, recurrenceRule, seriesId } = body;
  if (!title || !start) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      description,
      start: new Date(start),
      end: end ? new Date(end) : new Date(start),
      isAllDay: !!isAllDay,
      location,
      color: color || '#3b82f6',
      recurrenceRule,
      seriesId: seriesId || null,
      userId,
    }
  });
  return NextResponse.json({ event }, { status: 201 });
}

// PATCH /api/calendar/events (update)
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const userId = session.user.id as string;
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // ensure ownership
  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId, deleted: false } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const event = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...('title' in updates ? { title: updates.title } : {}),
      ...('description' in updates ? { description: updates.description } : {}),
      ...('start' in updates ? { start: new Date(updates.start) } : {}),
      ...('end' in updates && updates.end ? { end: new Date(updates.end) } : {}),
      ...('isAllDay' in updates ? { isAllDay: !!updates.isAllDay } : {}),
      ...('location' in updates ? { location: updates.location } : {}),
      ...('color' in updates ? { color: updates.color } : {}),
      ...('recurrenceRule' in updates ? { recurrenceRule: updates.recurrenceRule } : {}),
      ...('seriesId' in updates ? { seriesId: updates.seriesId || null } : {}),
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

// PUT /api/calendar/events (toggle all-day flag)
// Convenience: /api/calendar/events?id=ID&toggleAllDay=1
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const toggle = searchParams.get('toggleAllDay');
  if (!id || !toggle) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const userId = session.user.id as string;
  const existing = await prisma.calendarEvent.findFirst({ where: { id, userId, deleted: false } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const event = await prisma.calendarEvent.update({ where: { id }, data: { isAllDay: !existing.isAllDay } });
  return NextResponse.json({ event });
}
