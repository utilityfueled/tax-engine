// Spec: spec/federal/marketplace-health-business-gross-sources.yaml.
import { expect, test } from '@playwright/test';
import { guidedMarketplaceNegativeLimitRecords } from '../../../tests/fixtures/guided-marketplace-negative-limit-records';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', dateOfBirth: '1990-02-15',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true };
const wages = { entries: [{ employerName: 'Fictional Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '25000', federalWithheld: '0',
  socialSecurityWages: '25000', socialSecurityTips: '0', socialSecurityWithheld: '1550', medicareWages: '25000', medicareWithheld: '362.50',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none', state: '', stateWages: '', stateWithheld: '' }] };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) test.describe(`Actual signed partnership limit ${viewport.width}`, () => {
  test('retains actual partnership gross and signed health through edits and reload', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, wages, records }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2,
        completedSections: ['personal-info', 'income-w2'],
        segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources', 'self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-w2': wages,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '',
            healthInsuranceFacts: records.health, k1LossSources: records.k1 },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: records.coverage } } }));
    }, { id, personal, wages, records: guidedMarketplaceNegativeLimitRecords() });
    await page.reload();
    const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText('$43,586', { exact: true }).first()).toBeVisible();
    const reference = page.getByRole('textbox', { name: 'Gross statement 1: Attachment reference', exact: true });
    const gross = page.getByRole('textbox', { name: 'Gross statement 1: Actual business gross income', exact: true });
    const rootConfirmation = page.getByRole('combobox', { name: 'Gross statements checked after the last edit', exact: true });
    await expect(gross).toHaveValue('10000');
    await expect(page.getByRole('combobox', { name: 'Gross statement 1: Original partnership', exact: true })).toHaveValue('scheduleK1:0');
    await reference.fill('synthetic-private-gross-attachment'); await reference.press('Tab');
    await expect(rootConfirmation).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    for (const title of ['K-1 and qualified loss sources', 'K-1 1 original and histories', 'K-1 2 original and histories']) {
      await page.locator('summary').filter({ hasText: new RegExp(`^${title}$`) }).click();
    }
    for (const prefix of ['K-1 1', 'K-1 2']) {
      for (const source of ['basis', 'at risk', 'prior at-risk history', 'prior passive history', 'SE', 'prior SE history']) {
        await page.getByRole('combobox', { name: `${prefix} ${source} checked after the last edit`, exact: true }).selectOption('true');
      }
    }
    for (const label of ['Business classification checked after the last edit', 'K-1 packet checked after the last edit',
      'Gross statement 1: Statement checked after the last edit', 'Gross statement 2: Statement checked after the last edit',
      'Gross statements checked after the last edit', 'Health insurance sources checked after the last edit', 'Marketplace sources checked after the last edit']) {
      await page.getByRole('combobox', { name: label, exact: true }).selectOption('true');
    }
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect(page.locator('.guided-ticker-breakdown').getByText('$43,586', { exact: true }).first()).toBeVisible();
    await page.reload(); await expect(reference).toHaveValue('synthetic-private-gross-attachment'); await expect(rootConfirmation).toHaveValue('true');
    await reference.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`negative-limit-valid-${viewport.width}.png`) });
    await gross.fill(''); await gross.press('Tab'); await expect(rootConfirmation).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await page.reload(); await expect(gross).toHaveValue('');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
    expect(saved.adjustments.k1LossSources.activities.map((row: { statement: { ordinaryIncome: string } }) => row.statement.ordinaryIncome)).toEqual(['5000', '20000']);
    expect(saved.adjustments.healthInsuranceFacts.partnershipGrossIncomeSources.statements.map((row: { grossIncome: string }) => row.grossIncome)).toEqual(['', '40000']);
    expect(saved.adjustments.healthInsuranceFacts.partnershipGrossIncomeSources.statements[0].originalK1.ordinaryIncome).toBe('5000');
    expect(saved.adjustments.healthInsuranceFacts.plans.map((row: { businessSourceId: string }) => row.businessSourceId)).toEqual(['scheduleK1:0', 'scheduleK1:1']);
    expect(saved.adjustments.healthInsuranceFacts.plans[0].payments[0].advancePremiumTaxCredit).toBe('300');
    expect(saved.adjustments.healthInsuranceFacts.plans[1].payments[0].ownerOrBusinessPaid).toBe('500');
    expect(saved.credits.premiumTaxCredit.policies[0].monthlyPremiums[0].enrolleePremium).toBe('500');
    await gross.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`negative-limit-unknown-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const secret of ['synthetic-private-gross-attachment', '111-22-3333', '12-3456781', '12-3456782', 'policy-123']) expect(requests.join('\n')).not.toContain(secret);
  });
});
