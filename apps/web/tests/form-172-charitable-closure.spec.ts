// Spec: spec/federal/form-172-charitable-closure.yaml browser-originals.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { guidedCurrentCharitableOriginals } from '../../../tests/fixtures/guided-form-172-charitable-origin-sources';
import { currentOriginCryptoGift } from '../../../tests/fixtures/guided-form-172-charitable-closure-sources';
import { taxpayerFacts2025 } from './guided-fixtures';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Original charitable loss sources at ${viewport.width}px`, () => {
    test('preserves original donation facts and dependent current-loss confirmations', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const sources = guidedCurrentCharitableOriginals();
      const state = { factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 5,
        completedSections: ['personal-info', 'income-w2', 'income-self-employment', 'income-investments', 'adjustments', 'deductions', 'credits', 'payments', 'review', 'final-review'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'self-employment', 'investments'], lifeEvents: ['current-year-loss'], stateCode: null },
        sectionData: { 'personal-info': { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' },
          'income-w2': { entries: [sources.w2] }, 'income-self-employment': sources.business,
          'income-investments': { interestEntries: [sources.interest], dividendEntries: [], brokerageEntries: [] },
          adjustments: { netOperatingLossSources: sources.prior, currentLossOrigin: sources.current },
          deductions: { ...sources.deductions, charitableContributions: '0', donationEntries: [], cryptoDonations: [currentOriginCryptoGift()] } } };
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
      }, { id, state });
      await page.reload();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Deductions');
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByText('Digital assets donated to charity', { exact: true }).click();
      const basis = page.getByRole('textbox', { name: 'Digital-asset gift 1 original cost basis', exact: true });
      const checked = page.getByRole('combobox', { name: 'Digital-asset gift 1 checked after the last edit', exact: true });
      await basis.fill(''); await checked.selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await basis.fill('40,001.00'); await checked.selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Adjustments', exact: true }).click();
      await page.getByText('Net operating loss carry sources', { exact: true }).click();
      for (const name of ['Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      await page.getByText('Current-year net operating loss sources', { exact: true }).click();
      for (const name of ['Current business 1 sources checked after the last edit', 'Current AMT comparison checked after the last edit', 'Current loss sources checked after the last edit']) {
        await page.getByRole('combobox', { name, exact: true }).selectOption('true');
      }
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
      expect(saved.deductions.cryptoDonations[0].costBasis).toBe('40,001.00');
      expect(saved.deductions.cryptoDonations[0].quantity).toBe(currentOriginCryptoGift().quantity);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorRegularCarryovers).toEqual([]);
      expect(saved.adjustments.netOperatingLossSources.alternativeTax.charitableCarryoverHistory.priorAlternativeCarryovers).toEqual([]);
      for (const key of ['allowedDeduction', 'netOperatingLoss', 'agi']) expect(saved.deductions.cryptoDonations[0]).not.toHaveProperty(key);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Draft Return Bundle', exact: true });
      await expect(bundle).toContainText('It is not a filing copy');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(value => value.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true }).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`charitable-closure-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        "import sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))", output], { encoding: 'utf8' })) as string[];
      for (const value of ['57000', 'Current regular PartI loss 13000', 'Current alternative PartI loss 0']) expect(pages.join(' ')).toContain(value);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['111-22-3333', '111223333', 'Fictional independent current-origin charity histories']) expect(pages.join(' ')).not.toContain(secret);
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`charitable-closure-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
