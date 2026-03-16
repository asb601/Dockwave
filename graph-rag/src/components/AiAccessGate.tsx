"use client";

import { useState } from "react";
import { Lock, CheckCircle, Clock, X } from "lucide-react";

type AccessStatus = "none" | "pending" | "requesting" | "sent" | "error";

export default function AiAccessGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AccessStatus>("none");
  const [open, setOpen] = useState(true);

  async function requestAccess() {
    setStatus("requesting");
    try {
      const res = await fetch("/api/ai-access/request", { method: "POST" });
      const data = await res.json();
      if (data.status === "already_approved") {
        window.location.reload();
        return;
      }
      if (data.status === "already_pending" || data.status === "pending") {
        setStatus("pending");
      } else {
        setStatus("sent");
      }
    } catch {
      setStatus("error");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {status === "none" && (
          <>
            <div className="mb-4 mx-auto h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 grid place-items-center">
              <Lock className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold text-center mb-2">AI Chat Access Required</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              The AI chat feature requires approval. Request access and the admin will be notified.
            </p>
            <button
              onClick={requestAccess}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
            >
              Request Access
            </button>
          </>
        )}

        {status === "requesting" && (
          <div className="flex flex-col items-center py-4">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Sending request...</p>
          </div>
        )}

        {(status === "sent" || status === "pending") && (
          <>
            <div className="mb-4 mx-auto h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 grid place-items-center">
              <Clock className="w-7 h-7 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-center mb-2">Request Sent</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Your access request has been sent to the admin. You&apos;ll be able to use AI chat once approved.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="w-full rounded-xl bg-secondary text-secondary-foreground py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Got it
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mb-4 mx-auto h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 grid place-items-center">
              <X className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-center mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Could not send the access request. Please try again.
            </p>
            <button
              onClick={() => setStatus("none")}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
