import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

/**
 * POST /api/chat/stream
 *
 * Proxies the AI backend's SSE /agent/stream endpoint to the browser.
 * Creates/updates DB records for the session and messages, then pipes
 * the SSE stream directly so the frontend gets progressive tokens.
 *
 * Body: { sessionId?: string; message: string }
 * Returns: text/event-stream
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id as string;
  const userEmail = session.user.email ?? undefined;

  // Rate limit: 20 messages per minute per user
  const rl = rateLimit(`chat:${userId}`, 20, 60_000);
  if (rl.limited) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    );
  }

  // Check AI access
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiAccess: true },
  });
  if (!user?.aiAccess && !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "AI access not granted" }, { status: 403 });
  }

  const body = (await req.json()) as { sessionId?: string | null; message?: string };
  const content = body.message?.trim() ?? "";

  if (!content) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // Find or create chat session
  let chatSession = body.sessionId
    ? await prisma.chatSession.findFirst({
        where: { id: body.sessionId, userId },
      })
    : null;

  if (body.sessionId && !chatSession) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (!chatSession) {
    const title = content.length > 50 ? `${content.slice(0, 50)}…` : content;
    chatSession = await prisma.chatSession.create({
      data: { userId, title },
    });
  }

  // Save user message
  const userMessage = await prisma.chatMessage.create({
    data: { sessionId: chatSession.id, role: "USER", content },
  });
  await prisma.chatSession.update({
    where: { id: chatSession.id },
    data: { lastMessageAt: userMessage.createdAt },
  });

  const aiBaseUrl = process.env.AI_BASE_URL;
  if (!aiBaseUrl) {
    return NextResponse.json({ error: "AI_BASE_URL is not configured" }, { status: 500 });
  }

  // Call the AI streamed endpoint
  const aiResp = await fetch(`${aiBaseUrl}/agent/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SERVICE_TOKEN
        ? { "x-service-token": process.env.SERVICE_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      goal: content,
      user_email: userEmail || userId,
      session_id: chatSession.id,
      max_iters: 4,
      min_hits: 6,
    }),
  });

  if (!aiResp.ok || !aiResp.body) {
    const text = await aiResp.text();
    return NextResponse.json(
      { error: `Agent error: ${aiResp.status} ${text}` },
      { status: 502 }
    );
  }

  const sessionId = chatSession.id;

  // Create a TransformStream to intercept the SSE for DB persistence
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();
  let fullAnswer = "";
  let sources: unknown[] = [];

  // Pipe the SSE in the background, collecting the answer
  (async () => {
    const reader = aiResp.body!.getReader();
    let sseBuffer = ""; // Buffer for incomplete SSE lines across TCP chunks
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Forward raw bytes to client
        await writer.write(value);

        // Parse SSE events to collect data
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? ""; // keep incomplete last line
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) fullAnswer += data.token;
              if (data.sources) sources = data.sources;
            } catch {
              // non-JSON data line, skip
            }
          }
        }
      }
    } finally {
      // Persist assistant message
      try {
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId,
            role: "ASSISTANT",
            content: fullAnswer,
            sources: sources as never,
          },
        });
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: { lastMessageAt: assistantMessage.createdAt },
        });
      } catch (e) {
        console.error("Failed to persist streamed assistant message:", e);
      }
      await writer.close();
    }
  })();

  // Inject sessionId into the stream header so the client knows it
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-Id": sessionId,
    },
  });
}
