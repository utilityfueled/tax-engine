// Spec: spec/federal/cod-ordinary-attribute-sources.yaml browser.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const original = JSON.parse(readFileSync(new URL('../../../tests/fixtures/cod-ordinary-attributes-browser.json', import.meta.url), 'utf8'));
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual later attributes at ${viewport.width}px`, () => {
    test('retains actual later attributes through edits and the partial review download', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = structuredClone(original);
      state.currentSectionIndex = 2; state.completedSections = ['personal-info', 'income-w2'];
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByText('Canceled debt and insolvency', { exact: true }).click();
      await page.getByText('Later tax attributes and property basis', { exact: true }).click();
      const money = page.getByRole('textbox', { name: 'Regular immediately after money', exact: true });
      await expect(money).toHaveValue('600'); await money.fill(''); await money.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload();
      await page.getByText('Canceled debt and insolvency', { exact: true }).click();
      await page.getByText('Later tax attributes and property basis', { exact: true }).click();
      await expect(money).toHaveValue('');
      await money.fill('0'); await money.press('Tab');
      await expect(money).toHaveValue('0');
      await money.fill('600'); await money.press('Tab');
      const confirmations = ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit',
        'Current adjustments sources checked after the last edit'];
      for (const prefix of ['Regular', 'Alternative']) {
        for (const date of ['immediately after', 'following year']) {
          for (const index of [1, 2]) confirmations.push(`${prefix} ${date} property ${index} sources checked after the last edit`);
        }
        confirmations.push(`${prefix} immediately-after inventory sources checked after the last edit`,
          `${prefix} following-year inventory sources checked after the last edit`, `${prefix} attribute ledger sources checked after the last edit`);
      }
      confirmations.push('Later-attribute packet checked after the last edit', 'Canceled-debt packet checked after the last edit');
      for (const name of confirmations) {
        const field = page.getByRole('combobox', { name, exact: true }); await expect(field).toHaveValue(''); await field.selectOption('true');
      }
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      // Current tax facts must be reconfirmed through the actual later panel.
      for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      const payment = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
      await expect(payment).toHaveValue(''); await payment.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      const label = String(viewport.width);
      await page.screenshot({ path: testInfo.outputPath(`cod-ordinary-source-${label}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const workspace = await page.evaluate(id => JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id], id);
      writeFileSync(testInfo.outputPath(`cod-ordinary-original-${label}.json`), JSON.stringify(saved, null, 2) + '\n');
      writeFileSync(testInfo.outputPath(`cod-ordinary-workspace-${label}.json`), JSON.stringify(workspace, null, 2) + '\n');
      expect(saved.sectionData.adjustments.codNolSources.attributeSources).toEqual(original.sectionData.adjustments.codNolSources.attributeSources);
      expect(saved.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBe(true);
      // W2/cancelled-debt segmentation does not include the investment/K1 other-taxes route.
      expect(saved.segmentation).toEqual(original.segmentation);
      expect(saved.completedSections).toEqual(expect.arrayContaining(['personal-info', 'income-w2', 'adjustments', 'deductions', 'credits', 'payments', 'review', 'final-review']));
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const download = page.waitForEvent('download');
      const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`cod-ordinary-review-${label}.pdf`); await (await download).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Packet completeness status: partial.', 'Form 982 is included as a reference summary',
        'Regular immediately-after basis cap: 100', 'Regular remaining property basis: 5400',
        'Regular unreduced excluded debt: 1400']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'Original account-A', 'Original statement-A', '12-3456789', 'Fictional furniture']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => ['123-45-6789', 'Original statement-A'].some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`cod-ordinary-review-${label}.png`) });
    });
  });
}
