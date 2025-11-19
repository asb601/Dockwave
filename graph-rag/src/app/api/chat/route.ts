import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id as string;
    const userEmail = (session.user as any)?.email || undefined;

    const body = await req.json();
    const messages = body?.messages || [];
    const lastUser = messages?.filter((m: any) => m.role === "user").pop()?.content || "";

    // Call FastAPI agent
    const AI_BASE_URL = process.env.AI_BASE_URL || "http://localhost:8000";
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

    const data = (await resp.json()) as any;
    const answer: string = (data?.answer as string) || "";

    // Only return the assistant's answer (no diagnostics or sources)
    return NextResponse.json({ message: { role: "assistant", content: answer } });
  } catch (e) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
