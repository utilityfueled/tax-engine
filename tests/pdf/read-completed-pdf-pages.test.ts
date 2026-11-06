import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { readCompletedPdfPages } from './read-completed-pdf-pages.js';

async function savePages(path: string, texts: string[]): Promise<void> {
  const doc = await PDFDocument.create();
  for (const text of texts) doc.addPage().drawText(text);
  await writeFile(path, await doc.save());
}

it('retains completed-file order, duplicate paths, and every page in independent parsing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'completed-pdf-reader-'));
  try {
    const first = join(directory, 'first with spaces.pdf'), second = join(directory, 'second.pdf');
    await savePages(first, ['First document page one', 'First document page two']);
    await savePages(second, ['Second document only page']);
    const pages = readCompletedPdfPages([second, first, second], 5000);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toEqual(pages[2]);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0]?.[0]).toContain('Second document only page');
    expect(pages[1]).toHaveLength(2);
    expect(pages[1]?.[0]).toContain('First document page one');
    expect(pages[1]?.[1]).toContain('First document page two');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('propagates missing and malformed later files without returning a partial first result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'completed-pdf-reader-failure-'));
  try {
    const valid = join(directory, 'valid.pdf'), invalid = join(directory, 'invalid.pdf');
    await savePages(valid, ['Valid earlier result']);
    await writeFile(invalid, 'Not a PDF');
    expect(() => readCompletedPdfPages([valid, join(directory, 'missing.pdf')], 5000)).toThrow(/missing\.pdf/);
    expect(() => readCompletedPdfPages([valid, invalid], 5000)).toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
