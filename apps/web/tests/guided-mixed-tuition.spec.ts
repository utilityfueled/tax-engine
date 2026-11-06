// Spec: spec/federal/form-1099-q-mixed-tuition.yaml browser.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

// Explicit fictional records, kept local to the browser runner so no application
// alias or unit-test helper supplies a calculated amount or an inferred election.
function actualMixedTuitionInterview() {
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
            { fields: { ...statement, sourceId: 'esa', accountId: 'actual-esa-account', accountType: 'coverdell_esa', distributionMedium: 'cash', grossDistribution: '6000', earnings: '1200', basis: '4800' }, transfer: { kind: 'none' } },
            { fields: { ...statement, sourceId: 'cash-qtp', accountId: 'actual-cash-qtp-account', accountType: '529', distributionMedium: 'cash', grossDistribution: '2000', earnings: '1000', basis: '1000' }, transfer: { kind: 'none' } },
          ],
          expenses: [{ id: 'tuition', beneficiaryId: 'educator', category: 'postsecondary_tuition', paidDate: '2025-08-15', amount: '8000', refundedAmount: '0',
            taxFreeAssistance: '1000', educationCreditAmount: '1000', otherTaxBenefitAmount: '0', qualificationConfirmed: true }],
          allocations: [{ expenseId: 'tuition', sourceId: 'prepaid', amount: '1000', creditAmount: '1000' },
            { expenseId: 'tuition', sourceId: 'esa', amount: '4000', creditAmount: '0' }, { expenseId: 'tuition', sourceId: 'cash-qtp', amount: '1000', creditAmount: '0' }],
          inKindBenefits: [{ id: 'benefit', sourceId: 'prepaid', expenseId: 'tuition', amount: '4000', providedDate: '2025-08-15', qualificationConfirmed: true,
            sourceReference: 'Synthetic actual tuition credit application' }], loanBorrowers: [], penaltyExceptions: [],
          coverdellAccounts: [{ accountId: 'actual-esa-account', priorYearBasis: '4800', currentYearContributions: '0', yearEndValue: '0', outstandingRollovers: '0', rolloverBasisReceived: '0' }],
        },
      },
    },
  };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual mixed tuition sources at ${viewport.width}px`, () => {
    test('preserves mixed tuition sources through allocation edits and reload', async ({ page }, testInfo) => {
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
      }, { id, state: actualMixedTuitionInterview() });
      await page.reload();
      await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const checked = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const medium = page.getByRole('combobox', { name: 'Actual 529 distribution form', exact: true });
      const amounts = page.getByRole('textbox', { name: 'Net expense allocated to this distribution', exact: true });
      const basis = page.getByRole('textbox', { name: 'Actual prior-year account basis', exact: true });
      // Literal table-based derivation: 4,055 regular tax - 200 LLC + 130 education tax.
      await expect(hero).toHaveText('$16,015');
      await expect(medium).toHaveCount(2); await expect(medium.nth(0)).toHaveValue('in_kind_prepaid_tuition'); await expect(medium.nth(1)).toHaveValue('cash');
      await expect(amounts).toHaveCount(3); await expect(basis).toHaveCount(1);
      await amounts.nth(2).fill('1500'); await amounts.nth(1).fill('3500'); await amounts.nth(1).press('Tab');
      await expect(checked).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await checked.selectOption('true');
      // Changed actual allocation: 4,037 regular tax - 200 LLC + 115 education tax.
      await expect(hero).toHaveText('$16,048');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions.allocations[2].amount, id)).toBe('1,500');
      await page.reload(); await expect(amounts.nth(2)).toHaveValue('1,500'); await expect(amounts.nth(1)).toHaveValue('3,500');
      await basis.fill(''); await checked.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(basis).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await basis.fill('0'); await basis.press('Tab'); await checked.selectOption('true');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions.coverdellAccounts[0].priorYearBasis, id)).toBe('0');
      await basis.fill('4800'); await basis.press('Tab'); await checked.selectOption('true'); await expect(hero).toHaveText('$16,048');
      await page.reload(); await expect(basis).toHaveValue('4,800'); await expect(checked).toHaveValue('true'); await expect(hero).toHaveText('$16,048');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData.credits.educationDistributions, id);
      expect(saved.forms.map((row: { fields: { sourceId: string; grossDistribution: string; earnings: string; basis: string } }) => [row.fields.sourceId, row.fields.grossDistribution, row.fields.earnings, row.fields.basis]))
        .toEqual([['prepaid', '4000', '800', '3200'], ['esa', '6000', '1200', '4800'], ['cash-qtp', '2000', '1000', '1000']]);
      expect(saved.inKindBenefits.map((row: { sourceId: string; amount: string }) => [row.sourceId, row.amount])).toEqual([['prepaid', '4000']]);
      expect(saved.expenses[0].taxFreeAssistance).toBe('1000'); expect(saved.expenses[0].educationCreditAmount).toBe('1000');
      for (const secret of ['123-45-6789', 'actual-esa-account', 'actual-cash-qtp-account', 'Synthetic actual tuition credit application']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await amounts.nth(2).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`mixed-tuition-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
      expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`mixed-tuition-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Distribution form: Cash distribution', 'Distribution form: Prepaid tuition or in-kind benefit',
        'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $1350',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $115']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'actual-esa-account', 'actual-cash-qtp-account', 'Synthetic actual tuition credit application']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('actual-cash-qtp-account'))) {
        expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
        expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`mixed-tuition-review-${viewport.width}.png`) });
    });
  });
}
