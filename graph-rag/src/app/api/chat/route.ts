import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id as string;
    const userEmail = session.user.email ?? undefined;

    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages = body?.messages ?? [];
    const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? "";

    // Call FastAPI agent
    const AI_BASE_URL = process.env.AI_BASE_URL ;
    console.log("AI_BASE_URL:", AI_BASE_URL,"goal:", lastUser,"userEmail:",userEmail,"max_iters:",4,"min_hits:",6);
    const resp = await fetch(`${AI_BASE_URL}/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Optional service token if FastAPI enables auth
        ...(process.env.AI_SERVICE_TOKEN ? { "x-service-token": process.env.AI_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify({ goal: lastUser, user_email: userEmail || userId, max_iters: 4, min_hits: 6 }),
      next: { revalidate: 0 },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: `Agent error: ${resp.status} ${text}` }, { status: 502 });
    }

    const data = (await resp.json()) as { answer?: string };
    const answer = data?.answer ?? "";

    // Only return the assistant's answer (no diagnostics or sources)
    return NextResponse.json({ message: { role: "assistant", content: answer } });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
