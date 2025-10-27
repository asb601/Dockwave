import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';


export async function GET(req: Request) {
  return NextResponse.json({ error: 'This route has been removed.' }, { status: 410 });
}