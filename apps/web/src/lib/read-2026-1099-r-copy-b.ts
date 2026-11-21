import Decimal from "decimal.js";
import type { ParsedUploadedDocument } from "./uploaded-document-detection";

type TextItem = { str?: string; transform?: number[]; width?: number };
type Annotation = {
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  rect?: number[];
  rotation?: number;
  hidden?: boolean;
  annotationFlags?: number;
  fieldValue?: unknown;
  hasAppearance?: boolean;
  textContent?: unknown;
  checkBox?: boolean;
  exportValue?: string;
};
type Rect = readonly [number, number, number, number];
type PositionedText = { text: string; x: number; y: number; width: number; horizontal: boolean };
// Undefined is an observed blank widget. Null means no reliable evidence.
type TextEvidence = string | undefined | null;

// Geometry is in PDF points from the archived official 2026 Copy B.
const identityLabels = [
  ["Form", 406.093, 693.861], ["1099-R", 424.377, 693.861],
  ["Copy B", 541.36, 678.861], ["7a", 297.7, 580.001], ["7b", 348.1, 580.001],
] as const;
const yearDigits = [
  ["20", 406, 716.721], ["26", 431.28, 716.721],
] as const;
const boxLabels = [
  ["CORRECTED (if checked)", 259.2, 758.86],
  ["Form", 50.4, 421.861], ["1099-R", 68.684, 421.861],
  ["1", 297.7, 748.002], ["Gross distribution", 309.376, 748.002],
  ["2a", 297.7, 712.002], ["Taxable amount", 309.502, 712.002],
  ["2b", 297.7, 682.003], ["Taxable amount", 309.761, 682.003],
  ["not", 362.016, 682.003], ["determined", 311.7, 673.603],
  ["Total", 412.4, 682.003], ["distribution", 412.4, 673.603],
  ["4", 398.5, 658.002], ["Federal income tax", 410.176, 658.002], ["withheld", 410.498, 649.252],
  ["Dist.", 309.502, 580.001], ["code(s)", 309.698, 571.601],
  ["IRA/SEP/", 360.161, 580.001], ["SIMPLE", 360.098, 571.601],
] as const;
const copyBPrefix = "topmostSubform[0].CopyB[0].";
const rightColumn = "RightCol[0].";

function withinField(items: PositionedText[], [left, bottom, right, top]: Rect) {
  return items.filter(({ x, y, width }) => y >= bottom && y <= top && x < right && x + width >= left);
}

function exactWidget(annotations: Annotation[], suffix: string, expected: Rect) {
  const [left, bottom, right, top] = expected;
  const name = copyBPrefix + suffix;
  const candidates = annotations.filter(({ fieldName, rect }) => fieldName === name || (
    rect?.length === 4 && rect[0] < right && rect[2] > left && rect[1] < top && rect[3] > bottom
  ));
  const [widget] = candidates;
  const rect = widget?.rect;
  // Invisible, Hidden, and NoView PDF annotation flags.
  const hiddenFlags = 1 | 2 | 32;
  return candidates.length === 1 && widget.fieldName === name && widget.subtype === "Widget"
    && widget.hidden === false && widget.rotation === 0
    && typeof widget.annotationFlags === "number" && Number.isInteger(widget.annotationFlags)
    && (widget.annotationFlags & hiddenFlags) === 0
    && rect?.length === 4 && expected.every((coordinate, index) => Math.abs(coordinate - rect[index]) <= 0.001)
    ? widget : null;
}

function amount(text: string) {
  if (text === "-0-") return "$0.00";
  const value = text.replace(/^\$\s*/, "");
  return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(value)
    ? `$${new Decimal(value.replace(/,/g, "")).toFixed(2)}` : null;
}

function distributionCode(text: string) {
  // Table 1 permits one or two source codes. Keep the recorded order and spacing.
  return /^[1-9A-HJ-NP-UWY](?: ?[1-9A-HJ-NP-UWY])?$/.test(text) ? text : null;
}

function documentReview(taxYear: number | null, evidence: readonly (readonly [string, TextEvidence])[] = []): ParsedUploadedDocument {
  const instruction = taxYear === null
    ? "Confirm the statement year, recipient, and original details in the retirement interview."
    : "Confirm the recipient and original statement details in the retirement interview.";
  const notes = evidence.flatMap(([label, value]) => value == null ? [] : [
    `${label} ${value.startsWith("$") ? value : `(${value})`}`,
  ]);
  return {
    kind: "1099-r",
    taxYear,
    coverage: "needs-review",
    label: "Form 1099-R Copy B source review",
    notes: notes.length ? `${notes.join(", ")}. ${instruction}` : instruction,
    seededFactIds: [],
    detectedFacts: [],
  };
}

