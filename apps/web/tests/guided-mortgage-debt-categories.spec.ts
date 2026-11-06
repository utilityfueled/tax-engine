import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Mortgage debt categories at ${viewport.width}px`, () => {
    test('preserves actual completed mortgage debt categories', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
      await page.evaluate(({ id, personal }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2,
          completedSections: ['personal-info', 'income-w2'], segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null },
          sectionData: { 'personal-info': personal, deductions: { method: 'itemized', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '10000', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0',
            mortgageWorksheet: { sourceTaxYear: '2025', sourceReference: 'Synthetic annual home debt', allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: false, sourceFactsConfirmed: true },
            mortgageEntries: [{ lender: 'Actual Lender', mortgageInterest: '10000', outstandingPrincipal: '1000000', originationDate: '2020-01-01', sourceTaxYear: '2025', accountReference: 'synthetic-refinanced-loan', accountHolder: 'primary',
              propertyAddress: '123 Example Street, Columbus OH 43215', propertyUse: 'main-home', loanType: 'refinance', proceedsUse: 'mixed', securedDebt: true, ownershipInterest: true, obligationToRepay: true, interestPaidByReturn: true, currentYearInterestOnly: true,
              rentalOrBusinessUse: false, mortgageCreditCertificate: false, specialCircumstances: false, sourceFactsConfirmed: true, balanceMethod: 'category_worksheet',
              interestPaidByReturnAmount: '10000', interestPaidByOthers: '0', interestDeductedElsewhere: '0', sameYearInterestRefund: '0', nonqualifiedInterest: '1000', pointsPaidByReturnAmount: '0', pointsPaidByOthers: '0', pointsNotInterest: '0', pointsMethod: 'none', refundOfOverpaidInterest: '0', mortgageInsurancePremiums: '0', pointsPaid: '0', propertyTaxPaid: '0',
              balanceCategories: { sourceTaxYear: '2025', worksheetReference: 'synthetic-private-refinance-history', grandfatheredDebt: '0', acquisitionDebtBefore2017: '600000', acquisitionDebtAfter2017: '300000', excludedDebt: '100000',
                classificationConfirmed: true, paymentsAppliedInRequiredOrderConfirmed: true, interestAllocationConfirmed: true, refinancingHistoryConfirmed: true },
            }],
          } },
        }));
      }, { id, personal });
      await page.reload();
      const amount = page.getByRole('textbox', { name: /^Average acquisition debt incurred before December 16, 2017\b/ });
      await amount.fill('599999.99'); await amount.press('Tab');
      const confirmation = page.getByRole('combobox', { name: 'Have you checked all mortgage source and qualification facts after the last edit?', exact: true });
      await expect(confirmation).toHaveValue(''); await confirmation.selectOption('true');
      await page.getByRole('combobox', { name: 'Have you confirmed the complete annual home-debt worksheet after the last change?', exact: true }).selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await expect(amount).toHaveValue('599,999.99');
      const classification = page.getByRole('combobox', { name: 'Original proceeds, debt dates and all category averages have been checked', exact: true });
      await classification.selectOption('false'); await expect(confirmation).toHaveValue('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.balanceCategories?.classificationConfirmed, id)).toBe(false);
      await page.reload(); await expect(classification).toHaveValue('false');
      await classification.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.balanceCategories?.classificationConfirmed, id)).toBeNull();
      await page.reload(); await expect(classification).toHaveValue(''); await expect(amount).toHaveValue('599,999.99');
      expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.outstandingPrincipal, id)).toBe('1000000');
      await classification.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`mortgage-categories-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const value of ['synthetic-private-refinance-history', '599999.99', '599,999.99', personal.ssn]) expect(requests.join('\n')).not.toContain(value);
    });
  });
}
