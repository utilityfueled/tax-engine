import { sharedHandlers } from "../../shared-handlers";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  return sharedHandlers.uploadDocument(request, {
    workspaceId: id
  });
}
