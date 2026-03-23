/**
 * POST /api/ai-actions/create-note
 *
 * Internal endpoint called by the Python AI agent to create notes
 * on behalf of a user.  Authenticated via SERVICE_TOKEN.
 *
 * Body: { user_email, title, content? }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function verifyServiceToken(req: Request): boolean {
  const token = req.headers.get("x-service-token");
  const expected = process.env.SERVICE_TOKEN;
  if (!expected || !token) return false;
  return token === expected;
}

type Body = {
  user_email: string;
  title: string;
  content?: string;
};

export async function POST(req: Request) {
  if (!verifyServiceToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const { user_email, title, content } = body;

  if (!user_email || !title) {
    return NextResponse.json(
      { error: "Missing required fields: user_email, title" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email: user_email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const note = await prisma.note.create({
    data: {
      title,
      content: content ?? "",
      userId: user.id,
    },
  });

  return NextResponse.json({ ok: true, note }, { status: 201 });
}
