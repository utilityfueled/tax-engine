import type { ParsedUploadedDocument } from "./uploaded-document-detection";

type Rectangle = readonly [number, number, number, number];

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}

interface PdfAnnotation {
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  rect?: number[];
  rotation?: number;
  hidden?: boolean;
  annotationFlags?: number;
  hasAppearance?: boolean;
  fieldValue?: unknown;
  textContent?: unknown;
  checkBox?: boolean;
  exportValue?: unknown;
  defaultAppearanceData?: { fontName?: string; fontSize?: number };
}

const prefix = "topmostSubform[0].CopyB[0].";
const correctionRect = [244.8, 757, 254.8, 767] as const;
const amountRect = [305.2, 660.002, 495.8, 672.001] as const;
const box2Rect = [484.399, 554.002, 492.399, 562.002] as const;
const yearRect = [402, 713, 462, 720] as const;

// Text positions in points from the IRS 2026 Form 1098-E, Copy B (page 3).
const printedLabels = [
  ["1098-E", 424.747, 687.86],
  ["Student", 531.313, 731.73],
  ["Loan Interest", 500.221, 717.33],
  ["Statement", 516.889, 702.93],
  ["Copy B", 541.36, 674.861],
  ["For Borrower", 518.833, 662.576],
  ["CORRECTED (if checked)", 259.2, 758.86],
  ["Student loan interest received by lender", 305.038, 676.002],
  ["If checked, box 1 does", 305.038, 568.502],
  ["not", 378.426, 568.502],
  ["include loan origination", 391.264, 568.502],
  ["fees and/or capitalized interest for loans made before", 305.199, 561.502],
  ["September 1, 2004", 305.199, 554.502],
  ["1098-E", 68.684, 542.86],
] as const;

function hasPrintedLabel(items: readonly PdfTextItem[], label: string, x: number, y: number): boolean {
  return items.some(({ str, transform }) => str === label && transform?.length === 6
    && Math.abs(transform[4] - x) <= 0.01 && Math.abs(transform[5] - y) <= 0.01);
}

function textInside(items: readonly PdfTextItem[], [left, bottom, right, top]: Rectangle) {
  return items.filter(({ str, transform, width }) => {
    if (!str?.trim() || transform?.length !== 6) return false;
    const [x, y] = transform.slice(4);
    return x < right && x + (width ?? 0) >= left && y >= bottom && y < top;
  });
}

function hasConfirmedYear(items: readonly PdfTextItem[]): boolean {
  const year = textInside(items, yearRect);
  if (year.length !== 2 || !hasPrintedLabel(year, "20", 403.4, 715.294)
      || !hasPrintedLabel(year, "26", 431.208, 715.294)) return false;

  const pageText = items.flatMap(({ str, transform }) => {
    if (!str?.trim() || transform?.length !== 6) return [];
    const x = transform[4];
    const y = transform[5];
    return Number.isFinite(x) && Number.isFinite(y) ? [{ text: str.trim(), x, y }] : [];
  }).sort((a, b) => Math.round(b.y) - Math.round(a.y) || a.x - b.x)
    .map(({ text }) => text).join(" ");
  const formTitles = pageText.match(/\b1098\s*[-‐‑–]\s*E\b/gi);
  const copyTitles = pageText.match(/\bCopy\s+B\b/gi);
  if (formTitles?.length !== 2 || copyTitles?.length !== 1) return false;

  const explicitYears = pageText.matchAll(/\b(?:tax|calendar)\s+year\s*[:-]?\s*(20\s*\d{2})\b/gi);
  return [...explicitYears].every(([, value]) => value.replace(/\s/g, "") === "2026");
}

