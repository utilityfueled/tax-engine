// Spec: spec/federal/guided-adoption-prior-benefits.yaml.
import { expect, test } from '@playwright/test';
import { actualGuidedAdoptionHistory } from '../../../tests/fixtures/guided-adoption-prior-benefits';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic adoption employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '100000', federalWithheld: '0',
  socialSecurityWages: '102000', socialSecurityTips: '0', socialSecurityWithheld: '6324', medicareWages: '102000', medicareWithheld: '1479',
  box10DependentCareBenefits: '0', box12CodeW: '0', box12CodeT: '2000', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Historical adoption at ${viewport.width}px`, () => {
    test('preserves actual historical adoption benefit records', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2, adoption }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 3, completedSections: ['personal-info', 'income-w2', 'deductions'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, credits: {
            dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '',
              roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, adoption,
          } } }));
      }, { id, personal, w2, adoption: actualGuidedAdoptionHistory() });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
      const taxable = page.locator('.guided-ticker-breakdown-row').filter({ hasText: 'Taxable Income' }); await expect(taxable).toContainText('$76,250');
      await page.getByRole('textbox', { name: 'Historical benefit worksheet reference', exact: true }).fill('synthetic-private-adoption-history');
      const allocated = page.getByRole('textbox', { name: 'Prior benefit 1 amount allocated to this child', exact: true }); await allocated.fill('7999.10');
      await page.getByRole('textbox', { name: 'Prior-year foreign-adoption employer benefits', exact: true }).fill('7999.10'); await allocated.press('Tab');
      const confirmed = page.getByRole('combobox', { name: 'Historical benefit sources checked after the last edit', exact: true });
      await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await confirmed.selectOption('true'); await expect(taxable).toContainText('$76,251');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.adoption?.children?.[0]?.priorYearForeignBenefitHistory?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await expect(allocated).toHaveValue('7,999.10'); await expect(confirmed).toHaveValue('true');
      await expect(page.getByRole('textbox', { name: 'Prior benefit 1 original benefits', exact: true })).toHaveValue('8000.10');
      const included = page.getByRole('combobox', { name: 'Prior benefit 1 allocated amount was included in prior income', exact: true });
      await included.selectOption('false'); await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.adoption?.children?.[0]?.priorYearForeignBenefitHistory?.records?.[0]?.allocatedBenefitsIncludedInPriorIncome, id)).toBe(false);
      await included.selectOption('true'); await confirmed.selectOption('true'); await expect(hero).not.toHaveText('Enter more info for an estimate');
      await allocated.fill(''); await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.adoption?.children?.[0]?.priorYearForeignBenefitHistory?.records?.[0]?.benefitsAllocatedToChild, id)).toBe('');
      await page.reload(); await expect(allocated).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.credits?.adoption?.children?.[0], id);
      expect(saved.priorYearForeignBenefits).toBe('7,999.10'); expect(saved.priorYearForeignBenefitHistory.records[0].sourceId).toBe('Actual original adoption statement-A');
      expect(saved.priorYearForeignBenefitHistory.records[0].originalEmployerBenefits).toBe('8000.10'); expect(saved).not.toHaveProperty('adoptionIncomeAdjustment');
      await allocated.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`adoption-prior-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-adoption-history', 'Actual original adoption statement-A', personal.ssn, '345-67-8901']) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
