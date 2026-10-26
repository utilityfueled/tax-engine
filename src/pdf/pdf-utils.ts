/**
 * Shared PDF filling utilities.
 * Formatting and field-setting helpers for IRS fillable PDFs.
 */

import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, StandardFonts, ParseSpeeds } from "pdf-lib";
import { readFile, writeFile, mkdir } from "fs/promises";
import { basename, dirname } from "path";
import Decimal from "decimal.js";
import { assertReviewTemplateBytes } from "./template-registry.js";
import { assertPdfExportAllowed, markReviewPdf } from "./export-policy.js";

const PDF_LIB_XFA_WARNING =
  "Removing XFA form data as pdf-lib does not support reading or writing XFA";

let xfaWarningSuppressionDepth = 0;
let originalConsoleWarn: typeof console.warn | null = null;

function installPdfLibXfaWarningFilter() {
  if (xfaWarningSuppressionDepth === 0) {
    originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const [firstArg] = args;

      if (typeof firstArg === "string" && firstArg.includes(PDF_LIB_XFA_WARNING)) {
        return;
      }

      originalConsoleWarn?.(...args);
    };
  }

  xfaWarningSuppressionDepth += 1;
}

function removePdfLibXfaWarningFilter() {
  xfaWarningSuppressionDepth = Math.max(0, xfaWarningSuppressionDepth - 1);

  if (xfaWarningSuppressionDepth === 0 && originalConsoleWarn) {
    console.warn = originalConsoleWarn;
    originalConsoleWarn = null;
  }
}

export async function loadPdfDocumentQuietly(bytes: Uint8Array | ArrayBuffer): Promise<PDFDocument> {
  installPdfLibXfaWarningFilter();

  try {
    return await PDFDocument.load(bytes, { parseSpeed: ParseSpeeds.Medium });
  } finally {
    removePdfLibXfaWarningFilter();
  }
}

/** Format a Decimal as a whole-dollar string for IRS forms (no $ sign, no cents). */
export function formatCurrency(value: Decimal): string {
  if (value.isZero()) return "";
  // IRS convention: round to nearest dollar
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  // Negative values use parentheses per IRS convention
  if (rounded.isNeg()) {
    return `(${rounded.abs().toFixed(0)})`;
  }
  return rounded.toFixed(0);
}

/** Format a Decimal with commas for readability (optional, some IRS forms use commas). */
export function formatCurrencyWithCommas(value: Decimal): string {
  if (value.isZero()) return "";
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const isNeg = rounded.isNeg();
  const abs = rounded.abs().toFixed(0);
  const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return isNeg ? `(${withCommas})` : withCommas;
}

/** Format a Decimal with cents (for W-2 amounts, etc.). */
export function formatCurrencyWithCents(value: Decimal): string {
  if (value.isZero()) return "";
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (rounded.isNeg()) {
    return `(${rounded.abs().toFixed(2)})`;
  }
  return rounded.toFixed(2);
}

/** A missing or wrong-type mapped field is a broken mapping, including blank writes. */
export function setTextField(
  form: PDFForm,
  fieldName: string,
  value: string,
): void {
  const field = form.getFieldMaybe(fieldName);
  if (!field) throw new Error(`Missing mapped PDF field: ${fieldName}`);
  if (!(field instanceof PDFTextField)) throw new Error(`Mapped PDF text field has the wrong type: ${fieldName}`);
  field.setText(value);
}

/** Safely set a currency field from a Decimal value. */
export function setCurrencyField(
  form: PDFForm,
  fieldName: string,
  value: Decimal,
): void {
  setTextField(form, fieldName, formatCurrency(value));
}

/** Set both checkbox states explicitly and reject stale mapping names/types. */
export function setCheckBox(
  form: PDFForm,
  fieldName: string,
  checked: boolean,
): void {
  const field = form.getFieldMaybe(fieldName);
  if (!field) throw new Error(`Missing mapped PDF field: ${fieldName}`);
  if (!(field instanceof PDFCheckBox)) throw new Error(`Mapped PDF checkbox has the wrong type: ${fieldName}`);
  if (checked) field.check();
  else field.uncheck();
}

/** Load a blank PDF from disk. */
export async function loadBlankPdf(pdfPath: string): Promise<PDFDocument> {
  const bytes = await readFile(pdfPath);
  return loadPdfDocumentQuietly(bytes);
}

/** A year-specific map must only use its registered, unchanged template revision. */
export async function loadReviewTemplate(pdfPath: string, taxYear: number): Promise<PDFDocument> {
  assertPdfExportAllowed(taxYear, taxYear);
  const bytes = await readFile(pdfPath);
  assertReviewTemplateBytes(basename(pdfPath), bytes, taxYear);
  const doc = await loadPdfDocumentQuietly(bytes);
  await markReviewPdf(doc);
  return doc;
}

/** Save a filled PDF to disk, creating directories as needed. */
export async function savePdf(
  doc: PDFDocument,
  outputPath: string,
  options: { useObjectStreams?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const bytes = await doc.save({ objectsPerTick: 500, useObjectStreams: options.useObjectStreams ?? true });
  await writeFile(outputPath, bytes);
}

/**
 * Flatten all form fields so the PDF renders consistently
 * in viewers that don't support interactive forms.
 */
export async function flattenForm(form: PDFForm): Promise<void> {
  try {
    const font = await form.doc.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
  } catch {
    // Some PDFs have partial appearance metadata; fall back to flattening anyway.
  }
  form.flatten({ updateFieldAppearances: false });
}

/**
 * Fill a sequence of single-digit PDF text fields with the digits of a currency amount.
 * Used for state forms (e.g., NJ-1040) that use individual digit boxes instead of
 * a single text field per line.
 *
 * Digits are right-aligned: for fieldNames ["a","b","c","d","e","f"] and value 1234,
 * fields are filled as: "", "", "1", "2", "3", "4".
 *
 * Zero values leave all fields empty.
 */
export function setDigitFields(
  form: PDFForm,
  fieldNames: readonly string[],
  value: Decimal,
): void {
  if (value.isZero()) return;
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  // Negative amounts: fill with absolute value (negative indicator handled separately)
  const digits = rounded.abs().toFixed(0);
  const startIdx = fieldNames.length - digits.length;
  for (let i = 0; i < digits.length && startIdx + i < fieldNames.length; i++) {
    if (startIdx + i >= 0) {
      setTextField(form, fieldNames[startIdx + i], digits[i]);
    }
  }
}

/**
 * Debug utility: fill every text field with its own field name,
 * truncated to fit maxLength if set.
 * Produces a self-documenting PDF for mapping verification.
 */
export async function fillDebugLabels(pdfPath: string, outputPath: string): Promise<void> {
  const doc = await loadBlankPdf(pdfPath);
  const form = doc.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    const shortName = name.split(".").pop()?.replace(/\[\d+\]$/, "") ?? name;
    if (field instanceof PDFTextField) {
      const maxLen = field.getMaxLength();
      const label = maxLen !== undefined ? shortName.slice(0, maxLen) : shortName;
      field.setText(label);
    }
  }
  await savePdf(doc, outputPath);
}
