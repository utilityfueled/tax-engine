import type { PDFPageProxy } from "pdfjs-dist";

const offerCodes = [
  "1A", "1B", "1C", "1D", "1E", "1F", "1G", "1H", "1J", "1K",
  "1L", "1M", "1N", "1O", "1P", "1Q", "1R", "1S", "1T", "1U",
] as const;
const reliefCodes = ["2A", "2B", "2C", "2D", "2E", "2F", "2G", "2H"] as const;
const contributionCodes = new Set([
  "1B", "1C", "1D", "1E", "1J", "1K", "1L", "1M", "1N", "1O", "1P", "1Q", "1T", "1U",
]);
const periods = ["all-12-months", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

type OfferCode = typeof offerCodes[number];
type ReliefCode = typeof reliefCodes[number];
type Period = typeof periods[number];
type Rectangle = readonly [number, number, number, number];

interface SourceColumn {
  period: Period;
  offerCode: OfferCode | null;
  contribution: string | null;
  reliefCode: ReliefCode | null;
  employeeEnrollment: "reported" | null;
}

export interface Form1095CReviewSource2026 {
  taxYear: 2026;
  statusMarkers: { void: "unchecked"; corrected: "unchecked" };
  employeeAndEmployerIdentity: "unconfirmed";
  columns: readonly SourceColumn[];
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

const pagePrefix = "topmostSubform[0].Page1[0].";
const voidRect = [561.6, 539.249, 574.1, 551.749] as const;
const correctedRect = [561.6, 515.251, 574.1, 527.751] as const;
const headerYearRect = [648, 504, 756, 528] as const;
const tableRect = [100.8, 264, 756, 372.001] as const;
// Text origins in points from page 1 of the final 2026 IRS PDF.
const pageAnchors = [
  ["1095-C", 54.284, 524.292],
  ["Employer-Provided Health Insurance Offer and Coverage", 174.483, 528.242],
  ["VOID", 578.801, 540.358],
  ["CORRECTED", 578.801, 516.36],
  ["20", 676, 509.721],
  ["26", 701.28, 509.721],
  ["All 12 months", 106.435, 375.29],
  ["14", 36, 364.853],
  ["15", 36, 338.603],
  ["16", 36, 302.603],
  ["1095-C", 651.567, 229.862],
  ["(2026) Created 4/3/26", 688.067, 229.862],
] as const;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.001;
}

function matchesRectangle(actual: number[] | undefined, expected: Rectangle): boolean {
  return actual?.length === 4 && expected.every((coordinate, index) => near(actual[index], coordinate));
}

function visibleWidget(annotations: readonly PdfAnnotation[], suffix: string, type: string, expected: Rectangle) {
  const fieldName = pagePrefix + suffix;
  const [left, bottom, right, top] = expected;
  const candidates = annotations.filter(({ fieldName: name, rect }) => name === fieldName || (
    rect?.length === 4 && rect[0] < right - 0.001 && rect[2] > left + 0.001
    && rect[1] < top - 0.001 && rect[3] > bottom + 0.001
  ));
  if (candidates.length !== 1) return undefined;
  const [widget] = candidates;
  const hiddenFlags = 1 | 2 | 32; // Invisible, Hidden and NoView.
  if (widget.fieldName !== fieldName || widget.subtype !== "Widget" || widget.fieldType !== type
    || widget.rotation !== 0 || widget.hidden !== false || widget.hasAppearance !== true
    || typeof widget.annotationFlags !== "number" || (widget.annotationFlags & hiddenFlags) !== 0
    || !matchesRectangle(widget.rect, expected)) return undefined;
  return widget;
}

function isConfirmedUnchecked(widget: PdfAnnotation | undefined, exportValue: string): boolean {
  const appearance = widget?.defaultAppearanceData;
  return widget?.checkBox === true && widget.exportValue === exportValue && widget.fieldValue === "Off"
    && appearance?.fontName === "dummy__noop" && appearance.fontSize === 0;
}

function displayedText(widget: PdfAnnotation | undefined): string | null | undefined {
  if (typeof widget?.fieldValue !== "string") return undefined;
  const value = widget.fieldValue.trim();
  const visible: unknown = widget.textContent;
  if (!value && (visible === undefined || (Array.isArray(visible) && visible.length === 0))) return null;
  return Array.isArray(visible) && visible.length === 1
    && typeof visible[0] === "string" && visible[0].trim() === value ? value : undefined;
}

function exactContribution(value: string): string | undefined {
  const match = /^(\d+|\d{1,3}(?:,\d{3})+)\.(\d{2})$/.exec(value);
  if (!match) return undefined;
  const dollars = match[1].replaceAll(",", "").replace(/^0+(?=\d)/, "");
  return `${dollars}.${match[2]}`;
}

function readColumn(annotations: readonly PdfAnnotation[], period: Period, index: number): SourceColumn | null {
  const left = 100.8 + 50.4 * index;
  const right = left + 50.4;
  const prefix = "Table1[0].";
  const offer = displayedText(visibleWidget(annotations, `${prefix}Row1[0].f1_${18 + index}[0]`, "Tx", [left, 348.001, right, 360.002]));
  const amount = displayedText(visibleWidget(annotations, `${prefix}Row2[0].f1_${31 + index}[0]`, "Tx", [left + 5.56, 312.001, index === 12 ? right : right - 0.75, 324.001]));
  const relief = displayedText(visibleWidget(annotations, `${prefix}Row3[0].f1_${44 + index}[0]`, "Tx", [left, 276.001, right, 288.001]));
  const offerCode = offer === null ? null : offerCodes.find(code => code === offer);
  const contribution = typeof amount === "string" ? exactContribution(amount) : amount;
  const reliefCode = relief === null ? null : reliefCodes.find(code => code === relief);
  if (offerCode === undefined || contribution === undefined || reliefCode === undefined) return null;
  return { period, offerCode, contribution, reliefCode, employeeEnrollment: reliefCode === "2C" ? "reported" : null };
}

function consistent(columns: readonly SourceColumn[]): boolean {
  const [annual, ...months] = columns;
  const fields = ["offerCode", "contribution", "reliefCode"] as const;
  if (fields.some(field => annual[field] !== null && months.some(month => month[field] !== null))) return false;
  const fullYear1G = annual.offerCode === "1G" || months.every(month => month.offerCode === "1G");
  return months.every(month => {
    const offer = annual.offerCode ?? month.offerCode;
    const contribution = annual.contribution ?? month.contribution;
    const relief = annual.reliefCode ?? month.reliefCode;
    return offer !== null && contributionCodes.has(offer) === (contribution !== null)
      && (offer !== "1G" || (fullYear1G && relief === null))
      && (offer !== "1A" || (relief !== "2A" && relief !== "2B"))
      && (relief !== "2C" || offer !== "1H")
      && (relief !== "2E" || offer === "1H");
  });
}

export async function read20261095CReviewSource(page: PDFPageProxy): Promise<Form1095CReviewSource2026 | null> {
  if (page.pageNumber !== 1 || page.rotate !== 0 || !matchesRectangle(page.view, [0, 0, 792, 612])) return null;
  try {
    const { items } = await page.getTextContent();
    const printed = items.flatMap(item => "str" in item && item.str.trim()
      ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }]
      : []);
    if (!pageAnchors.every(([label, x, y]) => printed.filter(item => item.text === label && near(item.x, x) && near(item.y, y)).length === 1)
      || printed.flatMap(({ text }) => text.match(/\b1095-C\b/g) ?? []).length !== 2) return null;

    const overprints = printed.filter(({ x, y, width }) => [voidRect, correctedRect, headerYearRect, tableRect].some(
      ([left, bottom, right, top]) => x + width > left + 0.001 && x < right && y >= bottom && y < top,
    ));
    // The two printed year fragments and the thirteen currency markers were preprinted by the IRS.
    if (overprints.length !== 15 || periods.some((_, index) => overprints.filter(
      ({ text, x, y }) => text === "$" && near(x, 100.8 + index * 50.4) && near(y, 314.821),
    ).length !== 1)) return null;

    const annotations: PdfAnnotation[] = await page.getAnnotations({ intent: "any" });
    if (!isConfirmedUnchecked(visibleWidget(annotations, "PgHeader[0].c1_1[0]", "Btn", voidRect), "1")
      || !isConfirmedUnchecked(visibleWidget(annotations, "PgHeader[0].c1_1[1]", "Btn", correctedRect), "2")) return null;

    const columns = periods.map((period, index) => readColumn(annotations, period, index));
    if (!columns.every(column => column !== null) || !consistent(columns)) return null;
    return {
      taxYear: 2026,
      statusMarkers: { void: "unchecked", corrected: "unchecked" },
      employeeAndEmployerIdentity: "unconfirmed",
      columns,
    };
  } catch {
    return null;
  }
}
