// Spec: spec/federal/current-minimum-tax-credit-sources.yaml browser-output.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const original = JSON.parse(readFileSync(new URL('../../../tests/fixtures/current-minimum-tax-credit-browser.json', import.meta.url), 'utf8'));
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Current MTC originals at ${viewport.width}px`, () => {
    test('retains actual signed MTC originals through edit reload and review download', async ({ page }, testInfo) => {
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
      await expect(hero).toHaveText('$56,906');
      const openSources = async () => {
        await page.getByText('Canceled debt and insolvency', { exact: true }).click();
        await page.getByText('Later tax attributes and property basis', { exact: true }).click();
      };
      await openSources();
      const money = page.getByRole('textbox', { name: 'Current MTC K1 statement 1 depreciation adjustment', exact: true });
      await expect(money).toHaveValue('-200000'); await money.fill(''); await money.press('Tab');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await openSources(); await expect(money).toHaveValue('');
      await money.fill('-200000'); await money.press('Tab');
      const confirmations = ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit',
        'Current MTC K1 statement 1 sources checked after the last edit', 'Current MTC NOL sources checked after the last edit',
        'Current exclusion-only foreign sources checked after the last edit', 'Current MTC sources checked after the last edit',
        'Current adjustments sources checked after the last edit',
        'Regular attribute 1 sources checked after the last edit', 'Regular attribute 2 sources checked after the last edit'];
      for (const prefix of ['Regular', 'Alternative']) confirmations.push(`${prefix} immediately-after inventory sources checked after the last edit`,
        `${prefix} following-year inventory sources checked after the last edit`, `${prefix} attribute ledger sources checked after the last edit`);
      confirmations.push('Later-attribute packet checked after the last edit', 'Canceled-debt packet checked after the last edit');
      for (const name of confirmations) {
        const field = page.getByRole('combobox', { name, exact: true }); await expect(field).toHaveValue(''); await field.selectOption('true');
      }
      await expect(page.getByRole('combobox', { name: 'Current adjustments no additional deferral items for the zero-credit method', exact: true })).toHaveValue('false');
      await expect(page.getByRole('combobox', { name: 'Current MTC K1 statement 1 passive activity', exact: true })).toHaveValue('false');
      const rect = await money.boundingBox(); expect(rect).not.toBeNull(); expect(rect!.width).toBeGreaterThanOrEqual(180);
      await money.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current-mtc-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      for (let step = 0; step < 8 && !(await page.getByRole('heading', { name: 'Payments & Withholding', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      const payment = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
      await expect(payment).toHaveValue(''); await payment.selectOption('true');
      await expect(hero).toHaveText('$56,906'); await page.reload(); await expect(hero).toHaveText('$56,906');
      for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const workspace = await page.evaluate(id => JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id], id);
      writeFileSync(testInfo.outputPath(`current-mtc-original-${viewport.width}.json`), JSON.stringify(saved, null, 2) + '\n');
      writeFileSync(testInfo.outputPath(`current-mtc-workspace-${viewport.width}.json`), JSON.stringify(workspace, null, 2) + '\n');
      const expectedSavedAttributes = structuredClone(original.sectionData.adjustments.codNolSources.attributeSources);
      // CurrencyField persists the established grouped display after blur. Only
      // that presentation changes; every original identity/amount/flag remains bound.
      expectedSavedAttributes.currentMinimumTaxCredit.sourceYearCalculation.k1Statements[0].depreciationAdjustment = '-200,000';
      expect(saved.sectionData.adjustments.codNolSources.attributeSources).toEqual(expectedSavedAttributes);
      expect(saved.sectionData.adjustments.netOperatingLossSources.alternativeTax.regularBasisAndLossLimitsSameAsAlternativeConfirmed).toBe(false);
      expect(saved.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBe(true);
      expect(saved.completedSections).toEqual(expect.arrayContaining(['personal-info', 'income-w2', 'adjustments', 'deductions', 'credits', 'payments', 'review', 'final-review']));
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const download = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`current-mtc-review-${viewport.width}.pdf`); await (await download).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Packet completeness status: partial.', 'Signed current-year minimum tax credit adjustment: -41639',
        'Current full Form8801 credit used: 10361', 'Beginning-next-year minimum tax credit before COD: 18000',
        'Minimum tax credit aggregate after COD: 17900', 'Current-source PartI line18: -41639']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'adjustment-original-A']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => ['123-45-6789', 'adjustment-original-A'].some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current-mtc-review-${viewport.width}.png`) });
    });
  });
}
