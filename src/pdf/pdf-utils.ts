/**
 * Shared PDF filling utilities.
 * Formatting and field-setting helpers for IRS fillable PDFs.
 */

import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, StandardFonts, ParseSpeeds, PDFArray, PDFDict, PDFName, PDFObject, PDFRef, PDFStream,
  PDFString, PDFHexString, PDFAcroText, PDFWidgetAnnotation, defaultTextFieldAppearanceProvider, type PDFOperator } from "pdf-lib";
import { readFile, writeFile, mkdir } from "fs/promises";
import { basename, dirname } from "path";
import Decimal from "decimal.js";
import { assertReviewTemplateBytes } from "./template-registry.js";
import { removeTrustedTemplateLegacyFormData } from "./trusted-review-template-cleanup.js";
import { assertPdfExportAllowed, markReviewPdf } from "./export-policy.js";

const PDF_LIB_XFA_WARNING =
  "Removing XFA form data as pdf-lib does not support reading or writing XFA";

let xfaWarningSuppressionDepth = 0;
let originalConsoleWarn: typeof console.warn | null = null;

// Only forms already accessed by typed mapping code participate. In particular,
// saving an untouched document must not create a form/font or remove its XFA.
const mappedForms = new WeakMap<PDFDocument, PDFForm>();

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
  mappedForms.set(form.doc, form);
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
  mappedForms.set(form.doc, form);
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
  mappedForms.set(form.doc, form);
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
  removeTrustedTemplateLegacyFormData(doc);
  await markReviewPdf(doc);
  return doc;
}

/** Spec: pdf-empty-combed-appearance.yaml. This is not a stream sanitizer. */
function emptyCombedValue(field: PDFTextField): boolean {
  const context = field.doc.context, visited = new Set<PDFDict>();
  let current: PDFDict | undefined = field.acroField.dict;
  let value: PDFObject | undefined;
  let rich = false;
  while (current) {
    if (visited.has(current) || visited.size >= 64) throw new Error("Empty combed appearance has an unsupported parent chain");
    visited.add(current);
    if (value === undefined && current.has(PDFName.of("V"))) {
      value = context.lookup(current.get(PDFName.of("V")));
      if (!(value instanceof PDFString) && !(value instanceof PDFHexString))
        throw new Error("Empty combed appearance has an unsupported canonical value");
    }
    rich ||= current.has(PDFName.of("RV"));
    const parent: PDFObject | undefined = current.get(PDFName.of("Parent"));
    if (parent === undefined) break;
    if (!(parent instanceof PDFRef)) throw new Error("Empty combed appearance has an ambiguous parent");
    const dictionary: PDFObject | undefined = context.lookup(parent);
    if (!(dictionary instanceof PDFDict)) throw new Error("Empty combed appearance has an unsupported parent");
    current = dictionary;
  }
  if ((value instanceof PDFString || value instanceof PDFHexString) && value.decodeText() !== "") return false;
  if (rich || field.isRichFormatted()) throw new Error("Empty combed appearance has unsupported rich text");
  for (const widget of field.acroField.getWidgets()) {
    if (widget.dict.has(PDFName.of("RV"))) throw new Error("Empty combed appearance has unsupported widget rich text");
    if (widget.dict.has(PDFName.of("V"))) {
      const widgetValue = context.lookup(widget.dict.get(PDFName.of("V")));
      if (!(widgetValue instanceof PDFString) && !(widgetValue instanceof PDFHexString))
        throw new Error("Empty combed appearance has an unsupported widget value");
      if (widgetValue.decodeText() !== "") throw new Error("Empty combed appearance has an ambiguous nonempty widget");
    }
  }
  return true;
}

