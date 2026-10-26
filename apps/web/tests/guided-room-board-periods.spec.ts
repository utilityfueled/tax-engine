// Spec: spec/federal/form-1099-q-room-board-periods.yaml browser-period-records.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

// Explicit fictional original records, with no application alias or calculated
// outcome imported into the browser fixture.
function actualPeriodInterview(medium: 'cash' | 'in_kind_prepaid_tuition') {
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
        educationDistributions: { taxYear: '2025', sourceFactsConfirmed: true, allDistributionsReconciled: true, exceptionsDistinctFromCreditConfirmed: true,
          beneficiaries: [{ id: 'educator', name: 'Jane Doe', studentTaxId: '123-45-6789', outsideK12QualifiedDistributions: '0' }],
          forms: [{ fields: { sourceId: 'prepaid', accountId: 'prepaid-account', beneficiaryId: 'educator', recipientOwner: 'primary', taxYear: '2025',
            sourceFactsComplete: true, sourceFactsConfirmed: true, accountType: '529', distributionMedium: medium,
            grossDistribution: '10000', earnings: '2000', basis: '8000', isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false }, transfer: { kind: 'none' } }],
          expenses: ['first', 'second'].map(id => ({ id, beneficiaryId: 'educator', category: 'postsecondary_room_board', paidDate: '2025-09-01', amount: '5000',
            refundedAmount: '0', taxFreeAssistance: '0', educationCreditAmount: '0', otherTaxBenefitAmount: '0', qualificationConfirmed: true })),
          allocations: ['first', 'second'].map(expenseId => ({ expenseId, sourceId: 'prepaid', amount: '5000', creditAmount: '0' })),
          inKindBenefits: medium === 'cash' ? [] : ['first', 'second'].map(expenseId => ({ id: `benefit-${expenseId}`, sourceId: 'prepaid', expenseId, amount: '5000', providedDate: '2025-09-01',
            qualificationConfirmed: true, sourceReference: 'Fictional actual benefit receipt' })),
          roomBoardPeriods: [{ id: 'fall', beneficiaryId: 'educator', sourceTaxYear: '2025', sourceReference: 'Fictional fall attendance record', sourceFactsConfirmed: true,
            institutionId: 'fictional-institution', institutionName: 'Fictional Example College', institutionEligible: true,
            academicPeriodStart: '2025-08-15', academicPeriodEnd: '2025-12-20', livingArrangement: 'off_campus', halfTimeStudent: true,
            roomBoardAllowance: '6000', allowanceApplicableConfirmed: true, schoolOwnedHousing: false, schoolOwnedHousingCharge: '0', allReceiptsIncludedConfirmed: true }],
          roomBoardPeriodExpenses: ['first', 'second'].map(expenseId => ({ periodId: 'fall', expenseId, coveredStart: '2025-09-01', coveredEnd: '2025-12-01',
            sourceReference: `Fictional receipt ${expenseId}`, sourceFactsConfirmed: true })),
          roomBoardEsaAllocations: [], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
        },
      },
    },
  };
}

for (const medium of ['cash', 'in_kind_prepaid_tuition'] as const) {
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual ${medium} academic periods at ${viewport.width}px`, () => {
    test('preserves original academic periods through edits reload and review', async ({ page }, testInfo) => {
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
      }, { id, state: actualPeriodInterview(medium) });
      await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const allowance = page.getByRole('textbox', { name: 'Actual period room-and-board allowance', exact: true });
      const period = page.getByRole('combobox', { name: 'Actual academic-period records checked', exact: true });
      const links = page.getByRole('combobox', { name: 'Receipt and period link checked', exact: true });
      const annual = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const confirm = async () => { await period.selectOption('true'); await links.nth(0).selectOption('true'); await links.nth(1).selectOption('true'); await annual.selectOption('true'); };
      // 2025 single table: taxable35050 ->3971 regular tax, plus80 education tax.
      await expect(hero).toHaveText('$15,949'); await expect(allowance).toHaveValue('6000'); await expect(links).toHaveCount(2);
      await allowance.fill('7000'); await allowance.press('Tab');
      await expect(period).toHaveValue(''); await expect(links.nth(0)).toHaveValue(''); await expect(links.nth(1)).toHaveValue(''); await expect(annual).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await annual.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      await confirm();
      // Taxable34850 ->3947 regular tax, plus60 education tax.
      await expect(hero).toHaveText('$15,993');
      await page.reload(); await expect(allowance).toHaveValue('7,000'); await expect(period).toHaveValue('true');
      await allowance.fill(''); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(allowance).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await allowance.fill('0'); await allowance.press('Tab'); await confirm();
      // Taxable36250 ->4115 regular tax, plus200 education tax.
      await expect(hero).toHaveText('$15,685');
      await page.reload(); await expect(allowance).toHaveValue('0');
      await allowance.fill('7000'); await allowance.press('Tab'); await confirm(); await expect(hero).toHaveText('$15,993');
      const savedState = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const saved = savedState.sectionData.credits.educationDistributions;
      writeFileSync(testInfo.outputPath(`room-period-original-${medium}-${viewport.width}.json`), JSON.stringify(savedState, null, 2) + '\n');
      expect(saved.roomBoardPeriods[0].schoolOwnedHousing).toBe(false); expect(saved.roomBoardPeriods[0].roomBoardAllowance).toBe('7,000');
      expect(saved.expenses.map((row: { amount: string }) => row.amount)).toEqual(['5000', '5000']);
      expect(saved.inKindBenefits.map((row: { amount: string }) => row.amount)).toEqual(medium === 'cash' ? [] : ['5000', '5000']);
      expect(saved.forms[0].fields.distributionMedium).toBe(medium);
      expect(saved.forms[0].fields.grossDistribution).toBe('10000'); expect(saved.forms[0].fields.basis).toBe('8000');
      for (const secret of ['123-45-6789', 'fictional-institution', 'Fictional fall attendance record', 'prepaid-account']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await allowance.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`room-period-source-${medium}-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`room-period-review-${medium}-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Academic period', 'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $600',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $60']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'fictional-institution', 'Fictional fall attendance record', 'prepaid-account']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('fictional-institution'))) { expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`room-period-review-${medium}-${viewport.width}.png`) });
    });
  });
}
}
