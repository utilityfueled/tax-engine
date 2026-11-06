// Spec: spec/federal/education-ordinary-expense-composition.yaml browser.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

// Plain original facts keep this browser runner independent of Vitest aliases.
function actualOrdinaryExpenseInterview() {
  return { factsVersion: 2, taxYear: 2025,
    segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
    sectionData: {
      'personal-info': { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-01-15' },
      'income-w2': { entries: [{ employerName: 'Fictional education employer', employerEin: '12-3456789', accountHolder: 'primary',
        wages: '50000', federalWithheld: '20000', socialSecurityWages: '50000', socialSecurityTips: '0', socialSecurityWithheld: '3100',
        medicareWages: '50000', medicareWithheld: '725', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
      credits: {
        dependentCare: { expenses: '', qualifyingIndividuals: '' },
        education: { aocStudents: [], llcExpenses: '' },
        energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' },
        educationDistributions: { taxYear: '2025', sourceFactsConfirmed: true, allDistributionsReconciled: true,
          beneficiaries: [{ id: 'educator', name: 'Jane Doe', studentTaxId: '123-45-6789', outsideK12QualifiedDistributions: '0' }],
          forms: [{ fields: { sourceFactsComplete: true, sourceFactsConfirmed: true, beneficiaryId: 'educator', recipientOwner: 'primary', taxYear: '2025',
            isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceId: 'prepaid', accountId: 'prepaid-account', accountType: '529',
            distributionMedium: 'in_kind_prepaid_tuition', grossDistribution: '4000', earnings: '800', basis: '3200' }, transfer: { kind: 'none' } }],
          expenses: [{ id: 'tuition', beneficiaryId: 'educator', category: 'postsecondary_books', paidDate: '2025-08-15', amount: '4000', refundedAmount: '500',
            refundHistoryCompleteConfirmed: true, taxFreeAssistance: '1000', educationCreditAmount: '0', otherTaxBenefitAmount: '0', qualificationConfirmed: true }],
          expenseRefunds: [{ id: 'refund-one', expenseId: 'tuition', amount: '500', receivedDate: '2025-09-15', receivedByBeneficiary: true,
            disposition: 'cash_retained', sourceReference: 'fictional institution refund receipt', sourceFactsConfirmed: true }],
          allocations: [{ expenseId: 'tuition', sourceId: 'prepaid', amount: '2500', creditAmount: '0' }],
          inKindBenefits: [{ id: 'benefit', sourceId: 'prepaid', expenseId: 'tuition', amount: '4000', providedDate: '2025-08-15', qualificationConfirmed: true,
            sourceReference: 'Synthetic actual tuition credit application' }], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
        },
      },
    },
  };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Ordinary education source records at ${viewport.width}px`, () => {
    test('preserves ordinary education expenses and refund chronology through reload', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, state }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ ...state, phase: 'interview', currentSectionIndex: 3,
          completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'] }));
      }, { id, state: actualOrdinaryExpenseInterview() });
      await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const checked = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const refundChecked = page.getByRole('combobox', { name: 'Refund records checked after the last edit', exact: true });
      const refundTotal = page.getByRole('textbox', { name: 'Refunded expense amount', exact: true });
      const refundReceived = page.getByRole('textbox', { name: 'Actual refund received', exact: true });
      const allocation = page.getByRole('textbox', { name: 'Net expense allocated to this distribution', exact: true });
      const category = page.getByRole('combobox', { name: 'Expense category', exact: true });
      // Actual50300AGI, standard15750, published2025 table3911 plus30tax.
      await expect(hero).toHaveText('$16,059'); await expect(category).toHaveValue('postsecondary_books');
      await expect(refundReceived).toHaveValue('500');
      await refundTotal.fill('1000'); await refundReceived.fill('1000'); await allocation.fill('2000'); await allocation.press('Tab');
      await expect(checked).toHaveValue(''); await expect(refundChecked).toHaveValue('');
      await checked.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      await refundChecked.selectOption('true');
      await expect(checked).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await checked.selectOption('true');
      // Actual50400AGI, table3923 plus40tax.
      await expect(hero).toHaveText('$16,037');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions.expenseRefunds[0].amount, id)).toBe('1,000');
      await page.reload(); await expect(refundReceived).toHaveValue('1,000'); await expect(hero).toHaveText('$16,037');
      await refundReceived.fill(''); await refundChecked.selectOption('true'); await checked.selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(refundReceived).toHaveValue('');
      await refundTotal.fill('0'); await refundReceived.fill('0'); await allocation.fill('3000'); await allocation.press('Tab');
      await refundChecked.selectOption('true'); await checked.selectOption('true');
      // Actual50200AGI, table3899 plus20tax.
      await expect(hero).toHaveText('$16,081');
      await refundTotal.fill('500'); await refundReceived.fill('500'); await allocation.fill('2500'); await allocation.press('Tab');
      await refundChecked.selectOption('true'); await checked.selectOption('true');
      await expect(hero).toHaveText('$16,059'); await page.reload();
      await expect(refundReceived).toHaveValue('500'); await expect(checked).toHaveValue('true'); await expect(hero).toHaveText('$16,059');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      expect(saved.sectionData.credits.educationDistributions.forms[0].fields.grossDistribution).toBe('4000');
      expect(saved.sectionData.credits.educationDistributions.inKindBenefits[0].amount).toBe('4000');
      expect(saved.sectionData.credits.educationDistributions.expenseRefunds[0].receivedDate).toBe('2025-09-15');
      writeFileSync(testInfo.outputPath(`ordinary-education-original-${viewport.width}.json`), JSON.stringify(saved, null, 2));
      for (const secret of ['123-45-6789', 'prepaid-account', 'fictional institution refund receipt']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await refundReceived.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`ordinary-education-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`ordinary-education-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const checkedPdf: { pages: string[]; fields: number } = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({"pages":[p.extract_text() or "" for p in r.pages],"fields":len(r.get_fields() or {})}))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = checkedPdf.pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Expense 1: Category: postsecondary_books', 'Actual received date: 2025-09-15',
        'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $300',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $30']) expect(text).toContain(literal);
      expect(checkedPdf.fields).toBe(0);
      for (const pageText of checkedPdf.pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'prepaid-account', 'fictional institution refund receipt']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('fictional institution refund receipt'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`ordinary-education-review-${viewport.width}.png`) });
    });
  });
}
