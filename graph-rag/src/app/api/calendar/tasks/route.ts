import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/calendar/tasks?eventId=xxx
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get('eventId');
  const userId = session.user.id as string;

  if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });

  // Only return tasks for this event and user
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId, deleted: false } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const tasks = await prisma.task.findMany({ where: { eventId, deleted: false }, orderBy: { dueDate: 'asc' } });
  return NextResponse.json({ tasks });
}

// POST /api/calendar/tasks
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const userId = session.user.id as string;
  const { eventId, title, description, dueDate, dueTime, priority, completed } = body;
  if (!eventId || !title) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  // Ensure event exists and belongs to user
  const event = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId, deleted: false } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const task = await prisma.task.create({
    data: {
      eventId,
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      dueTime,
      priority: priority ? priority.toUpperCase() : 'MEDIUM',
      completed: !!completed,
    }
  });
  return NextResponse.json({ task }, { status: 201 });
}

// PATCH /api/calendar/tasks
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const userId = session.user.id as string;
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Ensure task exists and belongs to user
  const existing = await prisma.task.findFirst({ where: { id, deleted: false, event: { userId } } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...('title' in updates ? { title: updates.title } : {}),
      ...('description' in updates ? { description: updates.description } : {}),
      ...('dueDate' in updates && updates.dueDate ? { dueDate: new Date(updates.dueDate) } : {}),
      ...('dueTime' in updates ? { dueTime: updates.dueTime } : {}),
      ...('priority' in updates ? { priority: updates.priority.toUpperCase() } : {}),
      ...('completed' in updates ? { completed: !!updates.completed } : {}),
    }
  });
  return NextResponse.json({ task });
}

// DELETE /api/calendar/tasks?id=taskId
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = session.user.id as string;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Ensure task exists and belongs to user
  const existing = await prisma.task.findFirst({ where: { id, deleted: false, event: { userId } } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.task.update({ where: { id }, data: { deleted: true } });
  return NextResponse.json({ success: true });
}
