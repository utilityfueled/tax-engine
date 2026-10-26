// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import { expect, test } from '@playwright/test';
import { guidedMarketplaceNonspecifiedStopRecords } from '../../../tests/fixtures/guided-marketplace-nonspecified-stop-records';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', livedWithSpouseAtAnyTimeDuringYear: true,
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1992-09-10', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const business = { necEntries: [], manualGrossReceipts: '5000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: { accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0', contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense', mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };
const wages = { entries: [{ employerName: 'Actual Spouse Corporation', employerEin: '12-3456789', accountHolder: 'spouse', wages: '50000', federalWithheld: '0', socialSecurityWages: '47000', socialSecurityTips: '0', socialSecurityWithheld: '0', medicareWages: '47000', medicareWithheld: '0', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none', state: '', stateWages: '', stateWithheld: '' }] };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) test.describe(`Actual nonspecified stop ${viewport.width}`, () => {
  test('retains the completed nonspecified stop through source edits and reload', async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const requests: string[] = []; page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, personal, business, wages, records }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 3, completedSections: ['personal-info', 'income-w2', 'income-self-employment'],
        segmentation: { filingStatus: 'mfj', incomeTypes: ['self-employment', 'w2-wages'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': personal, 'income-self-employment': business, 'income-w2': wages,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: records.coverage } } }));
    }, { id, personal, business, wages, records: guidedMarketplaceNonspecifiedStopRecords() });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText('$47,000', { exact: true }).first()).toBeVisible();
    const reference = page.getByRole('textbox', { name: 'Plan 3: Policy reference', exact: true });
    const health = page.getByRole('combobox', { name: 'Health insurance sources checked after the last edit', exact: true });
    const marketplace = page.getByRole('combobox', { name: 'Marketplace sources checked after the last edit', exact: true });
    const original = page.getByRole('textbox', { name: 'Plan 3 payment 1: Original premium', exact: true });
    const paid = page.getByRole('textbox', { name: 'Plan 3 payment 1: Owner or business paid share', exact: true });
    await expect(page.getByRole('combobox', { name: 'Plan 3: Business or shareholder employer', exact: true })).toHaveValue('scheduleC');
    await expect(original).toHaveValue('500');
    await reference.fill('synthetic-private-nonspecified-stop'); await reference.press('Tab');
    for (const field of [health, marketplace]) await expect(field).toHaveValue('');
    await expect(hero).toHaveText('Enter more info for an estimate');
    for (const field of [health, marketplace]) await field.selectOption('true');
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await expect(page.locator('.guided-ticker-breakdown').getByText('$47,000', { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed, id)).toBe(true);
    await page.reload(); await expect(reference).toHaveValue('synthetic-private-nonspecified-stop'); await expect(health).toHaveValue('true');
    await reference.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`nonspecified-stop-valid-${viewport.width}.png`) });
    await paid.fill(''); await paid.press('Tab'); await expect(health).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.healthInsuranceFacts?.plans?.[2]?.payments?.[0]?.ownerOrBusinessPaid, id)).toBe('');
    await page.reload(); await expect(paid).toHaveValue(''); await expect(original).toHaveValue('500');
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData, id);
    expect(saved.adjustments.healthInsuranceFacts.plans.map((plan: { accountHolder: string; businessSourceId: string; marketplacePolicySourceIds: string[] }) => [plan.accountHolder, plan.businessSourceId, plan.marketplacePolicySourceIds])).toEqual([
      ['primary', 'scheduleC', ['form1095A:0']], ['spouse', 'formW2:0', []], ['primary', 'scheduleC', []],
    ]);
    expect(saved.adjustments.healthInsuranceFacts.plans[2].payments[0].advancePremiumTaxCredit).toBe('0');
    expect(saved.adjustments.healthInsuranceFacts.plans[2].payments[0].personAmounts[0].amountPaid).toBe('500');
    expect(saved.adjustments.healthInsuranceFacts.plans[1].payments[0].ownerOrBusinessPaid).toBe('250');
    expect(saved.credits.premiumTaxCredit.policies).toHaveLength(1);
    expect(saved.credits.premiumTaxCredit.policies[0].monthlyPremiums[0].enrolleePremium).toBe('500');
    await paid.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`nonspecified-stop-unknown-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const secret of ['synthetic-private-nonspecified-stop', '111-22-3333', '222-33-4444', 'policy-123', 'spouse-policy']) expect(requests.join('\n')).not.toContain(secret);
  });
});
