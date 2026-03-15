"use client";

import { signIn } from "next-auth/react";
import { Github } from "lucide-react";

export default function LoginCard() {
  return (
    <div className="space-y-3">
      <button
        className="btn btn-outline w-full"
        onClick={() =>
          signIn("google", { redirect: true, callbackUrl: "/home" })
        }
      >
        Sign in with Google
      </button>
      <button
        className="btn btn-primary w-full"
        onClick={() =>
          signIn("github", { redirect: true, callbackUrl: "/home" })
        }
      >
        <Github className="mr-2 h-4 w-4" /> Sign in with GitHub
      </button>
    </div>
  );
}
