import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyServiceToken } from '@/lib/verifyServiceToken';

export async function GET(req: Request) {
  // Accept EITHER service token (AI agent) OR NextAuth session (browser)
  const hasServiceToken = verifyServiceToken(req);
  const session = !hasServiceToken ? await getServerSession(authOptions) : null;

  if (!hasServiceToken && !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const userEmail = searchParams.get('user_email');

  if (!start || !end) {
    return NextResponse.json({ error: 'Missing start or end date' }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  // ALWAYS require a user scope — never return unscoped results
  let userId: string | undefined;

  if (hasServiceToken && userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    userId = user.id;
  } else if (session?.user?.id) {
    userId = session.user.id as string;
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'user_email is required for service token requests' },
      { status: 400 }
    );
  }

  const where: Record<string, unknown> = {
    userId,
    deleted: false,
    start: { gte: startDate },
    OR: [
      { end: { lte: endDate } },
      { end: null },
    ],
  };

  const events = await prisma.calendarEvent.findMany({
    where,
    include: {
      tasks: { where: { deleted: false } },
    },
    orderBy: { start: 'asc' },
  });

  return NextResponse.json(events);
}