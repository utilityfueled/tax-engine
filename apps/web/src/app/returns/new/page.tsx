import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HostedWorkspaceEntryScreen } from "@/components/hosted-workspace-entry-screen";
import { resolveNewWorkspaceEntry } from "@/lib/new-workspace-entry";

export const metadata: Metadata = {
  title: "Start New Return — Viva La Tax"
};

export default async function NewReturnWorkspacePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const localDraftRequested = params.local === "1"
    || (Array.isArray(params.local) && params.local.includes("1"));
  const outcome = await resolveNewWorkspaceEntry({
    requestHeaders: await headers(),
    localDraftRequested
  });

  if (outcome.kind === "redirect") {
    redirect(outcome.location);
  }

  return <HostedWorkspaceEntryScreen gate={outcome.gate} />;
}
