// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml browser-prior-records.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

// Explicit fictional original records, with no application alias or calculated
// outcome imported into the browser fixture.
function actualPriorPeriodInterview(medium: 'cash' | 'in_kind_prepaid_tuition') {
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
          expenses: ['first', 'second'].map(id => ({ id, beneficiaryId: 'educator', category: 'postsecondary_room_board', paidDate: '2025-01-15', amount: '5000',
            refundedAmount: '0', taxFreeAssistance: '0', educationCreditAmount: '0', otherTaxBenefitAmount: '0', qualificationConfirmed: true })),
          allocations: ['first', 'second'].map(expenseId => ({ expenseId, sourceId: 'prepaid', amount: '5000', creditAmount: '0' })),
          inKindBenefits: medium === 'cash' ? [] : ['first', 'second'].map(expenseId => ({ id: `benefit-${expenseId}`, sourceId: 'prepaid', expenseId, amount: '5000', providedDate: '2025-01-15',
            qualificationConfirmed: true, sourceReference: 'Fictional actual benefit receipt' })),
          roomBoardPeriods: [{ id: 'fall', beneficiaryId: 'educator', sourceTaxYear: '2025', sourceReference: 'Fictional fall attendance record', sourceFactsConfirmed: true,
            institutionId: 'fictional-institution', institutionName: 'Fictional Example College', institutionEligible: true,
            academicPeriodStart: '2024-08-15', academicPeriodEnd: '2025-06-20', livingArrangement: 'off_campus', halfTimeStudent: true,
            roomBoardAllowance: '6000', allowanceApplicableConfirmed: true, schoolOwnedHousing: false, schoolOwnedHousingCharge: '0', allReceiptsIncludedConfirmed: true, priorUseHistoryConfirmed: true, priorUseHistorySourceReference: 'Fictional complete period history' }],
          roomBoardPeriodExpenses: ['first', 'second'].map(expenseId => ({ periodId: 'fall', expenseId, coveredStart: '2025-01-15', coveredEnd: '2025-06-01',
            sourceReference: `Fictional receipt ${expenseId}`, sourceFactsConfirmed: true })),
          roomBoardPriorUses: [{ id: 'prior-worksheet', periodId: 'fall', sourceTaxYear: '2024',
            sourceReference: 'Fictional filed prior period worksheet', sourceFactsConfirmed: true, allPriorUseSourcesIncludedConfirmed: true, noPostFilingChangesConfirmed: true,
            beneficiaryId: 'educator', beneficiaryName: 'Jane Doe', institutionId: 'fictional-institution', academicPeriodStart: '2024-08-15', academicPeriodEnd: '2025-06-20',
            livingArrangement: 'off_campus', institutionEligible: true, halfTimeStudent: true, roomBoardAllowance: '6000', schoolOwnedHousing: false, schoolOwnedHousingCharge: '0',
            qualifiedCostBeforeAssistance: '5000', adjustedQualifiedExpenses: '4000' }],
          roomBoardPriorUseExpenses: [{ id: 'prior-receipt', priorUseId: 'prior-worksheet', paidDate: '2024-09-01', coveredStart: '2024-09-01', coveredEnd: '2024-12-20',
            amount: '5000', refundedAmount: '0', taxFreeAssistance: '1000', educationCreditAmount: '0', otherTaxBenefitAmount: '0', qualificationConfirmed: true,
            sourceReference: 'Fictional actual prior room receipt', sourceFactsConfirmed: true }],
          roomBoardEsaAllocations: [], loanBorrowers: [], coverdellAccounts: [], penaltyExceptions: [],
        },
      },
    },
  };
}

