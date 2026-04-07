import { sharedHandlers } from "../shared-handlers";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  return sharedHandlers.get(request, {
    workspaceId: id
  });
}

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  return sharedHandlers.delete(request, {
    workspaceId: id
  });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  return sharedHandlers.save(request, {
    workspaceId: id
  });
}
