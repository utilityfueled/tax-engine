import type { Metadata } from "next";
import { ReturnWorkspaceScreen } from "@/components/return-workspace-screen";
import { resolveDeploymentMode } from "@/lib/deployment-mode";

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tax Return ${id} — Viva La Tax` };
}

export default async function ReturnWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ create?: string; local?: string }>;
}) {
  const { id } = await params;
  const { create, local } = await searchParams;
  const deploymentMode = local === "1" ? "self-host" : resolveDeploymentMode();

  return (
    <ReturnWorkspaceScreen
      workspaceId={id}
      createIfMissing={create === "1"}
      deploymentMode={deploymentMode}
    />
  );
}
