import "server-only";

import { redactTextForAiAnalysis } from "@/lib/ai-document-redaction";
import type { ParsedUploadedDocument } from "@/lib/uploaded-document-detection";
import { analyzeUnsupportedDocumentWithGemini } from "@/lib/gemini-document-analysis-server";
import { parseUploadedDocumentText } from "@/lib/uploaded-document-detection";

interface ExtractedTextItem {
  str?: string;
  transform?: number[];
}

let pdfJsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  return pdfJsPromise;
}

async function extractPdfTextWithPdftotext(data: Uint8Array) {
  const [{ mkdtemp, writeFile, rm }, { tmpdir }, { join }, { execFile }, { promisify }] = await Promise.all([
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
    import("node:child_process"),
    import("node:util"),
  ]);
  const execFileAsync = promisify(execFile);
  const tempDir = await mkdtemp(join(tmpdir(), "tax-engine-pdf-"));
  const filePath = join(tempDir, "upload.pdf");

  try {
    await writeFile(filePath, data);
    const { stdout } = await execFileAsync("pdftotext", [filePath, "-"], {
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });

    return typeof stdout === "string" && stdout.trim().length > 0 ? stdout : null;
  } catch {
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function groupPageText(items: ExtractedTextItem[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();

  for (const item of items) {
    const text = typeof item.str === "string" ? item.str.trim() : "";

    if (!text) {
      continue;
    }

    const [x = 0, y = 0] = Array.isArray(item.transform) ? [item.transform[4] ?? 0, item.transform[5] ?? 0] : [0, 0];
    const rowKey = Math.round(y);
    const row = rows.get(rowKey) ?? [];

    row.push({ x, text });
    rows.set(rowKey, row);
  }

  return [...rows.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((entry) => entry.text).join(" "))
    .join("\n");
}

export async function extractPdfTextFromData(data: Uint8Array) {
  const shellExtractedText = await extractPdfTextWithPdftotext(data);

  if (shellExtractedText) {
    return shellExtractedText;
  }

  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    pageTexts.push(groupPageText(textContent.items as ExtractedTextItem[]));
  }

  return pageTexts.join("\n\n");
}

export async function detectUploadedDocumentFromData(
  fileName: string,
  mimeType: string | null | undefined,
  data: ArrayBuffer | Uint8Array,
): Promise<ParsedUploadedDocument | null> {
  const normalizedData = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const looksLikePdfMime = typeof mimeType === "string" && /pdf/i.test(mimeType);
  const looksLikeImageMime = typeof mimeType === "string" && /^image\//i.test(mimeType);

  if (!/\.pdf$/i.test(fileName) && !looksLikePdfMime && !looksLikeImageMime) {
    return null;
  }

  try {
    if (/\.pdf$/i.test(fileName) || looksLikePdfMime) {
      const extractedText = await extractPdfTextFromData(normalizedData);
      const parsed = parseUploadedDocumentText(extractedText, fileName);

      if (parsed) {
        return parsed;
      }

      const { redactedText } = redactTextForAiAnalysis(extractedText);

      return await analyzeUnsupportedDocumentWithGemini(
        fileName,
        redactedText,
      );
    }
  } catch {
    // Fall through to optional AI classification below.
  }

  if (looksLikeImageMime) {
    return {
      kind: "unknown",
      coverage: "unsupported",
      label: "Unclassified image upload",
      notes: "Image uploads are stored locally, but AI OCR is disabled until we have a fully local redaction pass before model analysis.",
      seededFactIds: [],
      detectedFacts: [],
    };
  }

  return null;
}