export async function read20261099RCopyB(
  items: TextItem[],
  readAnnotations: () => Promise<Annotation[]>,
): Promise<ParsedUploadedDocument | null> {
  if (!items.some(({ str }) => str?.trim() === "1099-R")) return null;
  const positioned = items.flatMap(({ str, transform, width }) => {
    const [scaleX, skewY, skewX, scaleY, x, y] = transform ?? [];
    const text = str?.trim();
    return text && Number.isFinite(x) && Number.isFinite(y)
      && typeof width === "number" && Number.isFinite(width) && width >= 0
      ? [{ text, x, y, width, horizontal: scaleX > 0 && scaleY > 0 && skewX === 0 && skewY === 0 }]
      : [];
  });
  const anchor = ([text, x, y]: readonly [string, number, number]) => positioned.filter(item =>
    item.horizontal && item.text === text && Math.abs(item.x - x) <= 0.5 && Math.abs(item.y - y) <= 0.5
  ).length === 1;
  if (!identityLabels.every(anchor)) return null;
  if (withinField(positioned, [406, 714, 458, 719]).length !== 2 || !yearDigits.every(anchor)) return documentReview(null);

  const pageText = [...positioned].sort((a, b) => Math.round(b.y) - Math.round(a.y) || a.x - b.x)
    .map(({ text }) => text).join(" ");
  const otherYear = [
    /\b(?:(?:tax|calendar)\s+year\s*[:-]?\s*|Form\s+1099-R\s*\(\s*)(20\s*\d{2})\b/gi,
    /\b(20\s*\d{2})\s+(?:Form\s+)?1099-R\b/gi,
  ].some(pattern => [...pageText.matchAll(pattern)].some(([, year]) => year.replace(/\s/g, "") !== "2026"));
  const extraForm = positioned.filter(({ text }) => /^(?:Form\s+)?1099-R$/i.test(text)).length !== 2
    || positioned.filter(({ text }) => /^Copy\s+B$/i.test(text)).length !== 1;
  if (otherYear || extraForm) return documentReview(null);
  if (!boxLabels.every(anchor)) return documentReview(2026);
  const pageAnnotations = await readAnnotations().catch(() => null);
  if (!pageAnnotations) return documentReview(2026);
  const annotations = pageAnnotations;

  function checkbox(suffix: string, rect: Rect, exportValue: string) {
    const widget = exactWidget(annotations, suffix, rect);
    if (widget?.fieldType !== "Btn" || widget.checkBox !== true || widget.exportValue !== exportValue
      || withinField(positioned, rect).length !== 0) return null;
    if (widget.fieldValue === "Off" && widget.hasAppearance === false) return false;
    return widget.fieldValue === exportValue && widget.hasAppearance === true ? true : null;
  }

  if (checkbox("c2_1[0]", [244.8, 757.75, 254.8, 767.75], "2") !== false) return documentReview(2026);

  function textValue(suffix: string, rect: Rect, parse: (text: string) => string | null): TextEvidence {
    const widget = exactWidget(annotations, rightColumn + suffix, rect);
    if (widget?.fieldType !== "Tx" || typeof widget.fieldValue !== "string") return null;
    const visible = withinField(positioned, rect);
    const saved = widget.fieldValue.trim();
    const rendered: unknown = widget.textContent;
    if (!saved && !visible.length && (rendered === undefined || (Array.isArray(rendered) && rendered.length === 0))) return undefined;
    if (!saved || !widget.hasAppearance || !Array.isArray(rendered) || rendered.length !== 1
      || typeof rendered[0] !== "string") return null;
    const value = parse(saved);
    if (value === null || value !== parse(rendered[0].trim())) return null;
    if (!visible.length) return value;
    const [printed] = visible;
    return visible.length === 1 && printed.horizontal && printed.width > 0
      && printed.x >= rect[0] && printed.x + printed.width <= rect[2] && value === parse(printed.text) ? value : null;
  }

  const gross = textValue("f2_19[0]", [305.2, 720, 395, 731.999], amount);
  const taxable = textValue("f2_20[0]", [305.2, 690.001, 395, 702], amount);
  const withheld = textValue("f2_22[0]", [406, 630, 495.8, 641.999], amount);
  const code = textValue("f2_25[0]", [296.2, 551.999, 344.6, 563.999], distributionCode);
  if (!(gross || taxable || withheld || code)) return documentReview(2026);

  const excessEarnings = textValue("f2_26[0]", [449.2, 552.002, 495.8, 564.001], amount);
  const status = (checked: boolean | null) => checked === null ? null : checked ? "Checked" : "Unchecked";
  return documentReview(2026, [
    ["Box 1 gross distribution", gross],
    ["Box 2a taxable amount", taxable === undefined ? "Blank" : taxable],
    ["Box 2b taxable amount not determined", status(checkbox(rightColumn + "c2_2[0]", [374.8, 670.501, 384.8, 680.501], "1"))],
    ["Box 2b total distribution", status(checkbox(rightColumn + "c2_3[0]", [461.2, 670.501, 471.2, 680.501], "1"))],
    ["Box 4 federal income tax withheld", withheld],
    ["Box 7a distribution code", code],
    ["Box 7b IRA/SEP/SIMPLE", status(checkbox(rightColumn + "Box7b_ReadOrder[0].c2_4[0]", [364.4, 556.501, 374.4, 566.501], "1"))],
    ["Box 7c Trump account", status(checkbox(rightColumn + "Box7c_ReadOrder[0].c2_5[0]", [411.6, 556.501, 421.6, 566.501], "1"))],
    ["Box 7d earnings on excess contributions", excessEarnings === undefined ? "Blank" : excessEarnings],
  ]);
}
