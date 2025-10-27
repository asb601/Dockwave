import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { name?: string; parentId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const parentId = body.parentId || null;

  if (!name) {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
  }

  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, userId } });
    if (!parent) {
      return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 });
    }
  }

  try {
    const folder = await prisma.folder.create({
      data: { name, userId, parentId },
    });
    return NextResponse.json({ folder }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A folder with this name already exists here' }, { status: 409 });
    }
    console.error('Create folder error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
