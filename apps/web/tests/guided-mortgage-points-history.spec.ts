import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Mortgage points history at ${viewport.width}px`, () => {
    test('preserves actual mortgage points history across reload', async ({ page }, testInfo) => {
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
            mortgageEntries: [{ lender: 'Actual Lender', mortgageInterest: '10000', outstandingPrincipal: '100000', originationDate: '2014-01-01', sourceTaxYear: '2025', accountReference: 'synthetic-original-loan', accountHolder: 'primary',
              propertyAddress: '123 Example Street, Columbus OH 43215', propertyUse: 'main-home', loanType: 'original', proceedsUse: 'acquisition', securedDebt: true, ownershipInterest: true, obligationToRepay: true, interestPaidByReturn: true, currentYearInterestOnly: true,
              rentalOrBusinessUse: false, mortgageCreditCertificate: false, specialCircumstances: false, sourceFactsConfirmed: true, balanceMethod: 'highest_balance', maximumBalanceDuringYear: '100000', balanceSourceReference: 'Actual annual maximum',
              interestPaidByReturnAmount: '10000', interestPaidByOthers: '0', interestDeductedElsewhere: '0', sameYearInterestRefund: '0', nonqualifiedInterest: '0', pointsPaidByReturnAmount: '0', pointsPaidByOthers: '0', pointsNotInterest: '0', refundOfOverpaidInterest: '0', mortgageInsurancePremiums: '0', pointsPaid: '0', propertyTaxPaid: '0',
              pointsMethod: 'completed_amortization', pointsHistory: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-points-history', originalLender: 'Original Lender', originalAccountReference: 'original-points-A', paidDate: '2014-01-01',
                originalPoints: '3000', originalPrincipal: '100000', priorPointsDeducted: '2200', unamortizedPointsAtStartOfYear: '800', cashMethod: true, pointsAreInterest: true, historyConfirmed: true,
                completedMethod: 'early_termination', deductibleAmountBeforeLimit: '800', unamortizedPointsAvailable: '800', serviceFeesExcludedConfirmed: true, reportedOnCurrentForm1098: false,
                endingDate: '2025-06-01', sameLenderRefinance: false, completedMethodConfirmed: true },
            }],
          } },
        }));
      }, { id, personal });
      await page.reload();
      const prior = page.getByRole('textbox', { name: /^Points deducted before this tax year\b/ });
      await prior.fill('2199.99'); await prior.press('Tab');
      for (const label of ['Unamortized points at the start of this year', 'Actual points available in the completed worksheet', 'Completed points deduction before the home-debt limit']) {
        const amount = page.getByRole('textbox', { name: new RegExp(`^${label}\\b`) }); await amount.fill('800.01'); await amount.press('Tab');
      }
      const methodConfirmed = page.getByRole('combobox', { name: 'Have the actual completed points method and its pre-limit deduction been checked?', exact: true });
      const historyConfirmed = page.getByRole('combobox', { name: 'Original loan, current statement, payment share and past points deductions reconcile', exact: true });
      await expect(methodConfirmed).toHaveValue(''); await expect(historyConfirmed).toHaveValue('');
      await methodConfirmed.selectOption('true'); await historyConfirmed.selectOption('true');
      await page.getByRole('combobox', { name: 'Have you checked all mortgage source and qualification facts after the last edit?', exact: true }).selectOption('true');
      await page.getByRole('combobox', { name: 'Have you confirmed the complete annual home-debt worksheet after the last change?', exact: true }).selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await expect(prior).toHaveValue('2,199.99'); await expect(methodConfirmed).toHaveValue('true'); await expect(historyConfirmed).toHaveValue('true');
      const lender = page.getByRole('combobox', { name: 'Was the old mortgage refinanced with the same lender?', exact: true });
      await expect(lender).toHaveValue('false'); await lender.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.pointsHistory?.sameLenderRefinance, id)).toBeNull();
      await page.reload(); await expect(lender).toHaveValue(''); await expect(methodConfirmed).toHaveValue('');
      expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageEntries?.[0]?.pointsPaid, id)).toBe('0');
      await lender.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`mortgage-points-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const value of ['synthetic-private-points-history', '2199.99', '2,199.99', personal.ssn]) expect(requests.join('\n')).not.toContain(value);
    });
  });
}
