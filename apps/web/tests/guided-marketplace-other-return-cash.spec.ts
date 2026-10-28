// Spec: spec/federal/marketplace-other-return-cash.yaml, browser.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { marketplaceOtherReturnCashRecords, otherReturnHealthPaymentRecords } from '../../../tests/fixtures/marketplace-other-return-cash-records';
import { taxpayerFacts2025 } from './guided-fixtures';
const personal = { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-02-15',
  livedWithSpouseAtAnyTimeDuringYear: true, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  spouse: { firstName: 'Alex', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1990-02-15', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const business = { necEntries: [], manualGrossReceipts: '300000', qbiMateriallyParticipated: true,
  expenses: { advertising: '0', carAndTruck: '0', insurance: '0', officeExpense: '0', supplies: '0', travel: '0', meals: '0', utilities: '0', otherExpenses: '0' },
  businessFacts: { accountHolder: 'primary', activityDescription: 'Independent design services', businessCode: '541430', accountingMethod: 'cash', singleBusinessConfirmed: true, incomeReconciled: true, expensesReconciled: true, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0', contractLabor: '0', depreciation: '0', legalAndProfessional: '0', w2WagesPaid: '0', ubiaQualifiedProperty: '0', isSST: false, allInvestmentAtRisk: true, priorYearUnallowedLoss: '0', additionalWorksheetRequired: false, otherExpenseDescription: 'Fictional qualified business expense', mealsEligibilityConfirmed: true, carExpenseWorksheetConfirmed: true, depreciationWorksheetConfirmed: true } };

for (const scenario of [{ width: 1280, height: 900, marriage: false }, { width: 390, height: 844, marriage: true }]) test.describe(`${scenario.width}px`, () => {
  test('retains separate other return cash evidence through actual download', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    const requests: { url: string; body: string }[] = []; page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const records = marketplaceOtherReturnCashRecords(scenario.marriage ? 'marriage' : 'advance');
    const payments = otherReturnHealthPaymentRecords(scenario.marriage);
    await page.evaluate(({ id, personal, business, records, payments }) => {
      const workspaces = JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}');
      workspaces.workspaces[id].returnSummary.targetTaxYear = 2025; localStorage.setItem('tax-engine.return-workspaces.v1', JSON.stringify(workspaces));
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2,
        completedSections: ['personal-info', 'income-self-employment'], segmentation: { filingStatus: 'mfj', incomeTypes: ['self-employment'], lifeEvents: ['self-employed-health-insurance'], stateCode: null },
        sectionData: { 'personal-info': 'personal' in records ? records.personal : personal, 'income-self-employment': { ...business, manualGrossReceipts: 'personal' in records ? '100000' : '300000' }, payments,
          adjustments: { hsaDeduction: '', studentLoanInterest: '', selfEmployedHealthInsurance: '', educatorExpenses: '', iraDeduction: '', alimonyPaid: '', healthInsuranceFacts: records.health },
          credits: { dependentCare: { expenses: '', qualifyingIndividuals: '' }, education: { aocStudents: [], llcExpenses: '' },
            energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' }, premiumTaxCredit: records.coverage } } }));
    }, { id, personal, business, records, payments });
    await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    const agi = scenario.marriage ? '$86,060' : '$268,265';
    await expect(page.locator('.guided-ticker-breakdown').getByText(agi, { exact: true }).first()).toBeVisible();
    const prefix = 'Plan 1 coverage family other return 1 cash';
    const reference = page.getByRole('textbox', { name: `${prefix} receipt 1: Source reference`, exact: true });
    const cash = page.getByRole('textbox', { name: `${prefix} receipt 1: Cash paid to insurer`, exact: true });
    const confirmed = page.getByRole('combobox', { name: `${prefix}: Sources checked after the last edit`, exact: true });
    await expect(cash).toHaveValue('100');
    await expect(page.getByRole('textbox', { name: 'Plan 1 coverage family other return 1: Actual Form 8962 line 24', exact: true })).toHaveValue(scenario.marriage ? '1000' : '5000');
    await reference.fill('synthetic-private-other-return-insurer-cash'); await reference.press('Tab');
    await expect(confirmed).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
    const reconfirm = async () => {
      if (scenario.marriage) for (let month = 1; month <= 7; month++) await page.getByRole('combobox', { name: `Primary month ${month}: Benchmark source checked after the last edit`, exact: true }).selectOption('true');
      const labels = [`${prefix}: Sources checked after the last edit`, ...(scenario.marriage ? ['Plan 1 person 2 child relationship: Sources checked after the last edit'] : []),
        'Plan 1 coverage family: Sources checked after the last edit', 'Plan 1 shared health: Person links checked after the last edit', 'Health insurance sources checked after the last edit',
        ...(scenario.marriage ? ['Allocation policy 1: Benchmark sources checked after the last edit'] : []), 'Allocation sources checked after the last edit',
        ...(scenario.marriage ? ['Marriage sources checked after the last edit'] : []), 'Marketplace sources checked after the last edit'];
      for (const name of labels) await page.getByRole('combobox', { name, exact: true }).selectOption('true');
    };
    await reconfirm(); await expect(hero).toHaveText('Enter more info for an estimate');
    await cash.fill(''); await cash.press('Tab'); await reconfirm();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Adjustments to Income', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip this section', exact: true })).toHaveCount(0);
    await page.reload(); await expect(cash).toHaveValue('');
    await cash.fill('100'); await cash.press('Tab'); await reconfirm();
    await expect(hero).toHaveText('Enter more info for an estimate');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    await page.reload(); await expect(cash).toHaveValue('100'); await expect(confirmed).toHaveValue('true');
    const healthSaved = await page.evaluate(id => ({ state: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'),
      workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id] }), id);
    writeFileSync(testInfo.outputPath('actual-health-source-before-payments.json'), JSON.stringify(healthSaved, null, 2) + '\n');
    expect(healthSaved.state.sectionData.payments.estimatedTaxFacts.sourceFactsConfirmed).toBeNull();
    const payment = healthSaved.state.sectionData.adjustments.healthInsuranceFacts.plans[0].payments[0];
    expect(payment).toMatchObject(scenario.marriage ? { grossPremium: '3000.03', ownerOrBusinessPaid: '1100.01', otherPersonPaid: '1900.02', advancePremiumTaxCredit: '0' }
      : { grossPremium: '3000', ownerOrBusinessPaid: '400', otherPersonPaid: '600', advancePremiumTaxCredit: '2000' });
    const other = healthSaved.state.sectionData.adjustments.healthInsuranceFacts.plans[0].coverageFamilySources.outsidePersonReturns[0];
    expect(other.cashPaymentSources.premiumPayments[0]).toMatchObject({ cashPaidToInsurer: '100', sourceReference: 'synthetic-private-other-return-insurer-cash', reimbursements: [] });
    expect(other.cashPaymentSources.otherReturnTaxPayments).toEqual(records.cashPaymentSources.otherReturnTaxPayments);
    await cash.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`other-return-cash-${scenario.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Health edits also invalidate the independently saved tax-payment packet.
    for (let step = 0; step < 8 && !(await page.getByRole('heading', { name: 'Payments & Withholding', exact: true }).isVisible()); step++) {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Payments & Withholding', exact: true })).toBeVisible();
    const paymentConfirmation = page.getByRole('combobox', { name: 'Estimated-tax sources checked after the last edit', exact: true });
    await expect(paymentConfirmation).toHaveValue(''); await paymentConfirmation.selectOption('true');
    await expect(hero).not.toHaveText('Enter more info for an estimate');
    await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click(); await page.locator('.guided-ticker-clickable').first().click();
    await expect(page.locator('.guided-ticker-breakdown').getByText(agi, { exact: true }).first()).toBeVisible();
    await page.reload(); await expect(paymentConfirmation).toHaveValue('true');
    for (let step = 0; step < 6 && !(await page.getByRole('button', { name: 'Open Full Return', exact: true }).isVisible()); step++) {
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
    const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
    await expect(bundle).toContainText('Filing exports are not yet qualified');
    const saved = await page.evaluate(id => ({ state: JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'),
      workspace: JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id] }), id);
    writeFileSync(testInfo.outputPath('actual-confirmed-source.json'), JSON.stringify(saved, null, 2) + '\n');
    expect(saved.state.sectionData.payments).toEqual(payments);
    for (const section of ['personal-info', 'income-self-employment', 'adjustments', 'deductions', 'credits', 'other-taxes', 'payments', 'review']) expect(saved.state.completedSections).toContain(section);
    expect(saved.state.sectionData.adjustments.healthInsuranceFacts).toEqual(healthSaved.state.sectionData.adjustments.healthInsuranceFacts);
    const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
    await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
    const output = testInfo.outputPath(`other-return-cash-review-${scenario.width}.pdf`); await (await downloading).saveAs(output);
    const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
    const text = pages.join(' ').replace(/\s+/g, ' ');
    for (const literal of ['OUTSIDE-TAX-FAMILY CASH', 'gross insurer cash $100', 'net insurer cash $100',
      scenario.marriage ? 'Completed other-return Form8962 line24 $1000' : 'Completed other-return Form8962 line24 $5000',
      'not included in deductible insurer cash', 'Form 2210 is not auto-attached']) expect(text).toContain(literal);
    if (!scenario.marriage) expect(text).toContain('reported own-return repayment $12000');
    expect(text).toContain(scenario.marriage ? '6875' : '16800');
    for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
    for (const secret of ['123-45-6789', '123456789', '987-65-4321', '987654321', '111-22-3333', '444-55-6666', '234-56-7890']) expect(text).not.toContain(secret);
    for (const request of requests.filter(request => ['synthetic-private-other-return-insurer-cash', '123-45-6789', '987-65-4321', '111-22-3333', '444-55-6666', '234-56-7890', 'ACTUAL-POLICY'].some(secret => request.body.includes(secret)))) {
      expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
      expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
    }
    await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`other-return-cash-review-${scenario.width}.png`) });
  });
});