function findVisibleWidget(annotations: readonly PdfAnnotation[], suffix: string, fieldType: string, expected: Rectangle) {
  const fieldName = prefix + suffix;
  const [left, bottom, right, top] = expected;
  const candidates = annotations.filter(({ fieldName: name, rect }) => name === fieldName || (
    rect?.length === 4 && rect[0] < right && rect[2] > left && rect[1] < top && rect[3] > bottom
  ));
  if (candidates.length !== 1) return undefined;
  const [widget] = candidates;
  const { rect } = widget;
  const hiddenFlags = 1 | 2 | 32; // Invisible, Hidden and NoView.
  if (widget.fieldName !== fieldName || widget.subtype !== "Widget" || widget.fieldType !== fieldType
      || widget.rotation !== 0 || widget.hidden !== false || widget.hasAppearance !== true
      || typeof widget.annotationFlags !== "number" || (widget.annotationFlags & hiddenFlags) !== 0
      || rect?.length !== 4 || !expected.every((coordinate, index) => Math.abs(coordinate - rect[index]) <= 0.001)) return undefined;
  return widget;
}

function exactAmount(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{2}))?$/.exec(text.trim());
  if (!match) return undefined;
  const dollars = match[1].replaceAll(",", "").replace(/^0+(?=\d)/, "");
  return `${dollars}.${match[2] ?? "00"}`;
}

function displayedAmount(widget: PdfAnnotation | undefined): string | undefined {
  if (!widget || !Array.isArray(widget.textContent) || widget.textContent.length !== 1) return undefined;
  const amount = exactAmount(widget.fieldValue);
  return amount === exactAmount(widget.textContent[0]) ? amount : undefined;
}

function displayedCheckbox(widget: PdfAnnotation | undefined, exportValue: string): boolean | undefined {
  if (!widget?.checkBox || widget.exportValue !== exportValue) return undefined;
  const { fontName, fontSize } = widget.defaultAppearanceData ?? {};
  // On this official form the marked widget uses a ZapfDingbats glyph. The
  // unmarked appearance has no drawn glyph and PDF.js exposes its dummy font.
  if (widget.fieldValue === exportValue && fontName === "ZaDb" && typeof fontSize === "number" && fontSize > 0) return true;
  if (widget.fieldValue === "Off" && fontName === "dummy__noop" && fontSize === 0) return false;
  return undefined;
}

export async function read20261098ECopyB(
  items: readonly PdfTextItem[], readAnnotations: () => Promise<readonly PdfAnnotation[]>,
): Promise<ParsedUploadedDocument | null> {
  if (!printedLabels.every(([label, x, y]) => hasPrintedLabel(items, label, x, y))) return null;

  const confirmedYear = hasConfirmedYear(items);
  const document: ParsedUploadedDocument = {
    kind: "1098-e",
    taxYear: confirmedYear ? 2026 : null,
    coverage: "needs-review",
    label: confirmedYear ? "2026 Form 1098-E Copy B" : "Form 1098-E Copy B",
    notes: confirmedYear
      ? "Review the original borrower statement to confirm Box 1 and Box 2."
      : "Review the original borrower statement to confirm its year, Box 1 and Box 2.",
    seededFactIds: [],
    detectedFacts: [],
  };
  if (!confirmedYear) return document;
  const annotations = await readAnnotations().catch(() => []);
  if (textInside(items, correctionRect).length || textInside(items, amountRect).length
      || displayedCheckbox(findVisibleWidget(annotations, "CopyBHeader[0].c2_1[0]", "Btn", correctionRect), "2") !== false) return document;

  const amount = displayedAmount(findVisibleWidget(annotations, "RightCol[0].f2_19[0]", "Tx", amountRect));
  if (amount === undefined) return document;
  const box2 = textInside(items, box2Rect).length
    ? undefined
    : displayedCheckbox(findVisibleWidget(annotations, "RightCol[0].c2_2[0]", "Btn", box2Rect), "1");
  const box2Note = box2 === true
    ? " Box 2 is checked. For loans made before September 1, 2004, Box 1 excludes origination fees, capitalized interest, or both."
    : box2 === false ? " Box 2 is unchecked." : "";
  return { ...document, notes: `Box 1 reports $${amount}.${box2Note} Confirm the amount against the original borrower statement.` };
}