function omitEmptyCombedPositions(operators: PDFOperator[], cells: number): PDFOperator[] {
  if (operators.length > 10000) throw new Error("Empty combed appearance has an unsupported operator count");
  const strings = operators.map(operator => operator.toString());
  const numeric = (token: string) => /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) && Number.isFinite(Number(token));
  const args = (line: string, name: string, count: number) => {
    const parts = line.split(" ");
    return parts.length === count + 1 && parts[count] === name && parts.slice(0, count).every(numeric);
  };
  const outsideNumbers: Readonly<Record<string, number>> = { cm: 6, w: 1, m: 2, l: 2, g: 1, G: 1, rg: 3, RG: 3, k: 4, K: 4 };
  const outsideNoArgs = new Set(["h", "W", "n", "f", "S", "B"]);
  const omitted = new Set<number>();
  let graphics = 0, marked = 0, textBlocks = 0;
  for (let index = 0; index < strings.length; index++) {
    const line = strings[index];
    if (line.length > 4096) throw new Error("Empty combed appearance has an unsupported operator size");
    if (line === "q") { graphics++; continue; }
    if (line === "Q") {
      if (--graphics < 0) throw new Error("Empty combed appearance has unbalanced graphics");
      continue;
    }
    if (line === "/Tx BMC") { if (++marked !== 1) throw new Error("Empty combed appearance has unsupported marking"); continue; }
    if (line === "EMC") { if (--marked !== 0) throw new Error("Empty combed appearance has unbalanced marking"); continue; }
    if (line === "BT") {
      if (++textBlocks !== 1 || graphics === 0 || marked !== 1) throw new Error("Empty combed appearance has an unsupported text group");
      const color = strings[++index] ?? "";
      if (!args(color, "g", 1) && !args(color, "rg", 3) && !args(color, "k", 4))
        throw new Error("Empty combed appearance has an unsupported text color");
      const font = (strings[++index] ?? "").split(" ");
      if (font.length !== 3 || font[0] !== "/Helvetica" || !numeric(font[1]) || font[2] !== "Tf")
        throw new Error("Empty combed appearance has an unsupported text font");
      for (let cell = 0; cell < cells; cell++) {
        const matrixIndex = ++index, matrix = strings[matrixIndex] ?? "";
        if (!args(matrix, "Tm", 6) || !matrix.startsWith("1 0 0 1 "))
          throw new Error("Empty combed appearance has an unsupported text position");
        const showIndex = ++index;
        if (strings[showIndex] !== "<> Tj") throw new Error("Empty combed appearance has unsupported or nonempty text");
        omitted.add(matrixIndex); omitted.add(showIndex);
      }
      if (strings[++index] !== "ET") throw new Error("Empty combed appearance has an unsupported or unbalanced text group");
      continue;
    }
    if (outsideNoArgs.has(line) || line === "[] 0 d") continue;
    const operatorName = line.slice(line.lastIndexOf(" ") + 1);
    if (Object.hasOwn(outsideNumbers, operatorName) && args(line, operatorName, outsideNumbers[operatorName])) continue;
    throw new Error("Empty combed appearance has an unsupported operator");
  }
  if (graphics !== 0 || marked !== 0 || textBlocks !== 1) throw new Error("Empty combed appearance has unbalanced groups");
  return operators.filter((_, index) => !omitted.has(index));
}

