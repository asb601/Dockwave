import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import NotesClient from "@/components/notes/NotesClient";

export default async function NotesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden pt-14 md:pt-0">
      <NotesClient />
    </div>
  );
}
