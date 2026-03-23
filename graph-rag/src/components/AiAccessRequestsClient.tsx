"use client";

import { useState, useTransition } from "react";
import { Check, Clock3, Mail, Shield, X } from "lucide-react";

type AccessRequestItem = {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    aiAccess: boolean;
  };
};

export default function AiAccessRequestsClient({
  initialRequests,
}: {
  initialRequests: AccessRequestItem[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [isPending, startTransition] = useTransition();

  function updateRequest(
    requestId: string,
    nextStatus: "APPROVED" | "DENIED",
    action: "approve" | "deny",
  ) {
    startTransition(async () => {
      const res = await fetch("/api/ai-access/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Failed to update request");
        return;
      }
      setRequests((current) =>
        current.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: nextStatus,
                user: {
                  ...request.user,
                  aiAccess: nextStatus === "APPROVED" ? true : request.user.aiAccess,
                },
              }
            : request,
        ),
      );
    });
  }

  const pendingRequests = requests.filter((request) => request.status === "PENDING");
  const resolvedRequests = requests.filter((request) => request.status !== "PENDING");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-secondary">
            <Shield className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AI Access Requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Approve or deny chat access requests. You always have AI access as the configured admin.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock3 className="h-4 w-4" />
          Pending Requests ({pendingRequests.length})
        </div>

        {pendingRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No pending requests.
          </div>
        ) : (
          pendingRequests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <p className="text-base font-semibold">
                    {request.user.name || request.user.email || "Unknown user"}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{request.user.email || "No email"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requested on {new Date(request.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => updateRequest(request.id, "DENIED", "deny")}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Deny
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => updateRequest(request.id, "APPROVED", "approve")}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-4">
        <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Decisions
        </div>
        {resolvedRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No approvals or denials yet.
          </div>
        ) : (
          resolvedRequests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">
                    {request.user.name || request.user.email || "Unknown user"}
                  </p>
                  <p className="text-xs text-muted-foreground">{request.user.email || "No email"}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    request.status === "APPROVED"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {request.status}
                </span>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}