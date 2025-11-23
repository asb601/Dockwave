import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'Missing start or end date' }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  // Get all calendar events and their tasks between start and end (inclusive)
  const events = await prisma.calendarEvent.findMany({
    where: {
      start: { gte: startDate },
      end: { lte: endDate },
    },
    include: {
      tasks: true,
    },
    orderBy: { start: 'asc' },
  });

  return NextResponse.json(events);
}