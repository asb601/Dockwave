import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const file = await prisma.file.findFirst({
    where: { id, userId },
    select: { id: true, name: true, s3Key: true },
  });
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const bucketName = 'codeen601';

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: file.s3Key,
      ResponseContentDisposition: 'inline',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error('View presign error:', err);
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 });
  }
}
