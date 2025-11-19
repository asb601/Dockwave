import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// NOTE: Ensure `npx prisma generate` has been run so that `prisma.task` type exists.

// GET /api/calendar/tasks?date=ISO (optional filters)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const userId = session.user.id as string;

  const where: any = { userId, deleted: false };
  if (date) {
    // filter tasks whose dueDate is that calendar day
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    where.dueDate = { gte: start, lte: end };
  }

  const tasks = await prisma.task.findMany({ where, orderBy: { dueDate: 'asc' } });
  return NextResponse.json({ tasks });
}

// POST /api/calendar/tasks
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const userId = session.user.id as string;
  const { title, description, dueDate, dueTime, priority } = body;
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      dueTime,
      priority: priority ? priority.toUpperCase() : 'MEDIUM',
      userId,
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

  const existing = await prisma.task.findFirst({ where: { id, userId, deleted: false } });
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

// DELETE /api/calendar/tasks?id=taskId (soft delete)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = session.user.id as string;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.task.findFirst({ where: { id, userId, deleted: false } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.task.update({ where: { id }, data: { deleted: true } });
  return NextResponse.json({ success: true });
}

// PUT /api/calendar/tasks
// Convenience: /api/calendar/tasks?id=ID&toggle=1 to flip completion
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const toggle = searchParams.get('toggle');
  if (!id || !toggle) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const userId = session.user.id as string;
  const existing = await prisma.task.findFirst({ where: { id, userId, deleted: false } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const task = await prisma.task.update({ where: { id }, data: { completed: !existing.completed } });
  return NextResponse.json({ task });
}
