// app/auth/login/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginCard from "@/components/auth/LoginCard";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/home");

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="bg-card text-card-foreground border border-border rounded-2xl p-8 w-full max-w-md shadow-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Login to IntelliDoc
        </h1>
        <LoginCard />
      </div>
    </main>
  );
}
