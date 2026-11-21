import { createHash } from "node:crypto";
import { decodePDFRawStream, PDFArray, PDFAcroCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import type { PDFAcroField, PDFPageLeaf, PDFRef } from "pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

interface CoveredPersonConfirmation {
  taxYear: number;
  originalStatementConfirmed: boolean;
  line: number;
  firstName: string;
  middleInitial: string;
  lastName: string;
  tin: string;
}

interface Form1095BReviewSource2026 {
  taxYear: 2026;
  line: number;
  reportedBy: "annual-box" | "selected-months-boxes";
  monthsWithReportedCoverage: readonly number[];
}

type Rectangle = readonly [number, number, number, number];
type PdfAnnotation = Awaited<ReturnType<PDFPageProxy["getAnnotations"]>>[number];
type AcroFields = readonly [PDFAcroField, PDFRef][];

const pagePrefix = "topmostSubform[0].Page1[0].";
const voidBox = { name: `${pagePrefix}Pg1Header[0].cb_1[0]`, rect: [561.6, 551.251, 574.1, 563.751] as const };
const correctedBox = { name: `${pagePrefix}Pg1Header[0].cb_1[1]`, rect: [561.6, 527.25, 574.1, 539.75] as const };
const firstPageContentHash = "2b3f933f8d9806e4133eeaf67dc4805c3142873612d2c797bbbb12839a17701f";
const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const monthAnchors = [
  ["Jan", 418.281], ["Feb", 446.713], ["Mar", 475.365], ["Apr", 504.833],
  ["May", 532.297], ["Jun", 562.205], ["Jul", 592.341], ["Aug", 619.217],
  ["Sep", 648.017], ["Oct", 677.481], ["Nov", 705.545], ["Dec", 734.417],
] as const;
// Printed text origins and the checked-box appearance from the final IRS PDF.
const anchors = [
  ["1095-B", 54.284, 544.864], ["Health Coverage", 298.441, 546.024],
  ["VOID", 577.8, 552.861], ["CORRECTED", 577.8, 527.86],
  ["20", 676, 527.719], ["26", 701.28, 527.719],
  ["Part IV", 38.075, 302.862], ["Covered Individuals", 86.56, 302.862],
  ["Name of covered individual(s)", 84.838, 287.001], ["SSN or other TIN", 237.683, 287.001],
  ["DOB (if SSN or other", 314.151, 287.001], ["all 12 months", 375.5926, 277.999],
  ["Months of coverage", 558.3196, 287.001],
  ...monthAnchors.map(([label, x]) => [label, x, 266.29] as const),
  ["1095-B", 648.479, 37.86], ["(2026) Created 9/16/26", 683.775, 37.86],
] as const;
const checkmark = "q\n1 1 10.5 10.5 re\nW\nn\n0.5 w\n2 10.5 m\n10.5 2 l\n10.5 10.5 m\n2 2 l\ns\nQ";

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.001;
}

function matchesRectangle(actual: number[] | undefined, expected: Rectangle): boolean {
  return actual?.length === 4 && expected.every((coordinate, index) => near(actual[index], coordinate));
}

function visibleWidget(annotations: readonly PdfAnnotation[], name: string, type: "Tx" | "Btn", expected: Rectangle) {
  const [left, bottom, right, top] = expected;
  const candidates = annotations.filter(({ fieldName, rect }) => fieldName === name || (
    rect?.length === 4 && rect[0] < right - 0.001 && rect[2] > left + 0.001
    && rect[1] < top - 0.001 && rect[3] > bottom + 0.001
  ));
  if (candidates.length !== 1) return undefined;
  const [widget] = candidates;
  const hiddenFlags = 1 | 2 | 32; // Invisible, Hidden and NoView.
  return widget.fieldName === name && widget.subtype === "Widget" && widget.fieldType === type
    && widget.rotation === 0 && widget.hidden === false
    && typeof widget.annotationFlags === "number" && (widget.annotationFlags & hiddenFlags) === 0
    && matchesRectangle(widget.rect, expected) ? widget : undefined;
}

function displayedText(widget: PdfAnnotation | undefined): string | undefined {
  if (typeof widget?.fieldValue !== "string") return undefined;
  const value = widget.fieldValue.trim();
  const visible: unknown = widget.textContent;
  if (!value && (visible === undefined || (Array.isArray(visible) && visible.length === 0))) return "";
  return widget.hasAppearance === true && Array.isArray(visible) && visible.length === 1
    && typeof visible[0] === "string" && visible[0].trim() === value ? value : undefined;
}

function completeTin(value: string | undefined): string | undefined {
  if (!value || !/^(?:\d{9}|\d{3}-\d{2}-\d{4}|\d{2}-\d{7})$/.test(value)) return undefined;
  return value.replaceAll("-", "");
}

function matchesPerson(annotations: readonly PdfAnnotation[], confirmation: CoveredPersonConfirmation, prefix: string, row: number) {
  const bottom = 228.002 - row * 36;
  const top = bottom + 12;
  const namesAndIdentity = [[50.4, 121.65], [122.4, 144], [145, 215.25], [216, 302.4], [302.4, 374.4]];
  const [first, middle, last, tin, dob] = namesAndIdentity.map(([left, right], index) => displayedText(
    visibleWidget(annotations, `${prefix}f1_${25 + row * 5 + index}[0]`, "Tx", [left, bottom, right, top]),
  ));
  const expectedTin = completeTin(confirmation.tin);
  return Boolean(expectedTin && first && last) && first === confirmation.firstName
    && middle === confirmation.middleInitial && last === confirmation.lastName
    && completeTin(tin) === expectedTin && dob === "";
}