/** Validate all targets on clones before changing any live font, DA or AP. */
async function prepareMappedEmptyCombedAppearances(doc: PDFDocument): Promise<void> {
  const form = mappedForms.get(doc);
  if (!form) return;
  const scratch = await PDFDocument.create(), stagingFont = scratch.getForm().getDefaultFont();
  const fields = form.getFields();
  const plans = new Map<PDFTextField, { fieldDictionary: PDFDict; widgets: Map<PDFDict, { dictionary: PDFDict; operators: PDFOperator[] }> }>();
  const targetedWidgets = new Set<PDFDict>();
  const appearanceKey = PDFName.of("AP");
  const appearanceOwners = new Map<PDFDict, PDFDict>();
  const assertAppearanceOwner = (widget: PDFDict) => {
    const appearance = widget.lookup(appearanceKey);
    const owner = appearance instanceof PDFDict ? appearanceOwners.get(appearance) : undefined;
    if (owner && owner !== widget) throw new Error("Empty combed appearance has a shared appearance dictionary");
  };
  for (const field of fields) {
    if (!(field instanceof PDFTextField) || !field.needsAppearancesUpdate() || !field.isCombed() || !emptyCombedValue(field)) continue;
    const cells = field.getMaxLength();
    if (cells === undefined || !Number.isSafeInteger(cells) || cells <= 0 || cells > 4096)
      throw new Error("Empty combed appearance has an unsupported cell count");
    const fieldDictionary = field.acroField.dict.clone();
    const stagedField = PDFTextField.of(PDFAcroText.fromDict(fieldDictionary, field.ref), field.ref, doc);
    const widgets = new Map<PDFDict, { dictionary: PDFDict; operators: PDFOperator[] }>();
    for (const widget of field.acroField.getWidgets()) {
      if (targetedWidgets.has(widget.dict)) throw new Error("Empty combed appearance has an ambiguous shared widget");
      targetedWidgets.add(widget.dict);
      if (widget.dict.has(appearanceKey)) {
        const appearance = widget.dict.lookup(appearanceKey);
        if (!(appearance instanceof PDFDict)) throw new Error("Empty combed appearance has an unsupported appearance dictionary");
        assertAppearanceOwner(widget.dict);
        appearanceOwners.set(appearance, widget.dict);
      }
      const dictionary = widget.dict === field.acroField.dict ? fieldDictionary : widget.dict.clone();
      const generated = defaultTextFieldAppearanceProvider(stagedField, PDFWidgetAnnotation.fromDict(dictionary), stagingFont);
      if (!Array.isArray(generated)) throw new Error("Empty combed appearance has an unsupported provider mapping");
      widgets.set(widget.dict, { dictionary, operators: omitEmptyCombedPositions(generated, cells) });
    }
    plans.set(field, { fieldDictionary, widgets });
  }
  if (plans.size === 0) return;
  for (const field of fields) {
    for (const widget of field.acroField.getWidgets()) {
      if (targetedWidgets.has(widget.dict) && (!(field instanceof PDFTextField) || !plans.get(field)?.widgets.has(widget.dict)))
        throw new Error("Empty combed appearance has an ambiguous widget owner");
      assertAppearanceOwner(widget.dict);
    }
  }
  if (appearanceOwners.size > 0) {
    // Page-only widgets can share an AP dictionary without appearing in /Fields.
    const widgetSubtype = PDFName.of("Widget"), subtypeKey = PDFName.of("Subtype");
    for (const page of doc.getPages()) {
      const annotations = page.node.Annots();
      if (!annotations) continue;
      for (let index = 0; index < annotations.size(); index++) {
        const annotation = doc.context.lookup(annotations.get(index));
        if (annotation instanceof PDFDict && annotation.get(subtypeKey) === widgetSubtype) assertAppearanceOwner(annotation);
      }
    }
  }
  // No awaits or caller callbacks separate validation from these known provider
  // writes. The library still marks updated fields clean and save still checks
  // ordinary default appearances; it must not recreate the empty positions.
  const font = form.getDefaultFont(), defaultAppearanceKey = PDFName.of("DA");
  const applyDefault = (live: PDFDict, staged: PDFDict) => {
    const value = staged.get(defaultAppearanceKey);
    if (value === undefined) live.delete(defaultAppearanceKey);
    else live.set(defaultAppearanceKey, value);
  };
  for (const field of fields) {
    if (!field.needsAppearancesUpdate()) continue;
    const plan = field instanceof PDFTextField ? plans.get(field) : undefined;
    if (field instanceof PDFTextField && plan) {
      applyDefault(field.acroField.dict, plan.fieldDictionary);
      for (const [live, staged] of plan.widgets) applyDefault(live, staged.dictionary);
      field.updateAppearances(font, (_field, widget) => {
        const appearance = plan.widgets.get(widget.dict);
        if (!appearance) throw new Error("Empty combed appearance has an ambiguous changed widget");
        return appearance.operators;
      });
    } else field.defaultUpdateAppearances(font);
  }
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
  await prepareMappedEmptyCombedAppearances(output);
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
