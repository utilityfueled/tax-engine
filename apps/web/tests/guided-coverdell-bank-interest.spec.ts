// Spec: spec/federal/guided-coverdell-bank-interest.yaml visible-originals.
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { guidedCoverdellBankInterestState } from '../../../tests/fixtures/guided-coverdell-bank-interest';
import { conversionBooleanFields, conversionMoneyFields } from '../src/lib/guided-coverdell-bank-interest';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { calculateFederalTax, parseInput } from '../../../src/index';

const protectedScopes = [
  ['filledReturn', /^\/api\/workspace\/filled-return\/?$/u],
  ['provider', /^\/api\/(?:provider(?:\/.*)?|workspace\/tax-explanation)\/?$/u],
  ['businessExpenseAnalysis', /^\/api\/business-expense-analysis\/?$/u],
  ['selfEmploymentIncomeAnalysis', /^\/api\/self-employment-income-analysis\/?$/u],
] as const;
function decoded(value: string): string { try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; } }

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Coverdell converted bank originals at ${viewport.width}px`, () => {
    test('types actual bank conversion originals, reports interest once and invalidates edits', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [], errors: string[] = [], downloads: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('download', download => downloads.push(download.suggestedFilename()));
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const state = guidedCoverdellBankInterestState();
      expect(state.sectionData.credits?.educationDistributions?.forms?.[0]?.bankInterestConversion).toBeUndefined();
      expect(state.sectionData['income-investments']?.interestEntries[0]?.paDirectObligationInterest).toBeUndefined();
      await page.evaluate(({ id, state }) => { localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true'); localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state)); }, { id, state });
      await page.reload(); await expect(page.getByRole('heading', { name: 'Investment Income', exact: true })).toBeVisible();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByText('Remaining actual 1099-INT boxes', { exact: true }).click();
      const pa = page.getByRole('textbox', { name: 'Actual PA direct-obligation interest allocation Use the actual allocation, including 0 when established. Leave unknown amounts blank.', exact: true });
      await expect(pa).toHaveValue(''); await pa.fill('0'); await pa.press('Tab');
      for (let step = 0; step < 6 && !(await page.getByRole('heading', { name: 'Tax Credits', exact: true }).isVisible()); step++) await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tax Credits', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add actual January 1 bank conversion', exact: true }).click();
      const choice = (name: string) => page.getByRole('combobox', { name, exact: true });
      const field = (name: string) => page.getByRole('textbox', { name, exact: true });
      const review = choice('Bank conversion and original INT sources checked after the last edit');
      await expect(choice('Actual records establish an ordinary domestic bank deposit')).toHaveValue('');
      await expect(field('Actual later fees')).toHaveValue('');
      await review.selectOption('true');
      await choice('All education sources and allocations checked after the last edit').selectOption('true');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tax Credits', exact: true })).toBeVisible();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await field('Full-year bank and custody source reference').fill('Fictional complete January1 conversion and full-year bank ledger');
      await page.getByLabel('Actual custodian conversion date', { exact: true }).fill('2025-01-01');
      await field('Actual custodian conversion record reference').fill('Fictional actual January1 taxable deposit conversion');
      for (const [, label] of conversionBooleanFields) await choice(label).selectOption('true');
      const values = ['1000', '1100', '100', '0', '0', '0', '0', '0', '0', '0'];
      for (const [index, [, label]] of conversionMoneyFields.entries()) { await field(label).fill(values[index]); await field(label).press('Tab'); }
      await choice('Actual original bank 1099-INT already entered').selectOption('0');
      await expect(review).toHaveValue(''); await review.selectOption('true');
      await choice('All education sources and allocations checked after the last edit').selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate'); await expect(hero).toHaveText('$30');
      await page.reload(); await expect(page.getByRole('heading', { name: 'Tax Credits', exact: true })).toBeVisible();
      await expect(review).toHaveValue('true'); await expect(hero).toHaveText('$30');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const input = parseInput(buildTaxInputFromGuidedData(saved)), result = calculateFederalTax(input);
      expect(input.form1099Int).toHaveLength(1); expect(input.form1099Int[0].interestIncome).toBe('100');
      expect(input.form1099Q[0].postDisqualificationInterestSources?.originalIntIndex).toBe(0);
      expect(result.amountOwed.toFixed()).toBe('30'); expect(result.totalPayments.toFixed()).toBe('0'); expect(result.refund.toFixed()).toBe('0');
      expect(result.totalInterest.toFixed()).toBe('100'); expect(result.agi.toFixed()).toBe('400'); expect(result.totalTax.toFixed()).toBe('30');
      writeFileSync(testInfo.outputPath(`coverdell-bank-originals-${viewport.width}.json`), JSON.stringify(saved, null, 2) + '\n');
      await field('Actual full-year closing bank cash').fill('1101'); await field('Actual full-year closing bank cash').press('Tab');
      await expect(review).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(review).toHaveValue(''); await expect(field('Actual full-year closing bank cash')).toHaveValue('1,101');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await field('Actual full-year closing bank cash').fill('1100'); await field('Actual full-year closing bank cash').press('Tab');
      await review.selectOption('true'); await choice('All education sources and allocations checked after the last edit').selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate'); await expect(hero).toHaveText('$30');
      await page.screenshot({ path: testInfo.outputPath(`coverdell-bank-originals-${viewport.width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const counts = Object.fromEntries(protectedScopes.map(([name, pattern]) => [name, requests.filter(request => pattern.test(new URL(request.url).pathname)).length]));
      expect(counts).toEqual({ filledReturn: 0, provider: 0, businessExpenseAnalysis: 0, selfEmploymentIncomeAnalysis: 0 });
      for (const request of requests) for (const secret of ['123-45-6789', 'Fictional actual January1 taxable deposit conversion', 'Fictional converted taxable cash account'])
        for (const value of [request.url, request.body, decoded(request.url), decoded(request.body)]) expect(value).not.toContain(secret);
      expect(downloads).toEqual([]); expect(errors).toEqual([]);
      await testInfo.attach('coverdell-bank-request-census.json', { body: JSON.stringify({ counts, paths: requests.map(request => new URL(request.url).pathname), errors, downloads }), contentType: 'application/json' });
    });
  });
}
