import { NextResponse } from "next/server";
import { detectUploadedDocumentFromData } from "@/lib/uploaded-document-detection-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const detections = await Promise.all(
    files.map(async (file) =>
      detectUploadedDocumentFromData(file.name, file.type, await file.arrayBuffer())
    )
  );

  return NextResponse.json({ detections });
}
