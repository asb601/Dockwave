import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginCard from "@/components/auth/LoginCard";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/home");

  return (
    <main className="h-full flex items-center justify-center px-4">
      <div className="card card-padded w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Login to Papermind
        </h1>
        <LoginCard />
      </div>
    </main>
  );
}
