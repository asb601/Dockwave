import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: rootFolderId } = await context.params; // await params per Next.js guidance
  const userId = session.user.id;

  const folder = await prisma.folder.findFirst({ where: { id: rootFolderId, userId } });
  if (!folder) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const userEmail = session.user.email || undefined;
  if (!userEmail) {
    return NextResponse.json({ error: 'User email missing; cannot update knowledge graph.' }, { status: 400 });
  }

  // Call AI cleanup first (best-effort)
  const aiBase = process.env.AI_BASE_URL || 'http://localhost:8000';
  const serviceToken = process.env.SERVICE_TOKEN || '';
  try {
    await fetch(`${aiBase}/delete/folder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-token': serviceToken },
      body: JSON.stringify({ user_id: userId, user_email: userEmail, folder_id: folder.id }),
    });
  } catch (e) {
    console.warn('AI folder delete call failed:', e);
  }

  // Recursively collect descendant folder IDs
  const toVisit: string[] = [rootFolderId];
  const allFolderIds: string[] = [];
  while (toVisit.length) {
    const current = toVisit.shift()!;
    allFolderIds.push(current);
    const children = await prisma.folder.findMany({ where: { parentId: current, userId }, select: { id: true } });
    for (const c of children) toVisit.push(c.id);
  }

  // Delete files under all collected folders, then delete the folders themselves
  await prisma.$transaction([
    prisma.file.deleteMany({ where: { userId, folderId: { in: allFolderIds } } }),
    prisma.folder.deleteMany({ where: { id: { in: allFolderIds }, userId } }),
  ]);

  return NextResponse.json({ success: true, deletedFolders: allFolderIds.length });
}
