import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { decodePDFRawStream, PDFArray, PDFAcroCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import type { PDFAcroField, PDFPageLeaf, PDFRef } from "pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

interface PolicyConfirmation {
  taxYear: number;
  originalStatementConfirmed: boolean;
  marketplace: string;
  policyNumber: string;
  issuerName: string;
  recipientName: string;
  recipientSsn: string;
}

interface ReportedAmounts {
  enrollmentPremium: string | null;
  slcspPremium: string | null;
  advancePTC: string | null;
}

interface Form1095AReviewSource2026 {
  taxYear: 2026;
  months: readonly (ReportedAmounts & { month: number })[];
  annualTotals: ReportedAmounts;
}

type Rectangle = readonly [number, number, number, number];
type PdfAnnotation = Awaited<ReturnType<PDFPageProxy["getAnnotations"]>>[number];
type AcroFields = readonly [PDFAcroField, PDFRef][];

const prefix = "topmostSubform[0].Page1[0].";
const pageBounds = [0, 0, 611.976, 791.968] as const;
const pageContentHashes = [
  "6f94de93ebde5407adda790cef7af70d5185c0c8feed50eb0badf90093b31223",
  "5d772d5b14d84f8038b958dc5720bfbfce53b7d9eac9a2929c3c883787e84b90",
] as const;
const identityRects = [
  [36, 659.967, 186.45, 673.968], [187.2, 659.967, 331.2, 673.968], [332.2, 659.967, 576, 673.968],
  [36, 635.966, 330.45, 649.967], [331.2, 635.966, 453.6, 649.967], [453.6, 635.966, 576, 649.967],
] as const;
const statusBoxes = [
  { name: `${prefix}Pg1Header[0].c1_1[0]`, rect: [417.6, 743.719, 430.1, 756.219], checked: "1" },
  { name: `${prefix}Pg1Header[0].c1_1[1]`, rect: [417.6, 719.217, 430.1, 731.717], checked: "2" },
] as const;
const amountColumns = [
  ["enrollmentPremium", 158.4, 280.05], ["slcspPremium", 280.8, 424.05], ["advancePTC", 424.8, 576],
] as const;
const anchors = [
  ["1095-A", 56.23, 742.116], ["Health Insurance Marketplace Statement", 139.942, 744.364],
  ["20", 506.8, 719.689], ["26", 532.08, 719.689],
  ["VOID", 434.239, 746.757], ["CORRECTED", 434.239, 722.255],
  ["Coverage Information", 81, 381.743], ["Monthly enrollment premiums", 171.357, 362.255],
  ["Monthly second lowest cost silver", 297.245, 362.255], ["Monthly advance payment of", 453.645, 362.255],
  ["January", 55.568, 326.253], ["December", 55.568, 62.242], ["Annual Totals", 55.568, 38.241],
  ["1095-A", 468.669, 25.829], ["(2026) Created 5/12/26", 503.775, 25.829],
] as const;
const checkmark = "q\n1 1 10.5 10.5 re\nW\nn\n0.5 w\n2 10.5 m\n10.5 2 l\n10.5 10.5 m\n2 2 l\ns\nQ";
const StatementDecimal = Decimal.clone({ precision: 20 });

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

function completeSsn(value: string | undefined): string | undefined {
  if (!value || !/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(value)) return undefined;
  return value.replaceAll("-", "");
}

function matchesPolicy(annotations: readonly PdfAnnotation[], confirmation: PolicyConfirmation): boolean {
  const [marketplace, policyNumber, issuerName, recipientName, recipientSsn, dob] = identityRects.map((rect, index) =>
    displayedText(visibleWidget(annotations, `${prefix}f1_${index + 1}[0]`, "Tx", rect)));
  const expectedSsn = completeSsn(confirmation.recipientSsn);
  if (!marketplace || !policyNumber || !issuerName || !recipientName || !recipientSsn || !expectedSsn || dob !== "") return false;
  const masked = /^(?:\*{5}|X{5}|\*{3}-\*{2}-|X{3}-X{2}-)(\d{4})$/.exec(recipientSsn);
  return marketplace === confirmation.marketplace && policyNumber === confirmation.policyNumber
    && issuerName === confirmation.issuerName && recipientName === confirmation.recipientName
    && (completeSsn(recipientSsn) === expectedSsn || masked?.[1] === expectedSsn.slice(-4));
}

function matchesPrintedLayout(items: Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"]): boolean {
  const printed = items.flatMap(item => "str" in item && item.str.trim()
    ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }]
    : []);
  return anchors.every(([label, x, y]) => printed.filter(item => item.text === label && near(item.x, x) && near(item.y, y)).length === 1);
}

function matchesPrintedContent(page: PDFPageLeaf, expected: string): boolean {
  const contents = page.Contents();
  let streams: PDFRawStream[];
  if (contents instanceof PDFArray) {
    streams = contents.asArray().map((_, index) => contents.lookup(index, PDFRawStream));
  } else if (contents instanceof PDFRawStream) {
    streams = [contents];
  } else {
    return false;
  }
  const hash = createHash("sha256");
  for (const stream of streams) {
    const decoded = decodePDFRawStream(stream).decode();
    hash.update(String(decoded.length)).update(":").update(decoded);
  }
  return hash.digest("hex") === expected;
}

