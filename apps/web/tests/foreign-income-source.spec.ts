import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`preserves original foreign-income facts after reload at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const requests: string[] = [];
    page.on('request', request => requests.push(request.postData() ?? ''));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing synthetic workspace');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    await page.evaluate(({ id, facts }) => {
      // Every zero/false below is an explicitly supplied fictional source, never an app default.
      const foreignIncome = {
        sourceTaxYear: '2025', sourceReference: 'synthetic-browser-foreign-2555', accountHolder: 'primary', taxpayerName: 'Jane Example', taxpayerTaxIdLast4: '0001',
        sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true,
        taxHomeCountry: 'United Kingdom', taxHomeStartDate: '2025-01-01', taxHomeEndDate: '2025-12-31', taxHomeConfirmed: true,
        citizenshipStatus: 'us_citizen', servicesQualify: true, foreignCountriesQualify: true, cubaTravelPermittedConfirmed: null,
        qualificationMethod: 'physical_presence', qualificationReference: 'Actual synthetic travel diary', testPeriodStartDate: '2025-01-01', testPeriodEndDate: '2025-12-31', testPeriodCompleted: true, qualifyingDays: '365',
        fullForeignPeriods: [{ country: 'United Kingdom', startDate: '2025-01-01', endDate: '2025-12-31' }], bonaFideResidenceConfirmed: null, nonresidenceStatementDisqualifies: null, treatyResidentEligibilityConfirmed: null,
        electionsValidConfirmed: true, claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false,
        partIV: { wages: '120000', businessPersonalServices: '0', partnershipPersonalServices: '0', noncashLodging: '0', noncashMeals: '0', noncashCar: '0', noncashOther: '0', allowanceCostOfLiving: '0', allowanceFamily: '0', allowanceEducation: '0', allowanceHomeLeave: '0', allowanceQuarters: '0', allowanceOther: '0', otherEarnedIncome: '0', section119MealsAndLodging: '0' },
        sources: [{ sourceId: 'foreignEmployment:browser-pay', sourceTaxYear: '2025', accountHolder: 'primary', sourceReference: 'Original foreign employment source', payerName: 'Synthetic foreign employer', payerEin: '', foreignEarnedIncome: '120000', priorYearIncomeReceived: '0', notIncludedInW2Confirmed: true, businessGrossReceipts: '', businessReturnsAndAllowances: '', businessCostOfGoodsSold: '', businessOtherIncome: '' }],
        noncashValuationReference: '', section119QualificationConfirmed: null, otherIncomeDescription: '', businessCapitalMaterialIncomeProducing: null,
        qualifiedHousingExpenses: '0', housingExpensesQualificationConfirmed: false, housingExpenseReference: '', housingNoDuplicateClaimConfirmed: true, nontaxableGovernmentHousingAllowance: '0', housingLocationPeriods: [],
        deductionsAllocableToExcludedIncome: '0', foreignEarnedIncomeTaxWorksheetDisallowedDeductions: '0', deductionWorksheetReference: 'Synthetic zero allocation worksheet',
        priorYearHousingDeductionCarryover: '0', priorYearHousingCarryoverTaxYear: '', priorYearHousingCarryoverConfirmed: null, priorYearHousingReference: '',
        priorYearIncomeExclusion: '0', priorYearIncomeExclusionTaxYear: '', priorYearUnusedExclusion: '', priorYearIncomeStatementConfirmed: null, priorYearIncomeAlreadyReportedConfirmed: null, priorYearIncomeReference: '',
      };
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 1, completedSections: ['personal-info'],
        segmentation: { filingStatus: 'single', incomeTypes: [], lifeEvents: ['foreign-earned-income'], stateCode: null }, sectionData: { 'personal-info': facts, adjustments: { foreignIncome } } }));
    }, { id, facts: taxpayerFacts2025 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Foreign earned income', exact: true })).toBeVisible();
    const confirmation = page.getByRole('combobox', { name: 'Foreign sources checked after the last edit', exact: true });
    await expect(confirmation).toHaveValue('true');
    await expect(page.getByLabel('Original foreign source ID 1', { exact: true })).toHaveValue('foreignEmployment:browser-pay');
    await expect(page.getByRole('combobox', { name: 'Actual foreign housing expenses qualify', exact: true })).toHaveValue('false');
    const currentReceipts = page.getByRole('textbox', { name: /^Current foreign receipts 1/ });
    await currentReceipts.fill('9007199254740993.03');
    await expect(confirmation).toHaveValue('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.foreignIncome?.sources?.[0]?.foreignEarnedIncome, id)).toBe('9007199254740993.03');
    await page.reload();
    await expect(currentReceipts).toHaveValue('9007199254740993.03');
    await expect(confirmation).toHaveValue('');
    await expect(page.getByRole('textbox', { name: /^Foreign wages and salary/ })).toHaveValue('120000');
    await page.getByLabel('Foreign source year 1', { exact: true }).fill('');
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.adjustments?.foreignIncome?.sources?.[0]?.sourceTaxYear, id)).toBe('');
    await page.getByRole('heading', { name: 'Foreign earned income', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`foreign-income-source-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requests.join('\n')).not.toContain('synthetic-browser-foreign-2555');
    expect(requests.join('\n')).not.toContain('900-70-0001');
  });
}
