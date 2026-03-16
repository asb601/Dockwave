import { CheckCircle } from "lucide-react";

export default async function ApprovedPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; already?: string }>;
}) {
  const params = await searchParams;
  const userName = params.user || "the user";
  const alreadyApproved = params.already === "true";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mb-4 mx-auto h-16 w-16 rounded-2xl bg-green-500/10 border border-green-500/20 grid place-items-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-xl font-semibold mb-2">
          {alreadyApproved ? "Already Approved" : "Access Granted"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {alreadyApproved
            ? `${userName} already has AI chat access.`
            : `${userName} now has access to the AI chat feature.`}
        </p>
      </div>
    </div>
  );
}
