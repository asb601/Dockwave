import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

type ChatSource = {
  file: string;
  page: number | null;
  preview: string;
};

function titleFromMessage(message: string) {
  const text = message.trim();
  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

function normalizeSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ChatSource =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ChatSource).file === "string" &&
        typeof (item as ChatSource).preview === "string"
    )
    .map((item) => ({
      file: item.file,
      page: typeof item.page === "number" ? item.page : null,
      preview: item.preview,
    }));
}

function serializeSession(session: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messages: Array<{
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: Date;
    sources: unknown;
  }>;
}) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    lastMessageAt: session.lastMessageAt.toISOString(),
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role === "USER" ? "user" : "assistant",
      content: message.content,
      timestamp: message.createdAt.toISOString(),
      sources: normalizeSources(message.sources),
    })),
  };
}

async function requireUser(requireAiAccess: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userId = session.user.id as string;
  const userEmail = session.user.email ?? undefined;

  if (requireAiAccess) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiAccess: true },
    });
    if (!user?.aiAccess && !isAdminEmail(session.user.email)) {
      return {
        error: NextResponse.json({ error: "AI access not granted" }, { status: 403 }),
      };
    }
  }

  return { userId, userEmail };
}

export async function GET() {
  const auth = await requireUser(false);
  if ("error" in auth) return auth.error;

  const sessions = await prisma.chatSession.findMany({
    where: { userId: auth.userId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ sessions: sessions.map(serializeSession) });
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser(true);
    if ("error" in auth) return auth.error;

    const body = (await req.json()) as { sessionId?: string | null; message?: string };
    const content = body.message?.trim() ?? "";

    if (!content) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    let session = body.sessionId
      ? await prisma.chatSession.findFirst({
          where: { id: body.sessionId, userId: auth.userId },
        })
      : null;

    if (body.sessionId && !session) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          userId: auth.userId,
          title: titleFromMessage(content),
        },
      });
    }

    const userMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content,
      },
    });

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { lastMessageAt: userMessage.createdAt },
    });

    const aiBaseUrl = process.env.AI_BASE_URL;
    if (!aiBaseUrl) {
      return NextResponse.json({ error: "AI_BASE_URL is not configured" }, { status: 500 });
    }

    const resp = await fetch(`${aiBaseUrl}/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SERVICE_TOKEN ? { "x-service-token": process.env.SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify({
        goal: content,
        user_email: auth.userEmail || auth.userId,
        max_iters: 4,
        min_hits: 6,
      }),
      next: { revalidate: 0 },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: `Agent error: ${resp.status} ${text}` }, { status: 502 });
    }

    const data = (await resp.json()) as {
      answer?: string;
      sources?: ChatSource[];
      action_results?: Record<string, unknown>;
    };

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: data.answer ?? "",
        sources: (data.sources ?? []) as unknown as never,
      },
    });

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { lastMessageAt: assistantMessage.createdAt },
    });

    return NextResponse.json({
      sessionId: session.id,
      message: {
        id: assistantMessage.id,
        role: "assistant",
        content: assistantMessage.content,
        timestamp: assistantMessage.createdAt.toISOString(),
      },
      sources: data.sources ?? [],
      ...(data.action_results ? { action_results: data.action_results } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
