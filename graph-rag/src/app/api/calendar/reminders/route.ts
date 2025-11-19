// src/app/api/calendar/reminders/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/calendar/reminders?eventId=xxx
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  // ownership check
  const userId = session.user.id as string;
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId, deleted: false } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const reminders = await prisma.eventReminder.findMany({ where: { eventId }, orderBy: { minutesBefore: 'asc' } });
  return NextResponse.json({ reminders });
}

// POST /api/calendar/reminders { eventId, minutesBefore, method }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { eventId, minutesBefore, method } = await req.json();
  if (!eventId || minutesBefore == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const userId = session.user.id as string;
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId, deleted: false } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const reminder = await prisma.eventReminder.create({ data: { eventId, minutesBefore: Number(minutesBefore), method } });
  return NextResponse.json({ reminder }, { status: 201 });
}

// DELETE /api/calendar/reminders?id=reminderId
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const reminder = await prisma.eventReminder.findFirst({ where: { id }, include: { event: true } });
  if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (reminder.event.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.eventReminder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
