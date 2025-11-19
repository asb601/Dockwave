// src/app/api/calendar/attendees/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET /api/calendar/attendees?eventId=xxx
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  const userId = session.user.id as string;
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId, deleted: false } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const attendees = await prisma.eventAttendee.findMany({ where: { eventId } });
  return NextResponse.json({ attendees });
}

// POST /api/calendar/attendees { eventId, email, name }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { eventId, userId: attendeeUserId, email, name } = await req.json();
  if (!eventId || (!attendeeUserId && !email)) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const ownerId = session.user.id as string;
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId: ownerId, deleted: false } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const attendee = await prisma.eventAttendee.create({ data: { eventId, userId: attendeeUserId, email, name } });
  return NextResponse.json({ attendee }, { status: 201 });
}

// PATCH /api/calendar/attendees { id, status }
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, status } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const attendee = await prisma.eventAttendee.update({ where: { id }, data: { status } });
  return NextResponse.json({ attendee });
}

// DELETE /api/calendar/attendees?id=attendeeId
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const attendee = await prisma.eventAttendee.findFirst({ where: { id }, include: { event: true } });
  if (!attendee) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attendee.event.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.eventAttendee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
