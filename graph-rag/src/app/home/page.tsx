import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import HomeClient from "@/components/home/HomeClient"

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/")
  }
  const user = {
    name: (session.user.name as string | null) ?? null,
    image: (session.user.image as string | null) ?? null,
  }
  return <HomeClient user={user} />
}