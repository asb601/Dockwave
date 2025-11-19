// src/app/api/calendar/series/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// NOTE: Series deletion is hard delete; adjust if soft-delete required.

// GET /api/calendar/series
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id as string;
  const series = await prisma.eventSeries.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ series });
}

// POST /api/calendar/series
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const userId = session.user.id as string;
  const { rrule, exdates, notes } = body;
  if (!rrule) return NextResponse.json({ error: 'Missing rrule' }, { status: 400 });
  const series = await prisma.eventSeries.create({ data: { rrule, exdates, notes, userId } });
  return NextResponse.json({ series }, { status: 201 });
}

// PATCH /api/calendar/series
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, ...updates } = await req.json();
  const userId = session.user.id as string;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const existing = await prisma.eventSeries.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const series = await prisma.eventSeries.update({ where: { id }, data: { ...updates } });
  return NextResponse.json({ series });
}

// DELETE /api/calendar/series?id=seriesId
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const userId = session.user.id as string;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const existing = await prisma.eventSeries.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.eventSeries.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
