// Spec: spec/federal/charitable-cod-modified-composition.yaml browser.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { charitableCodGuidedSources } from '../../../tests/fixtures/charitable-cod-guided-sources';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Determined charitable COD at ${viewport.width}px`, () => {
    test('preserves determined charitable COD sources through save reload and review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = charitableCodGuidedSources();
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 4,
        completedSections: ['personal-info', 'income-w2', 'income-self-employment', 'income-investments'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss', 'cancelled-debt'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [sources.w2] }, 'income-self-employment': sources.business,
          'income-investments': { interestEntries: [sources.interest], dividendEntries: [], brokerageEntries: [] },
          deductions: sources.deductions, payments: sources.payments,
          adjustments: { netOperatingLossSources: sources.prior, currentLossOrigin: sources.current, codNolSources: sources.cod } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByText('Canceled debt and insolvency', { exact: true }).click();
      const amount = page.getByRole('textbox', { name: 'Debt 1 Box 2 canceled debt', exact: true });
      const interest = page.getByRole('textbox', { name: 'Debt 1 Box 3 interest included', exact: true });
      await expect(interest).toHaveValue('0');
      await expect(page.getByRole('combobox', { name: 'Debt was discharged in a title 11 bankruptcy case', exact: true })).toHaveValue('false');
      await amount.fill('5001'); await amount.press('Tab');
      await interest.fill(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await page.getByText('Canceled debt and insolvency', { exact: true }).click();
      await expect(interest).toHaveValue(''); await expect(amount).toHaveValue('5,001');
      await interest.fill('0'); await interest.press('Tab');
      for (const name of ['Debt 1 sources checked after the last edit', 'Insolvency worksheet checked after the last edit', 'Canceled-debt packet checked after the last edit']) {
        const field = page.getByRole('combobox', { name, exact: true }); await expect(field).toHaveValue(''); await field.selectOption('true');
      }
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      for (const name of ['Charitable carryover sources checked after the last edit', 'Charitable carry histories checked after the last edit',
        'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit',
        'Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit', 'Current loss sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Deductions', exact: true })).toBeVisible();
      await page.getByText('Charitable contributions carried from earlier years', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true }).selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      const paymentConfirmation = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
      await expect(paymentConfirmation).toHaveValue(''); await paymentConfirmation.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const label = String(viewport.width);
      writeFileSync(testInfo.outputPath(`charitable-cod-original-${label}.json`), JSON.stringify(saved, null, 2) + '\n');
      expect(saved.sectionData.adjustments.codNolSources.debts[0].amountDischarged).toBe('5,001');
      expect(saved.sectionData.adjustments.codNolSources.debts[0].interestIncluded).toBe('0');
      expect(saved.sectionData.adjustments.netOperatingLossSources.vintages).toEqual(sources.prior.vintages);
      expect(saved.sectionData.deductions.charitableCarryoverSources.vintages[0].openingCarryforward).toBe('50000');
      expect(saved.sectionData.payments.estimatedTaxFacts.priorYearTaxForForm2210).toBe('3000');
      expect(saved.sectionData.payments.estimatedTaxFacts.priorYearAgiForForm2210).toBe('100000');
      expect(saved.sectionData.payments.estimatedTaxFacts.returnPayments).toEqual([]);
      expect(saved.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBe(true);
      await page.reload(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.screenshot({ path: testInfo.outputPath(`charitable-cod-source-${label}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Visit each remaining section using the actual navigation controls.
      for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`charitable-cod-review-${label}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Packet completeness status: partial.', 'Regular NOL before COD: claimed 39200',
        'Regular COD: before 60800; reduction 5001; expiry 0; remaining 55799',
        'Alternative COD: before 15400; reduction 5001; expiry 0; remaining 10399',
        'Regular COD charitable comparison: before 51392; remaining 46391; original NOL difference 9408; after COD difference 9408']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', 'Original account-A', 'Original statement-A', '12-3456789']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => ['111-22-3333', 'Original statement-A'].some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`charitable-cod-review-${label}.png`) });
    });
  });
}
