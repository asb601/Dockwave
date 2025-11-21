"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

export default function LoginCard() {
  return (
    <div className="space-y-3">
      <Button className="w-full text-white" variant="outline" onClick={() => signIn("google", { redirect: true, callbackUrl: "/home" })}>
        Sign in with Google
      </Button>
      <Button className="w-full" onClick={() => signIn("github", { redirect: true, callbackUrl: "/home" })}>
        <Github className="mr-2 h-4 w-4" /> Sign in with GitHub
      </Button>
    </div>
  );
}
