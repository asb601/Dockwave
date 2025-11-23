import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

const required = (name: string, val?: string) => {
  if (!val) throw new Error(`Missing env ${name}`);
  return val;
};

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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const userEmail = session.user.email || undefined;
  if (!userEmail) {
    return NextResponse.json({ error: 'User email missing; cannot build knowledge graph.' }, { status: 400 });
  }

  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) {
    return NextResponse.json({ error: 'User not found for this session. Please sign out and sign in again.' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const folderId = (formData.get('folderId') as string) || undefined;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  let folder: null | { id: string; name: string } = null;
  if (folderId) {
    folder = await prisma.folder.findFirst({
      where: { id: folderId, userId },
      select: { id: true, name: true },
    });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }
  }

  try {
    // Validate required envs before attempting S3
    required('AWS_REGION', AWS_REGION);
    const bucketName = required('AWS_S3_BUCKET', AWS_S3_BUCKET);

    // S3 layout: GRAPH-RAG/<user-email-or-id>/<filename>
    const projectPrefix = (process.env.S3_PROJECT_PREFIX || 'GRAPH-RAG').replace(/\/+$/,'');
    const safeUserFolder = (userEmail || `user-${userId}`).replace(/[^a-zA-Z0-9._@-]/g, '_');
    const s3Key = `${projectPrefix}/${safeUserFolder}/${file.name}`;

    // Upload to S3
    const arrayBuffer = await file.arrayBuffer();
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type || 'application/octet-stream',
    }));

    // Create DB record
    const dbFile = await prisma.file.create({
      data: {
        name: file.name,
        s3Key,
        userId,
        folderId: folder?.id,
      },
    });

    // Trigger ingestion in the Python FastAPI service (fire-and-forget)
    const aiBase = process.env.AI_BASE_URL 
    const serviceToken = process.env.SERVICE_TOKEN || '';

    // Do not await; log outcome asynchronously
    void fetch(`${aiBase}/ingest/file`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-token': serviceToken,
      },
      body: JSON.stringify({
        user_id: userId,
        user_email: userEmail,
        file_id: dbFile.id,
        s3_bucket: bucketName,
        s3_key: s3Key,
        file_name: dbFile.name,
        folder_id: folder?.id,
        folder_name: folder?.name,
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const err = await resp.text();
          console.warn('Ingest failed:', err);
          return;
        }
        const data = await resp.json().catch(() => ({}));
        console.log('Ingest complete:', data);
      })
      .catch((e) => {
        console.error('Ingest call error:', e);
      });

    return NextResponse.json({ file: dbFile, ingest: { queued: true } });
  } catch (error) {
    console.error('Upload route error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
