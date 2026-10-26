// Spec: spec/federal/form-1099-q-cash-assistance.yaml browser.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

// Explicit fictional records, kept local to the browser runner so no application
// alias or unit-test helper supplies a calculated amount or an inferred election.
function actualCashAssistanceInterview() {
  const statement = { sourceFactsComplete: true, sourceFactsConfirmed: true, beneficiaryId: 'educator',
    recipientOwner: 'primary', taxYear: '2025', isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false };
  return { factsVersion: 2, taxYear: 2025,
    segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
    sectionData: {
      'personal-info': { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1990-01-15' },
      'income-w2': { entries: [{ employerName: 'Fictional education employer', employerEin: '12-3456789', accountHolder: 'primary',
        wages: '50000', federalWithheld: '20000', socialSecurityWages: '50000', socialSecurityTips: '0', socialSecurityWithheld: '3100',
        medicareWages: '50000', medicareWithheld: '725', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' }] },
      credits: {
        dependentCare: { expenses: '', qualifyingIndividuals: '' },
        energy: { solarElectricCost: '', solarWaterHeatingCost: '', insulationCost: '', exteriorDoorsWindowsCost: '', roofCost: '', energyEfficientHvacCost: '', waterHeaterHeatPumpCost: '' },
        education: { primarySsnEligible: true, primaryTinEligible: true, canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false,
          aocBanInEffect: false, form8862Required: false, possessionIncomeExclusion: '0', aocStudents: [], llcExpenses: '1000',
          llcStudents: [{ name: 'Jane Doe', studentTaxId: '123-45-6789', studentRole: 'primary', qualifiedExpenses: '1000', studentSsnEligible: true,
            studentTinEligible: true, institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true, courseEligibilityConfirmed: true,
            institutions: [{ name: 'Fictional university', address: '100 College Road, Columbus OH 43215', ein: '12-3456789',
              receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false }] }] },
        educationDistributions: { taxYear: '2025', sourceFactsConfirmed: true, allDistributionsReconciled: true,
          beneficiaries: [{ id: 'educator', name: 'Jane Doe', studentTaxId: '123-45-6789', outsideK12QualifiedDistributions: '0' }],
          forms: [
            { fields: { ...statement, sourceId: 'prepaid', accountId: 'prepaid-account', accountType: '529', distributionMedium: 'in_kind_prepaid_tuition', grossDistribution: '4000', earnings: '800', basis: '3200' }, transfer: { kind: 'none' } },
            { fields: { ...statement, sourceId: 'cash-qtp', accountId: 'fictional-cash-qtp-account', accountType: '529', distributionMedium: 'cash', grossDistribution: '8000', earnings: '2000', basis: '6000' }, transfer: { kind: 'none' } },
          ],
          expenses: [{ id: 'tuition', beneficiaryId: 'educator', category: 'postsecondary_tuition', paidDate: '2025-08-15', amount: '10000', refundedAmount: '0',
            taxFreeAssistance: '1000', educationCreditAmount: '1000', otherTaxBenefitAmount: '0', qualificationConfirmed: true }],
          allocations: [{ expenseId: 'tuition', sourceId: 'prepaid', amount: '3500', creditAmount: '500' },
            { expenseId: 'tuition', sourceId: 'cash-qtp', amount: '4500', creditAmount: '500' }],
          inKindBenefits: [{ id: 'benefit', sourceId: 'prepaid', expenseId: 'tuition', amount: '4000', providedDate: '2025-08-15', qualificationConfirmed: true,
            sourceReference: 'Synthetic actual tuition credit application' }], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
        },
      },
    },
  };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual cash tuition assistance at ${viewport.width}px`, () => {
    test('preserves cash assistance sources through edits and reload', async ({ page }, testInfo) => {
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
      }, { id, state: actualCashAssistanceInterview() });
      await page.reload();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const checked = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const medium = page.getByRole('combobox', { name: 'Actual 529 distribution form', exact: true });
      const amounts = page.getByRole('textbox', { name: 'Net expense allocated to this distribution', exact: true });
      const assistance = page.getByRole('textbox', { name: 'Tax-free assistance allocated to this expense', exact: true });
      // Literal 2025 table: 3,989 regular tax - 200 LLC + 75 education tax.
      await expect(hero).toHaveText('$16,136');
      await expect(medium).toHaveCount(2); await expect(medium.nth(0)).toHaveValue('in_kind_prepaid_tuition'); await expect(medium.nth(1)).toHaveValue('cash');
      await expect(amounts).toHaveCount(2); await expect(assistance).toHaveValue('1000');
      await assistance.fill('2000'); await amounts.nth(1).fill('3500'); await amounts.nth(1).press('Tab');
      await expect(checked).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await checked.selectOption('true');
      // Changed actual assistance: 4,019 regular tax - 200 LLC + 100 education tax.
      await expect(hero).toHaveText('$16,081');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions.expenses[0].taxFreeAssistance, id)).toBe('2,000');
      await page.reload(); await expect(amounts.nth(1)).toHaveValue('3,500'); await expect(assistance).toHaveValue('2,000');
      await assistance.fill(''); await checked.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(assistance).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await assistance.fill('0'); await amounts.nth(1).fill('5500'); await amounts.nth(1).press('Tab'); await checked.selectOption('true');
      // Actual zero assistance: 3,959 regular tax - 200 LLC + 50 education tax.
      await expect(hero).toHaveText('$16,191');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions.expenses[0].taxFreeAssistance, id)).toBe('0');
      await assistance.fill('2000'); await amounts.nth(1).fill('3500'); await amounts.nth(1).press('Tab'); await checked.selectOption('true');
      await expect(hero).toHaveText('$16,081');
      await page.reload(); await expect(assistance).toHaveValue('2,000'); await expect(checked).toHaveValue('true'); await expect(hero).toHaveText('$16,081');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions, id);
      expect(saved.forms.map((row: { fields: { sourceId: string; grossDistribution: string; earnings: string; basis: string } }) => [row.fields.sourceId, row.fields.grossDistribution, row.fields.earnings, row.fields.basis]))
        .toEqual([['prepaid', '4000', '800', '3200'], ['cash-qtp', '8000', '2000', '6000']]);
      expect(saved.inKindBenefits.map((row: { sourceId: string; amount: string }) => [row.sourceId, row.amount])).toEqual([['prepaid', '4000']]);
      expect(saved.expenses[0].taxFreeAssistance).toBe('2,000'); expect(saved.expenses[0].educationCreditAmount).toBe('1000');
      for (const secret of ['123-45-6789', 'fictional-cash-qtp-account', 'Synthetic actual tuition credit application']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await amounts.nth(1).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`cash-assistance-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`cash-assistance-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Distribution form: Cash distribution', 'Distribution form: Prepaid tuition or in-kind benefit',
        'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $1225',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $100']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'fictional-cash-qtp-account', 'Synthetic actual tuition credit application']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('fictional-cash-qtp-account'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`cash-assistance-review-${viewport.width}.png`) });
    });
  });
}
