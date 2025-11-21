import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const runtime = 'nodejs';

const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME;

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  } : undefined,
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

  const bucketName = AWS_S3_BUCKET;
  if (!AWS_REGION || !bucketName) {
    return NextResponse.json({ error: 'Missing AWS configuration (AWS_REGION/AWS_S3_BUCKET)' }, { status: 500 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: file.s3Key,
      ResponseContentDisposition: 'inline',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 }); // 5 minutes
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Presign error:', err);
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 });
  }
}
