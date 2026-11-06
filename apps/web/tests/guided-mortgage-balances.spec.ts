import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Mortgage balance sources at ${viewport.width}px`, () => {
    test('preserves actual mortgage method sources', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const bodies: string[] = [];
      page.on('request', request => bodies.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
      await page.evaluate(({ id, personal }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 2,
          completedSections: ['personal-info', 'income-w2'], segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['bought-home'], stateCode: null },
          sectionData: { 'personal-info': personal, deductions: { method: 'itemized', mortgageWorksheet: { sourceTaxYear: '2025', sourceReference: 'Synthetic complete home debt', allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: false, sourceFactsConfirmed: true },
            mortgageEntries: [{ lender: 'Actual Lender', mortgageInterest: '40000.10', outstandingPrincipal: '990000', originationDate: '2020-01-01', sourceTaxYear: '2025', accountReference: 'synthetic-loan-1', accountHolder: 'primary',
              propertyAddress: '123 Example Street, Columbus OH 43215', propertyUse: 'main-home', loanType: 'original', proceedsUse: 'acquisition', securedDebt: true, ownershipInterest: true, obligationToRepay: true, interestPaidByReturn: true, currentYearInterestOnly: true,
              rentalOrBusinessUse: false, mortgageCreditCertificate: false, specialCircumstances: false, sourceFactsConfirmed: true, balanceMethod: 'monthly', balanceSourceReference: 'synthetic-private-monthly-history',
              interestPaidByReturnAmount: '40000.10', interestPaidByOthers: '0', interestDeductedElsewhere: '0', sameYearInterestRefund: '0', nonqualifiedInterest: '0', pointsPaidByReturnAmount: '0', pointsPaidByOthers: '0', pointsNotInterest: '0', pointsMethod: 'none', refundOfOverpaidInterest: '0', mortgageInsurancePremiums: '0', pointsPaid: '0', propertyTaxPaid: '0',
              balanceMonthly: { statementBasis: 'closing', allMonthsIncluded: true, qualifiedHomeMonths: ['10', '11', '12'], balances: [{ month: '10', amount: '900000.10' }, { month: '11', amount: '800000.20' }, { month: '12', amount: '699999.70' }] },
            }], medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '40000.10', charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', investmentInterestExpense: '0' } },
        }));
      }, { id, personal });
      await page.reload();
      const amount = page.getByRole('textbox', { name: 'Monthly balance 1 amount', exact: true });
      await amount.fill('9007199254740993.01'); await amount.press('Tab');
      const confirmation = page.getByRole('combobox', { name: 'Have you checked all mortgage source and qualification facts after the last edit?', exact: true });
      await expect(confirmation).toHaveValue(''); await confirmation.selectOption('true');
      await page.getByRole('combobox', { name: 'Have you confirmed the complete annual home-debt worksheet after the last change?', exact: true }).selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await expect(amount).toHaveValue('9,007,199,254,740,993.01');
      const method = page.getByRole('combobox', { name: 'Balance method for the home-debt worksheet', exact: true });
      await method.selectOption('interest_rate');
      const rate = page.getByRole('textbox', { name: /^Actual lowest annual interest rate as a decimal\b/ });
      await expect(rate).toHaveValue(''); await rate.fill('0.090000000000001');
      await method.selectOption('monthly'); await expect(amount).toHaveValue('9,007,199,254,740,993.01');
      await amount.fill(''); await amount.press('Tab'); await expect(confirmation).toHaveValue('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.balanceMonthly?.balances?.[0]?.amount, id)).toBe('');
      await page.reload(); await expect(amount).toHaveValue('');
      expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.outstandingPrincipal, id)).toBe('990000');
      expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.balanceInterestRate?.lowestAnnualRate, id)).toBe('0.090000000000001');
      await amount.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`mortgage-balances-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const value of ['synthetic-private-monthly-history', '9007199254740993.01', '9,007,199,254,740,993.01', '0.090000000000001', personal.ssn]) expect(bodies.join('\n')).not.toContain(value);
    });
  });
}
