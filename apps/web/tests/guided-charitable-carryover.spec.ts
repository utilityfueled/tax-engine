// Spec: spec/federal/guided-charitable-carryover.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedCharitableCarryover } from '../../../tests/fixtures/guided-charitable-carryover';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic charitable carry employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0',
  socialSecurityWages: '100000', socialSecurityTips: '0', socialSecurityWithheld: '6200', medicareWages: '100000', medicareWithheld: '1450',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Charitable history at ${viewport.width}px`, () => {
    test('preserves actual charitable carryover records', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2, sources }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, deductions: {
            method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0', charitableContributions: '0',
            casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0', nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [],
            charitableCarryoverSources: sources,
          } } }));
      }, { id, personal, w2, sources: actualGuidedCharitableCarryover() });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      const taxable = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' });
      await expect(taxable).toContainText('$40,000');
      const open = () => page.getByText('Charitable contributions carried from earlier years', { exact: true }).click(); await open();
      await page.getByRole('textbox', { name: 'Charitable carryover packet reference', exact: true }).fill('synthetic-private-charitable-history');
      await page.getByRole('textbox', { name: 'Contribution 1 original excess', exact: true }).fill('61999.10');
      const opening = page.getByRole('textbox', { name: 'Contribution 1 opening carryforward', exact: true }); await opening.fill('59999.10'); await opening.press('Tab');
      await expect(opening).toHaveValue('59,999.10');
      const confirmed = page.getByRole('combobox', { name: 'Charitable carryover sources checked after the last edit', exact: true });
      await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await confirmed.selectOption('true'); await expect(taxable).toContainText('$40,001');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.charitableCarryoverSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await open(); await expect(opening).toHaveValue('59,999.10'); await expect(confirmed).toHaveValue('true');
      await expect(page.getByRole('textbox', { name: 'Contribution 1 history 1 treated as paid', exact: true })).toHaveValue('1400');
      await expect(page.getByRole('textbox', { name: 'Contribution 1 origin NOL reduction', exact: true })).toHaveValue('500');
      const ordinary = page.getByRole('combobox', { name: 'Contribution 1 ordinary percentage method confirmed', exact: true });
      await ordinary.selectOption('false'); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.charitableCarryoverSources?.vintages?.[0]?.ordinaryPercentageMethodConfirmed, id)).toBe(false);
      await ordinary.selectOption('true'); await confirmed.selectOption('true');
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await opening.fill(''); await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.charitableCarryoverSources?.vintages?.[0]?.openingCarryforward, id)).toBe('');
      await page.reload(); await open(); await expect(opening).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.charitableCarryoverSources, id);
      expect(saved.vintages[0].sourceId).toBe('Original charitable source-A');
      expect(saved.vintages[0].originalExcess).toBe('61,999.10');
      expect(saved.vintages[0].history).toEqual([{ taxYear: '2024', treatedAsPaid: '1400', nolReduction: '100', sourceReference: 'Actual 2024 return and carry worksheet' }]);
      expect(saved).not.toHaveProperty('deduction'); expect(saved).not.toHaveProperty('contributionBase');
      await opening.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`charitable-carryover-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-charitable-history', 'Original charitable source-A', 'Actual 2024 return and carry worksheet', personal.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
