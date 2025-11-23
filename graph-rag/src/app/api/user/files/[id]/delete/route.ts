import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

type AiCleanupResponse = {
  ok?: boolean;
  [key: string]: unknown;
};

export const runtime = 'nodejs';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const userEmail = session.user.email || undefined;
  if (!userEmail) {
    return NextResponse.json({ error: 'User email missing; cannot update knowledge graph.' }, { status: 400 });
  }

  const file = await prisma.file.findFirst({ where: { id, userId }, select: { id: true, s3Key: true, name: true } });
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Delete DB record first so UI reflects change immediately
  await prisma.file.delete({ where: { id } });

  const bucketName = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME;

  // Delete from S3 (best-effort)
  let s3Deleted = false;
  if (bucketName) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: file.s3Key }));
      s3Deleted = true;
    } catch (e) {
      console.warn('S3 delete failed:', e);
    }
  }

  // AI cleanup (vectors + graph + knowledge json)
  const aiBase = process.env.AI_BASE_URL  ;
  const serviceToken = process.env.SERVICE_TOKEN || '';
  let aiCleanup: AiCleanupResponse = { ok: false };
  try {
    const resp = await fetch(`${aiBase}/delete/file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-token': serviceToken },
      body: JSON.stringify({ user_id: userId, user_email: userEmail, file_id: file.id, s3_bucket: bucketName, s3_key: file.s3Key }),
    });
    aiCleanup = await resp.json().catch(() => ({}));
  } catch (e) {
    console.warn('AI delete call failed:', e);
  }

  return NextResponse.json({ success: true, s3Deleted, aiCleanup });
}
