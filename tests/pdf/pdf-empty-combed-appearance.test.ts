// Spec: spec/federal/pdf-empty-combed-appearance.yaml. Synthetic local PDFs only.
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFString, degrees, rgb, decodePDFRawStream } from 'pdf-lib';
import type { PDFTextField } from 'pdf-lib';
import { createPdfFieldBatch, savePdf, setTextField } from '@/pdf/pdf-utils.js';

const providerFault = vi.hoisted(() => ({ kind: '' }));
vi.mock('pdf-lib', async importOriginal => {
  const actual = await importOriginal<typeof import('pdf-lib')>();
  return { ...actual, defaultTextFieldAppearanceProvider: (...args: Parameters<typeof actual.defaultTextFieldAppearanceProvider>) => {
    const operators = actual.defaultTextFieldAppearanceProvider(...args);
    if (!providerFault.kind || !args[0].getName().endsWith('late-target')) return operators;
    if (!Array.isArray(operators)) throw new Error('Unexpected library provider mapping');
    const copy = [...operators];
    if (providerFault.kind === 'nonempty-show') {
      const index = copy.findIndex(op => op.toString() === '<> Tj');
      if (index < 0) throw new Error('Missing real empty text-show operation');
      copy[index] = actual.showText(actual.PDFHexString.fromText('555555555'));
    }
    if (providerFault.kind === 'unbalanced-graphics') copy.push(actual.pushGraphicsState());
    if (providerFault.kind === 'unbalanced-text') copy.push(actual.beginText());
    if (providerFault.kind === 'unknown-operator') copy.push(actual.PDFOperator.of(actual.PDFOperatorNames.DrawObject, [actual.PDFName.of('unsupported')]));
    return copy;
  } };
});
afterEach(() => { providerFault.kind = ''; vi.restoreAllMocks(); });

async function original(withLate = false, rotated = false) {
  const doc = await PDFDocument.create(), page = doc.addPage([300, 240]), form = doc.getForm();
  const add = (name: string, y: number) => {
    const field = form.createTextField(name); field.setMaxLength(9); field.enableCombing();
    // Initial108-unit appearance has exact integer cell centers. The actual
    // final107-unit original geometry is set before the mapped empty write.
    field.addToPage(page, { x: 20, y, width: 108, height: 18, borderWidth: 0, backgroundColor: rgb(0.8, 0.9, 1), rotate: degrees(rotated ? 90 : 0) });
    const widget = field.acroField.getWidgets()[0];
    if (!widget) throw new Error('Missing actual test widget');
    widget.setRectangle({ ...widget.getRectangle(), width: 107 });
    setTextField(form, field.getName(), '');
    return field;
  };
  const first = add('empty-first', 20), late = withLate ? add('late-target', 60) : undefined;
  return { doc, form, first, late };
}
function contents(doc: PDFDocument): string[] {
  return doc.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream
    ? [Buffer.from(decodePDFRawStream(object).decode()).toString('latin1')] : []);
}
function appearances(field: PDFTextField): string[] {
  return field.acroField.getWidgets().map(widget => {
    const stream = widget.getAppearances()?.normal;
    if (!(stream instanceof PDFRawStream)) throw new Error('Missing saved normal appearance');
    return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
  });
}
function snapshot(doc: PDFDocument): string {
  const form = doc.getForm();
  return JSON.stringify({ objects: doc.context.enumerateIndirectObjects().map(([ref, object]) => [ref.toString(), object.toString()]),
    largest: doc.context.largestObjectNumber, dirty: form.getFields().map(field => [field.getName(), form.fieldIsDirty(field.ref)]) });
}
function withoutEmptyPositions(content: string): string[] {
  // Independent comparison of retained operations, not a production sanitizer.
  return content.trim().split('\n').filter(line => !line.endsWith(' Tm') && line !== '<> Tj');
}