for (const medium of ['cash', 'in_kind_prepaid_tuition'] as const) {
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual ${medium} prior academic-period use at ${viewport.width}px`, () => {
    test('preserves prior academic period use through edits reload and review', async ({ page }, testInfo) => {
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
      }, { id, state: actualPriorPeriodInterview(medium) });
      await page.reload(); await expect(page.locator('.guided-progress-step-active')).toContainText('Credits');
      const hero = page.locator('.guided-ticker-value-hero').first();
      const receipt = page.getByRole('textbox', { name: 'Prior receipt original amount', exact: true });
      const qualified = page.getByRole('textbox', { name: 'Prior worksheet qualified cost before assistance', exact: true });
      const adjusted = page.getByRole('textbox', { name: 'Prior worksheet adjusted qualified expenses', exact: true });
      const refund = page.getByRole('textbox', { name: 'Prior receipt actual refund (0 if none)', exact: true });
      const period = page.getByRole('combobox', { name: 'Actual academic-period records checked', exact: true });
      const links = page.getByRole('combobox', { name: 'Receipt and period link checked', exact: true });
      const history = page.getByRole('combobox', { name: 'Actual prior worksheet checked', exact: true });
      const priorReceipt = page.getByRole('combobox', { name: 'Actual prior receipt checked', exact: true });
      const unchanged = page.getByRole('combobox', { name: 'Prior worksheet unchanged after filing', exact: true });
      const annual = page.getByRole('combobox', { name: 'All education sources and allocations checked after the last edit', exact: true });
      const confirm = async () => { await period.selectOption('true'); await links.nth(0).selectOption('true'); await links.nth(1).selectOption('true');
        await history.selectOption('true'); await priorReceipt.selectOption('true'); await annual.selectOption('true'); };
      // Actual prior cap use5000 leaves1000. AGI51800: table4091 plus180 tax.
      await expect(hero).toHaveText('$15,729'); await expect(receipt).toHaveValue('5000');
      await receipt.fill('4000'); await receipt.press('Tab');
      await expect(period).toHaveValue(''); await expect(history).toHaveValue(''); await expect(priorReceipt).toHaveValue(''); await expect(annual).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await qualified.fill('4000'); await adjusted.fill('3000'); await adjusted.press('Tab'); await confirm();
      // Actual revised history leaves2000. AGI51600: table4067 plus160 tax.
      await expect(hero).toHaveText('$15,773');
      await page.reload(); await expect(receipt).toHaveValue('4,000'); await expect(history).toHaveValue('true');
      await refund.fill(''); await refund.press('Tab'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(refund).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await refund.fill('0'); await refund.press('Tab'); await confirm(); await expect(hero).toHaveText('$15,773');
      await unchanged.selectOption('false'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await expect(unchanged).toHaveValue('false');
      await unchanged.selectOption('true'); await confirm(); await expect(hero).toHaveText('$15,773');
      const savedState = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      const saved = savedState.sectionData.credits.educationDistributions;
      writeFileSync(testInfo.outputPath(`room-prior-original-${medium}-${viewport.width}.json`), JSON.stringify(savedState, null, 2) + '\n');
      expect(saved.roomBoardPeriods[0].schoolOwnedHousing).toBe(false); expect(saved.roomBoardPeriods[0].roomBoardAllowance).toBe('6000');
      expect(saved.roomBoardPriorUses[0].qualifiedCostBeforeAssistance).toBe('4,000'); expect(saved.roomBoardPriorUses[0].adjustedQualifiedExpenses).toBe('3,000');
      expect(saved.roomBoardPriorUseExpenses[0].amount).toBe('4,000'); expect(saved.roomBoardPriorUseExpenses[0].taxFreeAssistance).toBe('1000');
      expect(saved.expenses.map((row: { amount: string }) => row.amount)).toEqual(['5000', '5000']);
      expect(saved.inKindBenefits.map((row: { amount: string }) => row.amount)).toEqual(medium === 'cash' ? [] : ['5000', '5000']);
      expect(saved.forms[0].fields.distributionMedium).toBe(medium);
      expect(saved.forms[0].fields.grossDistribution).toBe('10000'); expect(saved.forms[0].fields.basis).toBe('8000');
      for (const secret of ['123-45-6789', 'fictional-institution', 'Fictional fall attendance record', 'Fictional filed prior period worksheet', 'Fictional actual prior room receipt', 'prepaid-account']) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await receipt.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`room-prior-source-${medium}-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`room-prior-review-${medium}-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', output], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const literal of ['Prior qualified cost before assistance: $4000', 'Prior adjusted qualified expenses: $3000', 'Remaining period limit: $2000', 'Academic period', 'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $1600',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $160']) expect(text).toContain(literal);
      for (const pageText of pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123-45-6789', '123456789', 'fictional-institution', 'Fictional fall attendance record', 'Fictional filed prior period worksheet', 'Fictional actual prior room receipt', 'prepaid-account']) expect(text).not.toContain(secret);
      for (const request of requests.filter(request => request.body.includes('fictional-institution'))) { expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`room-prior-review-${medium}-${viewport.width}.png`) });
    });
  });
}
}
