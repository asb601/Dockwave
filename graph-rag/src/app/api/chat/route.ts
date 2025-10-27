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

    // Minimal echo response (retrieval and context removed for now)
    return NextResponse.json({ message: { role: "assistant", content: `You asked (user=${userEmail || userId}): ${lastUser}` } });
  } catch (e) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
