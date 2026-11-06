import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEncryptedRecoveryOriginals } from './helpers/encrypted-recovery-review';
import { fillRequiredTaxpayerFacts, fillRequiredW2Facts, reachFilingStatus } from './guided-fixtures';

// Explicit synthetic suggestions attached to a BLANK IRS template; never extracted taxpayer truth.
// Independent pre-output oracle: 52000 - 15750 = 36250; official2025Single table36250–36300=4115;5000-4115=885.
const original = { firstName: 'Avery', lastName: 'Lifecycle', ssn: '900-70-0311', wages: '52000', withholding: '5000', taxable: '36250', tax: '4115', refund: '$885' };
const sourcePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../sample-documents/downloads/irs-w2-2025.pdf');
const backupPassword = 'synthetic-lifecycle-backup-password';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');


/** Choose a shorter native tab direction from read-only DOM order; never assign focus. */
async function keyboardActivate(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  const keys: string[] = [];
  for (let steps = 0; steps < 100; steps++) {
    const state = await target.evaluate(element => {
      if (document.activeElement === element) return { focused: true, reverse: false };
      const order = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]')
          && node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible')
        .map((node, index) => ({ node, index, priority: node.tabIndex > 0 ? node.tabIndex : Infinity }))
        .sort((a, b) => a.priority - b.priority || a.index - b.index);
      const targetIndex = order.findIndex(item => item.node === element);
      if (targetIndex < 0) throw new Error('Critical lifecycle control is absent from the native tab order');
      const activeIndex = order.findIndex(item => item.node === document.activeElement);
      const forward = activeIndex < 0 ? targetIndex + 1 : (targetIndex - activeIndex + order.length) % order.length;
      const reverse = activeIndex < 0 ? order.length - targetIndex : (activeIndex - targetIndex + order.length) % order.length;
      return { focused: false, reverse: reverse < forward };
    });
    if (state.focused) {
      await page.keyboard.press('Enter'); return { steps, traversalKeys: keys, activation: 'Enter' as const };
    }
    const key = state.reverse ? 'Shift+Tab' : 'Tab';
    keys.push(key); await page.keyboard.press(key);
  }
  throw new Error('Critical lifecycle action was not reachable within 100 natural Tab steps');
}

