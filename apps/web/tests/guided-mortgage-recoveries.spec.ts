import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Mortgage recoveries at ${viewport.width}px`, () => {
    test('preserves actual mortgage recovery sources across reload', async ({ page }, testInfo) => {
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
          sectionData: { 'personal-info': personal, deductions: { method: 'standard', medicalExpenses: '0', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '', mortgageEntries: [], charitableContributions: '0', casualtyLosses: '0', otherItemized: '0',
            mortgageWorksheet: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-recovery-packet', allHomeDebtIncluded: true, priorYearInterestRecoveriesPresent: true, sourceFactsConfirmed: true, allRecoveriesIncluded: true,
              recoveries: [{ sourceId: 'refund-A', sourceTaxYear: '2025', sourceReference: 'synthetic-private-refund-record', payer: 'Actual Lender', accountReference: 'closed-A', accountHolder: 'primary', refundSource: 'lender_statement', originTaxYear: '2024', refundReceived: '2000', taxableRecovery: '600', alreadyIncludedInOtherIncome: '600', miscSourceId: 'misc-A', entireRefundBelongsToReturn: true, taxBenefitWorksheetReference: 'Actual completed prior tax-benefit worksheet', priorReturnAndOtherRecoveriesReviewed: true, taxBenefitWorksheetConfirmed: true }],
              recoveryMiscStatements: [{ sourceId: 'misc-A', sourceTaxYear: '2025', sourceFormRevision: '2025-04', payer: 'Actual Lender', payerTin: '123456789', accountReference: 'private-MISC-A', accountHolder: 'primary', otherIncome: '600', federalWithheld: '60', rents: '0', royalties: '0', fishingBoatProceeds: '0', medicalPayments: '0', substitutePayments: '0', cropInsurance: '0', grossAttorneyProceeds: '0', fishPurchasedForResale: '0', section409ADeferrals: '0', nonqualifiedDeferredComp: '0', directSales: false, fatcaFilingRequirement: false, stateTaxReporting: 'none', stateIncome: '0', stateWithheld: '0', recoveryOnlyIncomeConfirmed: true, sourceFactsConfirmed: true }],
            },
          } },
        }));
      }, { id, personal });
      await page.reload();
      await page.getByText('Earlier-year mortgage refunds and recoveries', { exact: true }).click();
      const taxable = page.getByRole('textbox', { name: /^Taxable recovery from the completed tax-benefit worksheet\b/ });
      for (const label of ['Taxable recovery from the completed tax-benefit worksheet', 'Taxable recovery already included in linked MISC Box 3', 'Original Form 1099-MISC Box 3 other income']) {
        const amount = page.getByRole('textbox', { name: new RegExp(`^${label}\\b`) }); await amount.fill('600.01'); await amount.press('Tab');
      }
      const taxConfirmed = page.getByRole('combobox', { name: 'Completed tax-benefit worksheet has been checked after the last edit', exact: true });
      const miscConfirmed = page.getByRole('combobox', { name: 'Original MISC boxes and ownership checked after the last edit', exact: true });
      await expect(taxConfirmed).toHaveValue(''); await expect(miscConfirmed).toHaveValue('');
      await taxConfirmed.selectOption('true'); await miscConfirmed.selectOption('true');
      await page.getByRole('combobox', { name: 'Have you confirmed the complete annual home-debt worksheet after the last change?', exact: true }).selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageWorksheet?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await page.getByText('Earlier-year mortgage refunds and recoveries', { exact: true }).click();
      await expect(taxable).toHaveValue('600.01'); await expect(taxConfirmed).toHaveValue('true'); await expect(miscConfirmed).toHaveValue('true');
      const prior = page.getByRole('combobox', { name: 'Prior return, other recoveries, credits, AMT and special tax conditions were reviewed', exact: true });
      await prior.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions?.mortgageWorksheet?.recoveries?.[0]?.priorReturnAndOtherRecoveriesReviewed, id)).toBeNull();
      await page.reload(); await page.getByText('Earlier-year mortgage refunds and recoveries', { exact: true }).click();
      await expect(prior).toHaveValue(''); await expect(taxConfirmed).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.deductions, id);
      expect(saved.method).toBe('standard'); expect(saved.mortgageEntries).toEqual([]);
      expect(saved.mortgageWorksheet.recoveryMiscStatements[0]).toMatchObject({ otherIncome: '600.01', federalWithheld: '60', directSales: false });
      await prior.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`mortgage-recoveries-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const value of ['synthetic-private-recovery-packet', 'private-MISC-A', '600.01', personal.ssn]) expect(requests.join('\n')).not.toContain(value);
    });
  });
}
