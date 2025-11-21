import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import FolderClient from '@/components/folders/FolderClient';

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return notFound();
  }
  const userId = session.user.id;
  const user = {
    name: (session.user.name as string | null) ?? null,
    image: (session.user.image as string | null) ?? null,
  };
  const { id } = await params;

  const folder = await prisma.folder.findFirst({
    where: { id, userId },
    include: { files: true, parent: { select: { id: true, name: true } } },
  });

	if (!folder) return notFound();

  const initialFiles = folder.files.map(file => ({
    id: file.id,
    name: file.name,
    createdAt: file.createdAt.toISOString(),
    s3Key: file.s3Key,
    folderId: file.folderId,
  }));

	return (
		<FolderClient
			user={user}
			folderId={folder.id}
			folderName={folder.name}
			parent={folder.parent}
      initialFiles={initialFiles}
		/>
	);
}