it('omits empty comb positioning through the actual save path', async () => {
  const { doc, form, first } = await original(), before = first.getText();
  const directory = await mkdtemp(join(tmpdir(), 'empty-combed-public-'));
  try {
    const path = join(directory, 'review.pdf');
    await savePdf(doc, path, { useObjectStreams: false });
    const reopened = await PDFDocument.load(await readFile(path)), field = reopened.getForm().getTextField('empty-first');
    expect(field.getText()).toBe(before);
    expect(field.acroField.getWidgets()).toHaveLength(1);
    expect(field.acroField.getWidgets()[0]?.getRectangle().width).toBe(107);
    const streams = contents(reopened);
    expect(streams.some(stream => stream.includes('555555555'))).toBe(false);
    expect(appearances(field).every(stream => !/\bTm\b|\bTj\b/.test(stream))).toBe(true);
    expect(form.fieldIsDirty(first.ref)).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('preserves graphics and nonempty typed fields', async () => {
  const { doc, form, first } = await original(false, true), page = doc.getPages()[0];
  if (!page) throw new Error('Missing actual page');
  const nonempty = form.createTextField('actual-text'); nonempty.setMaxLength(9); nonempty.enableCombing();
  nonempty.addToPage(page, { x: 100, y: 20, width: 108, height: 18, borderWidth: 1, borderColor: rgb(1, 0, 0) });
  form.createCheckBox('checked').addToPage(page, { x: 200, y: 20 });
  const money = form.createTextField('money'); money.addToPage(page, { x: 120, y: 80, width: 100, height: 20 });
  const writes = createPdfFieldBatch(form); writes.setText('actual-text', '555555555'); writes.setText('money', '929'); writes.setCheckBox('checked', true); writes.apply();
  const baseline = await PDFDocument.load(await doc.save({ updateFieldAppearances: false }));
  const directory = await mkdtemp(join(tmpdir(), 'empty-combed-preservation-'));
  try {
    const baselinePath = join(directory, 'baseline.pdf'), candidatePath = join(directory, 'candidate.pdf');
    // Dirty state is not serialized. Mark the exact same original fields for the
    // original library save, including the changed empty geometry.
    for (const field of baseline.getForm().getFields()) baseline.getForm().markFieldAsDirty(field.ref);
    const baselineBytes = await baseline.save({ useObjectStreams: false });
    const baselineDoc = await PDFDocument.load(baselineBytes);
    await savePdf(doc, candidatePath, { useObjectStreams: false });
    const candidate = await PDFDocument.load(await readFile(candidatePath)), expected = baselineDoc.getForm(), actual = candidate.getForm();
    expect(withoutEmptyPositions(appearances(actual.getTextField('empty-first'))[0] ?? '')).toEqual(withoutEmptyPositions(appearances(expected.getTextField('empty-first'))[0] ?? ''));
    for (const name of ['actual-text', 'money']) {
      expect(actual.getTextField(name).getText()).toBe(expected.getTextField(name).getText());
      expect(appearances(actual.getTextField(name))).toEqual(appearances(expected.getTextField(name)));
    }
    expect(actual.getCheckBox('checked').isChecked()).toBe(true);
    expect(appearances(actual.getTextField('empty-first'))[0]).toContain('BT\n');
    expect(appearances(actual.getTextField('empty-first'))[0]).toContain('W\n');
    expect(first.getText() ?? '').toBe('');
    await expect(access(baselinePath)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each(['nonempty-show', 'unbalanced-graphics', 'unbalanced-text', 'unknown-operator', 'malformed-value', 'rich-value'])('rejects unsupported later appearances atomically: %s', async mode => {
  const { doc, late } = await original(true);
  if (!late) throw new Error('Missing later original field');
  if (mode === 'malformed-value') late.acroField.dict.set(PDFName.of('V'), PDFNumber.of(0));
  else if (mode === 'rich-value') late.acroField.dict.set(PDFName.of('RV'), PDFHexString.fromText('Not an empty rich value'));
  else providerFault.kind = mode;
  const before = snapshot(doc), directory = await mkdtemp(join(tmpdir(), 'empty-combed-atomic-'));
  try {
    const output = join(directory, 'never-created', 'review.pdf');
    await expect(savePdf(doc, output)).rejects.toThrow(/empty combed.*(?:unsupported|ambiguous|nonempty|unbalanced)/i);
    expect(snapshot(doc)).toBe(before);
    await expect(access(join(directory, 'never-created'))).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each(['direct', 'indirect', 'dangling'])('rejects an invalid later appearance dictionary atomically: %s', async mode => {
  const { doc, late } = await original(true), widget = late?.acroField.getWidgets()[0];
  if (!widget) throw new Error('Missing later original widget');
  const invalid = PDFName.of('MalformedAppearance');
  const reference = mode === 'direct' ? invalid : doc.context.register(invalid);
  if (mode === 'dangling' && !(reference instanceof PDFName)) doc.context.delete(reference);
  widget.dict.set(PDFName.of('AP'), reference);
  const before = snapshot(doc), directory = await mkdtemp(join(tmpdir(), 'empty-combed-invalid-ap-'));
  try {
    const output = join(directory, 'never-created', 'review.pdf');
    await expect(savePdf(doc, output)).rejects.toThrow();
    expect(snapshot(doc)).toBe(before);
    await expect(access(join(directory, 'never-created'))).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each(['field', 'page-only'])('rejects an appearance dictionary shared with a clean widget: %s', async owner => {
  const { doc, form, first } = await original(), page = doc.getPages()[0];
  if (!page) throw new Error('Missing actual page');
  const clean = form.createTextField('clean-custom');
  clean.setText('PRESERVED');
  clean.addToPage(page, { x: 30, y: 70, width: 100, height: 18 });
  form.markFieldAsClean(clean.ref);
  const cleanWidget = clean.acroField.getWidgets()[0], target = first.acroField.getWidgets()[0];
  const shared = cleanWidget?.AP();
  if (!target || !cleanWidget || !shared) throw new Error('Missing original appearance dictionary');
  const reference = doc.context.register(shared);
  target.dict.set(PDFName.of('AP'), reference);
  cleanWidget.dict.set(PDFName.of('AP'), reference);
  if (owner === 'page-only') form.acroForm.removeField(clean.acroField);
  const before = snapshot(doc), directory = await mkdtemp(join(tmpdir(), 'empty-combed-shared-ap-'));
  try {
    const output = join(directory, 'never-created', 'review.pdf');
    await expect(savePdf(doc, output)).rejects.toThrow(/empty combed.*shared appearance dictionary/i);
    expect(snapshot(doc)).toBe(before);
    await expect(access(join(directory, 'never-created'))).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('preserves clean appearances when distinct dictionaries share a normal stream', async () => {
  const { doc, form, first } = await original(), page = doc.getPages()[0];
  if (!page) throw new Error('Missing actual page');
  const clean = form.createTextField('clean-custom');
  clean.setText('PRESERVED');
  clean.addToPage(page, { x: 30, y: 70, width: 100, height: 18 });
  form.markFieldAsClean(clean.ref);
  const cleanWidget = clean.acroField.getWidgets()[0], target = first.acroField.getWidgets()[0];
  const cleanAP = cleanWidget?.AP(), targetAP = target?.AP();
  const shared = cleanAP?.get(PDFName.of('N'));
  if (!targetAP || !shared) throw new Error('Missing original normal appearance');
  targetAP.set(PDFName.of('N'), shared);
  const directory = await mkdtemp(join(tmpdir(), 'empty-combed-shared-stream-'));
  try {
    await savePdf(doc, join(directory, 'review.pdf'));
    expect(cleanAP?.get(PDFName.of('N'))).toBe(shared);
    expect(targetAP.get(PDFName.of('N'))).not.toBe(shared);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('retains inherited nonempty values and rejects contradictory widgets', async () => {
  const inherited = await original(), parent = inherited.doc.context.obj({ T: PDFString.of('parent'), V: PDFHexString.fromText('INHERITED') });
  inherited.first.acroField.setParent(inherited.doc.context.register(parent));
  const directory = await mkdtemp(join(tmpdir(), 'empty-combed-inherited-'));
  try {
    const path = join(directory, 'inherited.pdf'); await savePdf(inherited.doc, path);
    const reopened = await PDFDocument.load(await readFile(path)), field = reopened.getForm().getTextField('parent.empty-first');
    expect(field.getText()).toBe('INHERITED');
    expect(appearances(field)[0]).toMatch(/\bTm\b/);
    const contradictory = await original(), widget = contradictory.first.acroField.getWidgets()[0];
    if (!widget) throw new Error('Missing original widget');
    widget.dict.set(PDFName.of('V'), PDFHexString.fromText('NOTEMPTY'));
    const before = snapshot(contradictory.doc);
    await expect(savePdf(contradictory.doc, join(directory, 'denied.pdf'))).rejects.toThrow(/empty combed.*(?:ambiguous|nonempty)/i);
    expect(snapshot(contradictory.doc)).toBe(before);
    await expect(access(join(directory, 'denied.pdf'))).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('leaves untouched document and XFA custody unchanged', async () => {
  const doc = await PDFDocument.create(); doc.addPage([200, 200]);
  const xfa = doc.context.register(doc.context.stream('Preserved original XFA bytes'));
  doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(doc.context.obj({ Fields: [], XFA: xfa })));
  const getForm = vi.spyOn(doc, 'getForm'), directory = await mkdtemp(join(tmpdir(), 'empty-combed-untouched-'));
  try {
    const path = join(directory, 'untouched.pdf'); await savePdf(doc, path);
    expect(getForm).not.toHaveBeenCalled();
    const reopened = await PDFDocument.load(await readFile(path));
    expect(reopened.catalog.getAcroForm()?.dict.get(PDFName.of('XFA'))?.toString()).toBe(xfa.toString());
    expect(contents(reopened)).toContain('Preserved original XFA bytes');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
