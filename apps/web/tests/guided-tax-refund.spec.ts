// Spec: spec/federal/guided-tax-refund.yaml.
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333' };
const w2 = { employerName: 'Synthetic Employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '50000',
  federalWithheld: '0', socialSecurityWages: '0', socialSecurityTips: '0', socialSecurityWithheld: '0',
  medicareWages: '0', medicareWithheld: '0', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
const entry = { sourceTaxYear: '2025', sourceFormRevision: '2024-03', payer: 'Actual State Agency', payerTin: '12-3456789',
  accountReference: 'synthetic-government-source', accountHolder: 'primary', recipientTaxIdLast4: '3333', programType: 'other-government',
  compensation: '0', federalWithheld: '10.03', stateOrLocalTaxRefund: '1000.25', refundTaxYear: '2024', refundExpenseTaxYear: '2024',
  rtaaPayments: '0', taxableGrants: '0', agriculturePayments: '0', marketGain: '0', tradeOrBusinessRefund: false,
  currentYearRepaid: '0', priorYearRepaid: '0', unrecoveredAfterTaxContributions: '0', actualReceiptConfirmed: true,
  additionalWorksheetRequired: false, sourceFactsConfirmed: true, stateTaxReporting: 'none' };
const history = { sourceTaxYear: '2025', sourceReference: 'Synthetic filed2024 return', sourceFactsConfirmed: true,
  allRefundSourcesIncluded: true, allRefundedTaxesPaidInExpenseYear: true, returnMembershipUnchanged: true,
  primaryName: 'Jordan Example', primaryTaxpayerIdLast4: '3333', priorYearFilingStatus: 'single', priorTaxYear: '2024',
  priorYearItemized: true, priorYearStateLocalTaxElection: 'income', priorYearItemizedTotal: '20000',
  priorYearStandardDeduction: '14600', priorYearMandatoryItemization: false, priorYearStateLocalTaxesPaid: '8000',
  priorYearPropertyTaxesPaid: '0', priorYearAlternativeGeneralSalesTaxDeduction: '3000', priorYearTaxableIncome: '50000',
  priorYearRegularTax: '6000', priorYearAmt: '0', priorYearUnusedTaxCredits: '0', otherItemizedRecoveries: '0',
  priorRecoveriesBeforeReceiptYear: '0', priorYearNolCarryover: '0', priorYearCapitalRateWorksheetUsed: false,
  priorYearCouldBeClaimedAsDependent: false, originalRefundSources: [{ payer: 'Actual State Agency', payerTin: '123456789',
    accountReference: 'synthetic-government-source', accountHolder: 'primary', recipientTaxIdLast4: '3333', sourceTaxYear: '2025',
    amount: '1000.25', refundTaxYear: '2024', refundExpenseTaxYear: '2024' }] };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Historical refund sources at ${viewport.width}px`, () => {
    test('preserves actual refund history and elections', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1);
      if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2, entry, history }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages', 'unemployment'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] },
            'income-unemployment': { compensation: '0', federalWithheld: '10.03', entries: [entry], taxRefund: history } } }));
      }, { id, personal, w2, entry, history });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).not.toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Expand Ticker', exact: true }).click();
      await page.locator('.guided-ticker-clickable').first().click();
      const agi = page.locator('.guided-ticker-breakdown-row').filter({ has: page.getByText('Adjusted Gross Income', { exact: true }) });
      await expect(agi).toContainText('$51,000');
      const open = () => page.getByText('Historical income-tax refund worksheet', { exact: true }).click();
      await open();
      await expect(page.getByRole('textbox', { name: 'Recoveries received before this receipt year for the historical deductions', exact: true })).toHaveValue('0');
      await expect(page.getByRole('textbox', { name: 'Historical NOL carryover affecting the recovery worksheet', exact: true })).toHaveValue('0');
      const reference = page.getByRole('textbox', { name: 'Historical return and worksheet reference', exact: true });
      await reference.fill('synthetic-private-historical-refund');
      const confirmation = page.getByRole('combobox', { name: 'Refund worksheet checked after the last edit', exact: true });
      await expect(confirmation).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await confirmation.selectOption('true');
      await expect(agi).toContainText('$51,000');
      const property = page.getByRole('textbox', { name: 'Historical state and local property taxes paid', exact: true });
      await expect(property).toHaveValue('0');
      await page.getByRole('combobox', { name: 'Actual prior Schedule A tax election', exact: true }).selectOption('sales');
      await expect(confirmation).toHaveValue('');
      await confirmation.selectOption('true');
      await expect(agi).toContainText('$50,000');
      await page.reload();
      await open();
      await expect(reference).toHaveValue('synthetic-private-historical-refund');
      await expect(page.getByRole('combobox', { name: 'Actual prior Schedule A tax election', exact: true })).toHaveValue('sales');
      await expect(confirmation).toHaveValue('true');
      const refund = page.getByRole('textbox', { name: 'State or local tax refund, credit or offset (Box 2)', exact: true });
      await expect(refund).toHaveValue('1000.25');
      await property.fill('');
      await property.press('Tab');
      await expect(confirmation).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-unemployment']?.taxRefund?.priorYearPropertyTaxesPaid, id)).toBe('');
      await page.reload();
      await open();
      await expect(property).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData['income-unemployment'], id);
      expect(saved.entries[0].stateOrLocalTaxRefund).toBe('1000.25');
      expect(saved.entries[0].refundTaxYear).toBe('2024');
      expect(saved.entries[0].refundExpenseTaxYear).toBe('2024');
      expect(saved.taxRefund.priorYearItemized).toBe(true);
      expect(saved.taxRefund.sourceFactsConfirmed).toBeNull();
      expect(saved.taxRefund).not.toHaveProperty('taxableRefund');
      await reference.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`refund-history-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-historical-refund', personal.ssn, 'synthetic-government-source']) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
