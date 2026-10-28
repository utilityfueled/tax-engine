// Spec: spec/federal/cod-empty-nol-foreign.yaml browser.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const original = JSON.parse(readFileSync(new URL('../../../tests/fixtures/cod-empty-nol-foreign-browser.json', import.meta.url), 'utf8'));
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Independent foreign histories at ${viewport.width}px`, () => {
    test('preserves independent AMT sources through edits and the actual partial download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = structuredClone(original); state.currentSectionIndex = 0; state.completedSections = [];
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      for (let step = 0; step < 6; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Other Taxes', exact: true })).toBeVisible();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const balance = page.getByRole('textbox', { name: 'AMT balance 1 adjusted amount', exact: true });
      const confirm = page.getByRole('combobox', { name: 'AMT carry sources checked after the last edit', exact: true });
      await expect(balance).toHaveValue('300'); await balance.fill(''); await balance.press('Tab');
      await expect(confirm).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(balance).toHaveValue('');
      await balance.fill('0'); await balance.press('Tab'); await expect(balance).toHaveValue('0');
      await balance.fill('300'); await balance.press('Tab');
      for (const name of ['AMT carry sources checked after the last edit', 'Carryover worksheet sources checked after the last edit', 'Foreign-tax election sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      // Foreign source edits invalidate the actual current-use and payment packets.
      for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByText('Canceled debt and insolvency', { exact: true }).click();
      await page.getByText('Later tax attributes and property basis', { exact: true }).click();
      const confirmations = ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit',
        'Current adjustments sources checked after the last edit'];
      for (const prefix of ['Regular', 'Alternative']) confirmations.push(`${prefix} attribute 1 sources checked after the last edit`,
        `${prefix} immediately-after inventory sources checked after the last edit`, `${prefix} following-year inventory sources checked after the last edit`,
        `${prefix} attribute ledger sources checked after the last edit`);
      confirmations.push('Later-attribute packet checked after the last edit', 'Canceled-debt packet checked after the last edit');
      for (const name of confirmations) {
        const field = page.getByRole('combobox', { name, exact: true }); await expect(field).toHaveValue(''); await field.selectOption('true');
      }
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Other Taxes', exact: true })).toBeVisible();
      await expect(balance).toHaveValue('300'); await expect(confirm).toHaveValue('true');
      await balance.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`cod-foreign-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      const payment = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
      await expect(payment).toHaveValue(''); await payment.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const workspace = await page.evaluate(id => JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id], id);
      writeFileSync(testInfo.outputPath(`cod-foreign-original-${viewport.width}.json`), JSON.stringify(saved, null, 2) + '\n');
      writeFileSync(testInfo.outputPath(`cod-foreign-workspace-${viewport.width}.json`), JSON.stringify(workspace, null, 2) + '\n');
      expect(saved.sectionData['other-taxes'].foreignTaxElection).toEqual(original.sectionData['other-taxes'].foreignTaxElection);
      expect(saved.sectionData.adjustments).toEqual(original.sectionData.adjustments);
      expect(saved.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBe(true);
      expect(saved.completedSections).toEqual(expect.arrayContaining(['personal-info', 'income-w2', 'income-investments', 'adjustments', 'deductions', 'credits', 'other-taxes', 'payments', 'review', 'final-review']));
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const download = page.waitForEvent('download');
      const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`cod-foreign-review-${viewport.width}.pdf`); await (await download).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Packet completeness status: partial.', 'Form 982 is included as a reference summary',
        'Regular total foreign credit carry after COD Value: 327', 'Alternative total foreign credit carry after COD Value: 145']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'Original account-A', 'Original statement-A', 'Private synthetic account A', '112233445']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => ['123-45-6789', 'Original statement-A'].some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`cod-foreign-review-${viewport.width}.png`) });
    });
  });
}
