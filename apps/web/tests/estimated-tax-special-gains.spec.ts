// Spec: spec/federal/form-2210-special-gains-browser.yaml visible-originals.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { guidedEstimatedTaxSpecialGainsState, actualSpecialRatePeriodAmounts, independentlyDerivedPeriodTaxes } from '../../../tests/fixtures/guided-estimated-tax-special-gains';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { calculateFederalTax, parseInput } from '../../../src/index';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Schedule AI special originals at ${viewport.width}px`, () => {
    test('collects all special-rate period originals and rejects stale review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = guidedEstimatedTaxSpecialGainsState();
      for (const row of state.sectionData.payments!.estimatedTaxFacts!.annualizedIncomePeriods!) {
        expect(row.rate28GainLoss).toBeUndefined(); expect(row.unrecaptured1250BeforeLosses).toBeUndefined();
      }
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Add actual special-rate period worksheets', exact: true }).click();
      const specialConfirmed = page.getByRole('combobox', { name: 'All four special-rate original period worksheets checked after the last edit', exact: true });
      const allConfirmed = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
      await expect(specialConfirmed).toHaveValue('');
      for (let i = 0; i < 4; i++) {
        for (const label of ['Signed 28% worksheet sum of lines 1 through 6, including capital losses', 'Unrecaptured section 1250 worksheet line 13 before capital losses']) {
          await expect(page.getByRole('textbox', { name: `Period ${i + 1}: ${label}`, exact: true })).toHaveValue('');
        }
      }
      await specialConfirmed.selectOption('true'); await allConfirmed.selectOption('true');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
      await expect(page.getByRole('listitem').filter({ hasText: /^Enter the actual period 1 signed 28%/ })).toBeVisible();
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (let i = 0; i < 4; i++) {
        await page.getByRole('textbox', { name: `Period ${i + 1}: Signed 28% worksheet sum of lines 1 through 6, including capital losses`, exact: true }).fill(actualSpecialRatePeriodAmounts[i]![0]);
        await page.getByRole('textbox', { name: `Period ${i + 1}: Unrecaptured section 1250 worksheet line 13 before capital losses`, exact: true }).fill(actualSpecialRatePeriodAmounts[i]![1]);
      }
      await expect(specialConfirmed).toHaveValue(''); await expect(allConfirmed).toHaveValue('');
      await specialConfirmed.selectOption('true'); await allConfirmed.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(specialConfirmed).toHaveValue('true'); await expect(allConfirmed).toHaveValue('true');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const originalRows = saved.sectionData.payments.estimatedTaxFacts.annualizedIncomePeriods;
      expect(originalRows.map((row: { rate28GainLoss: string; unrecaptured1250BeforeLosses: string }) => [row.rate28GainLoss.replace(/,/g, ''), row.unrecaptured1250BeforeLosses.replace(/,/g, '')])).toEqual(actualSpecialRatePeriodAmounts);
      const input = parseInput(buildTaxInputFromGuidedData(saved)), result = calculateFederalTax(input);
      expect(result.agi.toFixed()).toBe('240000'); expect(result.taxableIncome.toFixed()).toBe('208500'); expect(result.totalTax.toFixed()).toBe('35194');
      expect(result.form8959?.additionalMedicareTax.toFixed()).toBe('0'); expect(result.form8959?.withholdingCredit.toFixed()).toBe('241');
      expect(['a', 'b', 'c', 'd'].map(column => result.form2210?.lines.find(row => row.form === 'Form 2210 Schedule AI' && row.line === `14${column}`)?.value.toFixed())).toEqual(independentlyDerivedPeriodTaxes);
      writeFileSync(testInfo.outputPath(`special-period-originals-${viewport.width}.json`), JSON.stringify(saved, null, 2) + '\n');
      for (let step = 0; step < 5 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const download = page.waitForEvent('download');
      const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const path = testInfo.outputPath(`special-period-review-${viewport.width}.pdf`); await (await download).saveAs(path);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', 'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
      for (const text of pages) expect(text.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      const text = pages.join(' ').replace(/\s+/g, ' '); expect(text).toContain('Form 2210');
      for (const [index, column] of ['a', 'b', 'c', 'd'].entries()) {
        expect(text).toContain(`Schedule AI line 14${column}: Tax on annualized income ${independentlyDerivedPeriodTaxes[index]}`);
      }
      for (const secret of ['111-22-3333', '111223333', '222-33-4444', 'Fictional four cumulative fund/payroll worksheets']) expect(text).not.toContain(secret);
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`special-period-review-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: /start guided interview/i }).click();
      for (let step = 0; step < 5 && !(await page.getByRole('heading', { name: 'Payments & Withholding', exact: true }).isVisible()); step++) await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('textbox', { name: 'Period 4: Unrecaptured section 1250 worksheet line 13 before capital losses', exact: true }).fill('4001');
      await expect(specialConfirmed).toHaveValue(''); await expect(allConfirmed).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(specialConfirmed).toHaveValue(''); await expect(allConfirmed).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Period 4: Unrecaptured section 1250 worksheet line 13 before capital losses', exact: true })).toHaveValue('4001');
      await expect(hero).toHaveText('Enter more info for an estimate');
      for (const request of requests.filter(request => ['111-22-3333', 'Fictional four cumulative fund/payroll worksheets'].some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
    });
  });
}