function hasPrintedLayout(items: Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"], line: number, row: number): boolean {
  const printed = items.flatMap(item => "str" in item && item.str.trim()
    ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }]
    : []);
  const required = [...anchors, [String(line), 39, 230.29 - row * 36] as const];
  return required.every(([label, x, y]) => printed.filter(item => item.text === label && near(item.x, x) && near(item.y, y)).length === 1);
}

function matchesPrintedContent(page: PDFPageLeaf): boolean {
  const contents = page.Contents();
  if (!(contents instanceof PDFArray) || contents.size() !== 8) return false;
  const hash = createHash("sha256");
  for (let index = 0; index < contents.size(); index++) {
    const stream = decodePDFRawStream(contents.lookup(index, PDFRawStream)).decode();
    hash.update(String(stream.length)).update(":").update(stream);
  }
  // Added marks and overprints change the page contents. Filled widget values live separately.
  return hash.digest("hex") === firstPageContentHash;
}

function checkboxState(
  annotations: readonly PdfAnnotation[], rawFields: AcroFields, rawPageWidgets: ReadonlySet<unknown>,
  name: string, rect: Rectangle, exportValue = "1",
): boolean | undefined {
  const visible = visibleWidget(annotations, name, "Btn", rect);
  if (visible?.checkBox !== true || visible.exportValue !== exportValue) return undefined;
  const matches = rawFields.filter(([field]) => field.getFullyQualifiedName() === name);
  if (matches.length !== 1 || !(matches[0][0] instanceof PDFAcroCheckBox)) return undefined;
  const [field] = matches[0];
  const widgets = field.getWidgets();
  if (widgets.length !== 1 || !rawPageWidgets.has(widgets[0].dict)) return undefined;
  const [widget] = widgets;
  const visibleState = widget.getAppearanceState()?.decodeText();
  const fieldValue = field.V();
  // The IRS blank omits V on unchecked boxes. PDF.js prioritizes AS over V.
  if ((visibleState !== "Off" && visibleState !== exportValue) || visible.fieldValue !== visibleState
    || visible.hasAppearance !== (visibleState === exportValue)
    || (fieldValue === undefined ? visibleState !== "Off" : !(fieldValue instanceof PDFName)
      || fieldValue.decodeText() !== visibleState)) return undefined;

  const normal = widget.getAppearances()?.normal;
  if (!(normal instanceof PDFDict) || normal.keys().length !== 1) return undefined;
  const checked = normal.lookup(PDFName.of(exportValue));
  if (!(checked instanceof PDFRawStream) || !matchesRectangle(checked.dict.lookupMaybe(PDFName.of("BBox"), PDFArray)?.asArray().map(Number), [0, 0, 12.5, 12.5])
    || checked.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray)?.asArray().map(Number).join() !== "1,0,0,1,0,0"
    || new TextDecoder().decode(decodePDFRawStream(checked).decode()).trim() !== checkmark) return undefined;
  return visibleState === exportValue;
}

export async function read20261095BReviewSource(
  pdf: PDFDocumentProxy, confirmation: CoveredPersonConfirmation,
): Promise<Form1095BReviewSource2026 | null> {
  const { taxYear, originalStatementConfirmed, line } = confirmation;
  if (taxYear !== 2026 || originalStatementConfirmed !== true || !Number.isInteger(line) || line < 23 || line > 28) return null;
  try {
    const row = line - 23;
    const prefix = `${pagePrefix}Table1_Part4[0].Row${line}[0].`;
    const page = await pdf.getPage(1);
    if (page.rotate !== 0 || page.userUnit !== 1 || !matchesRectangle(page.view, [0, 0, 792, 612])
      || !hasPrintedLayout((await page.getTextContent()).items, line, row)) return null;
    const annotations = await page.getAnnotations({ intent: "any" });
    if (!matchesPerson(annotations, confirmation, prefix, row)) return null;

    const raw = await PDFDocument.load(await pdf.getData(), { updateMetadata: false });
    const rawPage = raw.getPage(0).node;
    if (!matchesPrintedContent(rawPage)) return null;
    const fields = raw.catalog.getAcroForm()?.getAllFields();
    const widgets = new Set(rawPage.Annots()?.asArray().map(object => raw.context.lookup(object)));
    if (!fields || checkboxState(annotations, fields, widgets, voidBox.name, voidBox.rect) !== false
      || checkboxState(annotations, fields, widgets, correctedBox.name, correctedBox.rect, "2") !== false) return null;

    const boxes = [0, ...months].map(month => {
      const field = String(1 + row * 13 + month).padStart(2, "0");
      const left = month === 0 ? 385.829 : 418.629 + (month - 1) * 28.8;
      const bottom = 239.252 - row * 36;
      return checkboxState(annotations, fields, widgets, `${prefix}c1_${field}[0]`, [left, bottom, left + 12.5, bottom + 12.5]);
    });
    if (boxes.includes(undefined)) return null;
    const monthly = months.filter(month => boxes[month]);
    const annual = boxes[0];
    if (annual ? monthly.length !== 0 : monthly.length === 0 || monthly.length === months.length) return null;
    return {
      taxYear,
      line,
      reportedBy: annual ? "annual-box" : "selected-months-boxes",
      monthsWithReportedCoverage: annual ? [...months] : monthly,
    };
  } catch {
    return null;
  }
}
