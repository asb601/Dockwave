import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import FolderClient from '@/components/folders/FolderClient';

export default async function FolderPage({ params }: { params: { id: string } }) {
	const session = await getServerSession(authOptions);
	if (!session || !session.user?.id) {
		return notFound();
	}
	const userId = session.user.id;
	const user = {
		name: (session.user.name as string | null) ?? null,
		image: (session.user.image as string | null) ?? null,
	};

	const folder = await prisma.folder.findFirst({
		where: { id: params.id, userId },
		include: { files: true, parent: { select: { id: true, name: true } } },
	});

	if (!folder) return notFound();

	return (
		<FolderClient
			user={user}
			folderId={folder.id}
			folderName={folder.name}
			parent={folder.parent}
			initialFiles={folder.files as any}
		/>
	);
}