function unchangedStatus(
  annotations: readonly PdfAnnotation[], rawFields: AcroFields, rawPageWidgets: ReadonlySet<unknown>,
  { name, rect, checked }: typeof statusBoxes[number],
): boolean {
  const visible = visibleWidget(annotations, name, "Btn", rect);
  if (visible?.checkBox !== true || visible.exportValue !== checked
    || visible.fieldValue !== "Off" || visible.hasAppearance !== false) return false;
  const matches = rawFields.filter(([field]) => field.getFullyQualifiedName() === name);
  if (matches.length !== 1 || !(matches[0][0] instanceof PDFAcroCheckBox)) return false;
  const [field] = matches[0];
  const widgets = field.getWidgets();
  if (widgets.length !== 1 || !rawPageWidgets.has(widgets[0].dict)) return false;
  const [widget] = widgets;
  const value = field.V();
  if (widget.getAppearanceState()?.decodeText() !== "Off"
    || (value !== undefined && (!(value instanceof PDFName) || value.decodeText() !== "Off"))) return false;
  const normal = widget.getAppearances()?.normal;
  if (!(normal instanceof PDFDict) || normal.keys().length !== 1) return false;
  const checkedAppearance = normal.lookup(PDFName.of(checked));
  return checkedAppearance instanceof PDFRawStream
    && matchesRectangle(checkedAppearance.dict.lookupMaybe(PDFName.of("BBox"), PDFArray)?.asArray().map(Number), [0, 0, 12.5, 12.5])
    && checkedAppearance.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray)?.asArray().map(Number).join() === "1,0,0,1,0,0"
    && new TextDecoder().decode(decodePDFRawStream(checkedAppearance).decode()).trim() === checkmark;
}

function reportedAmount(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") return null;
  if (value === "-0-") return "0.00";
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return undefined;
  const digits = value.replaceAll(",", "");
  // Twelve values with up to 15 integer digits and two cents sum exactly at this precision.
  if (digits.split(".")[0].length > 15) return undefined;
  return new StatementDecimal(digits).toFixed(2);
}

function reportedLine(annotations: readonly PdfAnnotation[], line: number): ReportedAmounts | undefined {
  const row = line - 21;
  const bottom = 323.965 - row * 24.001;
  const [enrollmentPremium, slcspPremium, advancePTC] = amountColumns.map(([, left, right], column) => {
    const name = `${prefix}Table_PartIII[0].Row${line}[0].f1_${41 + row * 3 + column}[0]`;
    return reportedAmount(displayedText(visibleWidget(annotations, name, "Tx", [left, bottom, right, bottom + 24.001])));
  });
  if (enrollmentPremium === undefined || slcspPremium === undefined || advancePTC === undefined) return undefined;
  return { enrollmentPremium, slcspPremium, advancePTC };
}

export async function read20261095AReviewSource(
  pdf: PDFDocumentProxy, confirmation: PolicyConfirmation,
): Promise<Form1095AReviewSource2026 | null> {
  if (confirmation.taxYear !== 2026 || confirmation.originalStatementConfirmed !== true || pdf.numPages !== 2) return null;
  try {
    const [page, instructionPage] = await Promise.all([pdf.getPage(1), pdf.getPage(2)]);
    if ([page, instructionPage].some(item => item.rotate !== 0 || item.userUnit !== 1 || !matchesRectangle(item.view, pageBounds))
      || !matchesPrintedLayout((await page.getTextContent()).items)) return null;
    const annotations = await page.getAnnotations({ intent: "any" });
    if (!matchesPolicy(annotations, confirmation)) return null;

    const raw = await PDFDocument.load(await pdf.getData(), { updateMetadata: false });
    const rawPages = raw.getPages();
    if (rawPages.length !== 2 || rawPages.some((item, index) => !matchesPrintedContent(item.node, pageContentHashes[index]))) return null;
    const acro = raw.catalog.getAcroForm();
    // A separate XFA form can display values independently of the AcroForm widgets.
    if (!acro || acro.dict.has(PDFName.of("XFA"))) return null;
    const fields = acro.getAllFields();
    const widgets = new Set(rawPages[0].node.Annots()?.asArray().map(object => raw.context.lookup(object)));
    if (!statusBoxes.every(box => unchangedStatus(annotations, fields, widgets, box))) return null;

    const months: (ReportedAmounts & { month: number })[] = [];
    for (let month = 1; month <= 12; month++) {
      const amounts = reportedLine(annotations, month + 20);
      if (!amounts) return null;
      months.push({ month, ...amounts });
    }
    const annualTotals = reportedLine(annotations, 33);
    if (!annualTotals || !months.some(month => amountColumns.some(([key]) => month[key] !== null))) return null;
    for (const [key] of amountColumns) {
      const reported = months.map(month => month[key]).filter(amount => amount !== null);
      const annual = annualTotals[key];
      if (!reported.length) {
        if (annual !== null && annual !== "0.00") return null;
      } else if (annual === null
        || !reported.reduce((sum, amount) => sum.plus(amount), new StatementDecimal(0)).eq(annual)) return null;
    }
    return { taxYear: 2026, months, annualTotals };
  } catch {
    return null;
  }
}