async function stored(page: Page, id: string) {
  return page.evaluate((id) => ({
    guidedRaw: localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`),
    guidedMode: localStorage.getItem(`tax-engine:guided-mode:${id}`),
    workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id],
    keys: Object.keys(localStorage).filter(key => key.includes(id)),
  }), id);
}
async function cachedFiles(page: Page) {
  const files = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some(db => db.name === 'tax-engine-workspace-document-cache')) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tax-engine-workspace-document-cache', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ workspaceId: string; documentId: string; fileName: string; mediaType: string; lastModified: number; file: Blob }>>((resolve, reject) => {
      const request = db.transaction('workspace-document-files', 'readonly').objectStore('workspace-document-files').getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); db.close();
    // Lossless transport avoids serializing more than a million separate byte integers.
    return Promise.all(records.map(async record => {
      const bytes = new Uint8Array(await record.file.arrayBuffer()); let binary = '';
      for (let start = 0; start < bytes.length; start += 16384) binary += String.fromCharCode(...bytes.subarray(start, start + 16384));
      return { workspaceId: record.workspaceId, documentId: record.documentId, fileName: record.fileName, type: record.mediaType, lastModified: record.lastModified, bytesBase64: btoa(binary) };
    }));
  });
  return files.map(({ bytesBase64, ...record }) => ({ ...record, bytes: Buffer.from(bytesBase64, 'base64') }));
}
async function completeSegmentation(page: Page) {
  await reachFilingStatus(page);
  await page.getByRole('radio', { name: /^single/i }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /w-2 wages/i }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText(/did any of these happen/i)).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /state of residence/i })).toHaveValue('');
  await page.getByRole('button', { name: /start my return/i }).click();
}
async function estimate(page: Page) {
  const ticker = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: /live ticker/i }) });
  await expect(ticker.locator('.guided-ticker-item-hero .guided-ticker-value-hero')).toHaveText(original.refund);
  await expect(page.getByText(/filing exports are not yet qualified/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /download completed return/i })).toHaveCount(0);
}

for (const width of [1280, 390]) test(`complete unseeded local upload/review/recovery/delete lifecycle ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const started = performance.now();
  const stageTimes: { stage: string; elapsedMS: number; durationMS?: number; inspectorMS?: number }[] = [];
  const mark = (stage: string) => stageTimes.push({ stage, elapsedMS: performance.now() - started });
  const requests: { url: string; body: string }[] = [];
  page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
  const bytes = await readFile(sourcePath), sourceSha256 = sha(bytes);
  const evidence = async (name: string, value: unknown) => writeFile(testInfo.outputPath(name), JSON.stringify(value, null, 2));
  const keyboardActions: Awaited<ReturnType<typeof keyboardActivate>>[] = [];
  const activate = async (target: Locator) => { keyboardActions.push(await keyboardActivate(page, target)); };
  const downloadReview = async (name: string) => {
    const downloadStarted = performance.now();
    const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
    const download = page.waitForEvent('download');
    const response = page.waitForResponse(r => r.url().endsWith('/api/workspace/filled-return'));
    await activate(bundle.getByRole('button', { name: 'Download Review PDF', exact: true }));
    expect((await response).status()).toBe(200);
    const output = testInfo.outputPath(name); await (await download).saveAs(output);
    const inspectorStarted = performance.now();
    const inspected = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1],strict=True); blank=PdfReader(sys.argv[2],strict=True)
texts=[p.extract_text() or '' for p in r.pages]
assert r.get_fields() is None
for p,t in zip(r.pages,texts):
 assert 'FOR REVIEW ONLY - NOT FOR FILING' in t
 for a in p.get('/Annots',[]):
  obj=a.get_object(); assert obj is not None and obj.get('/Subtype')!='/Widget'
alltext='\\n'.join(texts)
for secret in ['900-70-0311','900700311']: assert secret not in alltext
first=next(i for i,t in enumerate(texts) if '1040' in t and 'Filing Status' in t)
# Printed cells from the official blank2025Form1040; amounts pinned independently before output.
expected={0:{'f1_47[0]':'52000','f1_75[0]':'52000'},1:{'f2_01[0]':'52000','f2_02[0]':'15750','f2_06[0]':'36250','f2_08[0]':'4115','f2_16[0]':'4115','f2_17[0]':'5000','f2_20[0]':'5000','f2_29[0]':'5000','f2_30[0]':'885','f2_31[0]':'885'}}
for templatepage,fields in expected.items():
 boxes={field:next([float(x) for x in a.get_object()['/Rect']] for a in blank.pages[templatepage]['/Annots'] if a.get_object().get('/T')==field) for field in fields}
 actual={field:[] for field in fields}
 def visit(text,cm,tm,font,size):
  for field,box in boxes.items():
   if abs(cm[4]-box[0])<.02 and abs(cm[5]-box[1])<.02 and text.strip(): actual[field].append(text.strip())
 r.pages[first+templatepage].extract_text(visitor_text=visit)
 for field,value in fields.items():
  values=actual[field]
  assert values==[value],(field,values,value)
print(json.dumps({'pages':len(texts),'physicalCells':12,'reviewNotices':len(texts),'fields':0,'widgets':0,'unresolvedAnnotations':0,'privateSsnPresent':False}))
`, output, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../forms/blank/2025/f1040.pdf')], { encoding: 'utf8', timeout: 10000 }));
    stageTimes.push({ stage: name, elapsedMS: performance.now() - started, durationMS: performance.now() - downloadStarted, inspectorMS: performance.now() - inspectorStarted });
    await evidence(name + '.inspection.json', inspected);
  };
  await page.goto('/');
  // Only initial clear/preference writes. No facts, results, completion stamps or cached files injected.
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tax-engine:guided-mode', 'true'); });
  await page.reload();
  let keyboardCreated = false;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    if (/start your tax return/i.test(await page.locator(':focus').textContent() ?? '')) {
      await page.keyboard.press('Enter'); keyboardCreated = true; break;
    }
  }
  expect(keyboardCreated).toBe(true);
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id) throw new Error('Created workspace URL has no ID');
  await completeSegmentation(page); mark('segmentation-complete');
  await page.getByRole('button', { name: /switch to advanced mode/i }).click();
  await page.locator('input[type="file"]').setInputFiles(sourcePath);
  await expect(page.getByText(/1 irs sample document loaded/i)).toBeVisible();
  await page.getByRole('button', { name: /get step-by-step help/i }).click();
  await fillRequiredTaxpayerFacts(page);
  await page.getByLabel('First name', { exact: true }).fill(original.firstName);
  await page.getByLabel('Last name', { exact: true }).fill(original.lastName);
  await page.getByRole('textbox', { name: /^Social Security number/ }).fill(original.ssn);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /review w-2 and sample suggestions/i }).click();
  await page.getByRole('button', { name: /insert sample values/i }).click();
  await expect(page.getByRole('button', { name: /confirm all \d+ highlighted sample values/i })).toBeVisible();
  await page.getByRole('button', { name: /confirm all \d+ highlighted sample values/i }).click();
  await fillRequiredW2Facts(page);
  const wage = page.getByRole('textbox', { name: /^Box 1 — Wages, tips, other comp/ });
  expect((await wage.inputValue()).replace(/,/g, '')).toBe(original.wages);
  await page.screenshot({ path: testInfo.outputPath('confirmed-w2.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Use only visible sequential controls, including the actual empty-payments skip prompt.
  for (let step = 0; step < 10; step++) {
    if (await page.getByRole('button', { name: /open full return/i }).isVisible()) break;
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const skip = page.getByRole('button', { name: /skip this section/i });
    if (await skip.isVisible()) await skip.click();
  }
  await page.getByRole('button', { name: /open full return/i }).click();
  await estimate(page); mark('initial-calculation-complete');
  const before = await stored(page, id);
  expect(before.guidedRaw).not.toBeNull();
  if (!before.guidedRaw) throw new Error('Completed interview did not save original answers');
  const guided = JSON.parse(before.guidedRaw);
  expect(guided.sectionData['personal-info'].ssn).toBe(original.ssn);
  expect(guided.sectionData['income-w2'].entries).toHaveLength(1);
  expect(guided.sectionData['income-w2'].entries[0].aiSuggestedFields).not.toEqual({});
  const originalFiles = await cachedFiles(page);
  expect(originalFiles).toHaveLength(1); expect(Buffer.from(originalFiles[0].bytes)).toEqual(bytes);
  await evidence('before-reopen.json', { id, ...before, sourceSha256, cached: originalFiles.map(({ bytes: contents, ...row }) => ({ ...row, sha256: sha(Buffer.from(contents)) })) });
  await downloadReview('initial-review.pdf');
  await page.goto('/');
  const card = page.getByRole('listitem').filter({ hasText: `Tax Return ${id}` });
  await activate(card.getByRole('link', { name: /continue tax return/i }));
  await expect(page).toHaveURL(new RegExp(`/returns/${id}(?:\\?local=1)?$`));
  await page.reload(); await estimate(page);
  expect((await stored(page, id)).guidedRaw).toBe(before.guidedRaw);
  await downloadReview('reopened-review.pdf');
  await page.goto('/');
  await card.getByText('Back up this return', { exact: true }).click();
  const password = card.getByLabel('Backup password (at least 12 characters)');
  await password.fill(backupPassword);
  await page.keyboard.press('Tab');
  const backupButton = card.getByRole('button', { name: 'Download encrypted backup', exact: true });
  await expect(backupButton).toBeFocused();
  const backupDownload = page.waitForEvent('download'); await page.keyboard.press('Enter');
  const backupPath = testInfo.outputPath('encrypted-full-backup.json'); await (await backupDownload).saveAs(backupPath);
  const encrypted = await readFile(backupPath, 'utf8'); mark('encrypted-backup-downloaded');
  assertEncryptedRecoveryOriginals(encrypted, backupPassword, { workspace: before.workspace, guidedFlowRaw: before.guidedRaw, guidedMode: before.guidedMode, files: originalFiles });
  await activate(card.getByRole('button', { name: `Delete tax return ${id}`, exact: true }));
  await expect(card).toHaveCount(0); await page.reload();
  expect((await stored(page, id)).guidedRaw).toBeNull(); expect((await stored(page, id)).workspace).toBeUndefined(); expect((await stored(page, id)).keys).toEqual([]); expect(await cachedFiles(page)).toEqual([]);
  const restore = page.locator('details').filter({ has: page.getByText('Restore an encrypted backup', { exact: true }) });
  await restore.getByText('Restore an encrypted backup', { exact: true }).click();
  await restore.getByLabel('Encrypted recovery file').setInputFiles(backupPath);
  await restore.getByLabel('Backup password (at least 12 characters)').fill('incorrect-synthetic-password');
  await restore.getByRole('button', { name: 'Restore as new local return', exact: true }).click();
  await expect(restore.getByRole('status')).toContainText('incorrect');
  expect(await page.getByRole('link', { name: /continue tax return/i }).count()).toBe(0); expect(await cachedFiles(page)).toEqual([]);
  await restore.getByLabel('Backup password (at least 12 characters)').fill(backupPassword);
  await page.keyboard.press('Tab');
  await expect(restore.getByRole('button', { name: 'Restore as new local return', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const restoredLink = restore.getByRole('link', { name: 'Open restored return', exact: true }); await expect(restoredLink).toBeVisible();
  const restoredHref = await restoredLink.getAttribute('href');
  const restoredId = restoredHref?.split('/').at(-1)?.split('?')[0];
  if (!restoredId) throw new Error('Recovery did not provide a new workspace ID');
  expect(restoredId).not.toBe(id);
  await restoredLink.click();
  await expect(page).toHaveURL(new RegExp(`/returns/${restoredId}\\?local=1$`));
  await page.reload(); await estimate(page);
  mark('restored-recalculation-complete');
  const recovered = await stored(page, restoredId); expect(recovered.guidedRaw).toBe(before.guidedRaw);
  const restoredFiles = await cachedFiles(page); expect(restoredFiles).toHaveLength(1); expect(restoredFiles[0].workspaceId).toBe(restoredId); expect(Buffer.from(restoredFiles[0].bytes)).toEqual(bytes);
  await evidence('after-recovery.json', { originalId: id, restoredId, ...recovered, sourceSha256, cached: restoredFiles.map(({ bytes: contents, ...row }) => ({ ...row, sha256: sha(Buffer.from(contents)) })) });
  await downloadReview('restored-review.pdf');
  await page.getByRole('region', { name: 'Return Bundle', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('restored-review.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  const restoredCard = page.getByRole('listitem').filter({ hasText: `Tax Return ${restoredId}` });
  await expect(restoredCard).toContainText('Restored local return — saved only on this device.');
  await activate(restoredCard.getByRole('button', { name: `Delete tax return ${restoredId}`, exact: true }));
  await expect(restoredCard).toHaveCount(0); await page.reload();
  expect((await stored(page, restoredId)).guidedRaw).toBeNull(); expect((await stored(page, restoredId)).workspace).toBeUndefined(); expect((await stored(page, restoredId)).keys).toEqual([]); expect(await cachedFiles(page)).toEqual([]);
  await evidence('after-deletion.json', { original: await stored(page, id), restored: await stored(page, restoredId), cached: await cachedFiles(page) });
  const origin = new URL(page.url()).origin;
  for (const request of requests) {
    expect(request.body).not.toContain(backupPassword); expect(request.body).not.toContain('incorrect-synthetic-password'); expect(request.body).not.toContain('%PDF-');
    if (request.body.includes(original.ssn)) { expect(new URL(request.url).origin).toBe(origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
    if (request.url.startsWith('http')) expect(new URL(request.url).origin).toBe(origin);
  }
  await evidence('requests.json', requests);
  await evidence('keyboard-actions.json', keyboardActions);
  mark('restored-deletion-and-privacy-complete');
  await evidence('stage-times.json', stageTimes);
});
