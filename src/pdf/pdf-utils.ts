/**
 * Shared PDF filling utilities.
 * Formatting and field-setting helpers for IRS fillable PDFs.
 */

import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, StandardFonts, ParseSpeeds, PDFArray, PDFDict, PDFName, PDFObject, PDFRef, PDFStream } from "pdf-lib";
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

/** Resolve a bounded set of writes once, without caching a mutable form's fields. */
export function createPdfFieldBatch(form: PDFForm): {
  setText(fieldName: string, value: string): void;
  setCurrency(fieldName: string, value: Decimal): void;
  setCheckBox(fieldName: string, checked: boolean): void;
  apply(): void;
} {
  type Write = { kind: "text"; fieldName: string; value: string }
    | { kind: "checkbox"; fieldName: string; value: boolean };
  const writes: Write[] = [];
  let applied = false;
  const open = () => {
    if (applied) throw new Error("Mapped PDF field batch was already applied");
  };
  return {
    setText(fieldName, value) { open(); writes.push({ kind: "text", fieldName, value }); },
    setCurrency(fieldName, value) { open(); writes.push({ kind: "text", fieldName, value: formatCurrency(value) }); },
    setCheckBox(fieldName, value) { open(); writes.push({ kind: "checkbox", fieldName, value }); },
    apply() {
      open();
      const fields = new Map<string, ReturnType<PDFForm["getFields"]>[number]>();
      for (const field of form.getFields()) {
        // Match getFieldMaybe's first matching field, even for malformed duplicates.
        if (!fields.has(field.getName())) fields.set(field.getName(), field);
      }
      const resolved = writes.map(write => {
        const field = fields.get(write.fieldName);
        if (!field) throw new Error(`Missing mapped PDF field: ${write.fieldName}`);
        if (write.kind === "text") {
          if (!(field instanceof PDFTextField)) throw new Error(`Mapped PDF text field has the wrong type: ${write.fieldName}`);
          return { kind: "text" as const, field, value: write.value };
        }
        if (!(field instanceof PDFCheckBox)) throw new Error(`Mapped PDF checkbox field has the wrong type: ${write.fieldName}`);
        return { kind: "checkbox" as const, field, value: write.value };
      });
      applied = true;
      for (const write of resolved) {
        if (write.kind === "text") write.field.setText(write.value);
        else if (write.value) write.field.check();
        else write.field.uncheck();
      }
      writes.length = 0;
    },
  };
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
  options: { useObjectStreams?: boolean; pageOnlyTemporaryMerge?: boolean } = {},
): Promise<void> {
  if (options.pageOnlyTemporaryMerge && options.useObjectStreams !== false) {
    throw new Error("Page-only temporary merge inputs require explicit uncompressed serialization");
  }
  if (options.pageOnlyTemporaryMerge) {
    const hasPageWidget = doc.getPages().some((page) => {
      const annotations = page.node.Annots();
      if (!annotations) return false;
      for (let i = 0; i < annotations.size(); i++) {
        const annotation = doc.context.lookup(annotations.get(i));
        // Flattening can leave dangling annotation references. Only a resolved
        // widget is interactive, including widgets omitted from catalog Fields.
        if (annotation instanceof PDFDict
          && annotation.lookupMaybe(PDFName.of("Subtype"), PDFName) === PDFName.of("Widget")) {
          return true;
        }
      }
      return false;
    });
    if (doc.getForm().getFields().length !== 0 || hasPageWidget) {
      throw new Error("Page-only temporary merge inputs must be fully flattened, without interactive fields or widgets");
    }
  }
  // The workspace merger reads page content only. Copying those completed pages
  // omits unreachable widgets and appearance objects left by form flattening.
  // Catalog-level forms/outlines are intentionally outside this opt-in route;
  // ordinary saved documents retain their original document and field structure.
  const output = options.pageOnlyTemporaryMerge ? await doc.copy() : doc;
  if (options.pageOnlyTemporaryMerge) {
    for (const page of output.getPages()) {
      const annotations = page.node.Annots();
      if (!annotations) continue;
      // pdf-lib flattening can delete widget objects while leaving their page
      // references. Clean only unresolved entries in the private output copy;
      // resolved links and other non-widget annotations must remain intact.
      for (let i = annotations.size() - 1; i >= 0; i--) {
        if (output.context.lookup(annotations.get(i)) === undefined) annotations.remove(i);
      }
      if (annotations.size() === 0) page.node.delete(PDFName.of("Annots"));
    }
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const bytes = await output.save({ objectsPerTick: 500, useObjectStreams: options.useObjectStreams ?? true });
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
  // pdf-lib can delete a widget object while leaving its page annotation ref.
  // Snapshot only resolved widgets so unrelated invalid originals stay visible.
  const pageWidgets = form.doc.getPages().map(page => {
    const widgets = new Set<PDFRef>();
    for (const reference of page.node.Annots()?.asArray() ?? []) {
      const annotation = form.doc.context.lookup(reference);
      if (reference instanceof PDFRef && annotation instanceof PDFDict
        && form.doc.context.lookup(annotation.get(PDFName.of("Subtype"))) === PDFName.of("Widget")) widgets.add(reference);
    }
    return { page, widgets };
  });
  form.flatten({ updateFieldAppearances: false });
  const deletedWidgets = new Set<PDFRef>();
  for (const { page, widgets } of pageWidgets) {
    for (const reference of widgets) {
      if (form.doc.context.lookup(reference) === undefined) deletedWidgets.add(reference);
    }
    const annotations = page.node.Annots();
    if (!annotations) continue;
    for (let i = annotations.size() - 1; i >= 0; i--) {
      const reference = annotations.get(i);
      if (reference instanceof PDFRef && widgets.has(reference) && deletedWidgets.has(reference)) annotations.remove(i);
    }
    // Keep the array even when empty: pdf-lib caches page normalization and a
    // subsequent addAnnot must still be able to append a valid annotation.
  }
  removeDeletedWidgetStructureKids(form, deletedWidgets);
}

/** Keep existing tags, pruning only OBJR kids invalidated by this flatten. */
function removeDeletedWidgetStructureKids(form: PDFForm, deletedWidgets: Set<PDFRef>): void {
  if (deletedWidgets.size === 0) return;
  const context = form.doc.context;
  const root = context.lookup(form.doc.catalog.get(PDFName.of("StructTreeRoot")));
  if (!(root instanceof PDFDict)) return;
  const visited = new Set<PDFObject>();
  const removedIndirectKids = new Set<PDFRef>();
  const prune = (kid: PDFObject): boolean => {
    const object = context.lookup(kid);
    if (!(object instanceof PDFDict) && !(object instanceof PDFArray)) return false;
    if (object instanceof PDFDict && context.lookup(object.get(PDFName.of("Type"))) === PDFName.of("OBJR")) {
      const target = object.get(PDFName.of("Obj"));
      if (target instanceof PDFRef && deletedWidgets.has(target)) {
        if (kid instanceof PDFRef) removedIndirectKids.add(kid);
        return true;
      }
      return false;
    }
    if (visited.has(object)) return false;
    visited.add(object);
    if (object instanceof PDFArray) {
      for (let i = object.size() - 1; i >= 0; i--) if (prune(object.get(i))) object.remove(i);
    } else {
      const children = object.get(PDFName.of("K"));
      if (children && prune(children)) object.delete(PDFName.of("K"));
    }
    return false;
  };
  prune(root);
  // Do not serialize a now-unreachable indirect OBJR containing the deleted ref.
  // Preserve it if some other original structure still references it; that
  // ambiguity must stay visible rather than creating another dangling ref.
  const containsReference = (object: PDFObject, reference: PDFRef, seen: Set<PDFObject>): boolean => {
    if (object instanceof PDFRef) return object === reference;
    if (seen.has(object)) return false;
    seen.add(object);
    if (object instanceof PDFArray) return object.asArray().some(value => containsReference(value, reference, seen));
    if (object instanceof PDFDict) return object.values().some(value => containsReference(value, reference, seen));
    if (object instanceof PDFStream) return containsReference(object.dict, reference, seen);
    return false;
  };
  for (const reference of removedIndirectKids) {
    if (!context.enumerateIndirectObjects().some(([objectReference, object]) => objectReference !== reference
      && containsReference(object, reference, new Set()))) context.delete(reference);
  }
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
