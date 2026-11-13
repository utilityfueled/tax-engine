// Spec: spec/state/pa-guided-union-dues.yaml.
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { guidedPAOrdinaryPanelFixture, required } from '../../../tests/fixtures/guided-pa-ordinary-panels';
import { calculatePAOrdinaryReturn } from '../../../src/engine/state/pa-ordinary-return';
import { calculatePAResidencySources } from '../../../src/engine/state/pa-residency-sources';
import { TaxYearInputSchema } from '../../../src/models/inputs';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { buildGuidedPAOrdinarySourceInput, buildSectionRoute, type GuidedFlowState } from '../src/lib/guided-interview-flow';
import { confirmGuidedPAResidencySources } from '../src/lib/guided-pa-residency-facts';
import { buildGuidedStateOriginals } from '../src/lib/guided-state-engine-inputs';

const receiptReference = 'Fictional Local 105 dues original B-423';
const correctedReference = 'Fictional Local 105 dues original B-423 corrected locator';
const statementReference = 'Fictional signed complete timecard and union dues statement';
const workingReference = 'Fictional payroll timecard P-423';
const leaveReference = 'Fictional holiday calendar H-423';
const receiptAmount = 'Union dues receipt 1 actual amount';
const confirmDues = 'Confirm actual PA union dues after the last edit';
const confirmed = 'Actual Pennsylvania union dues and residency sources confirmed.';
const unconfirmed = 'Actual union dues records still need confirmation.';
const restrictedRequest = /^\/api\/(?:provider(?:\/|$)|workspace\/(?:filled-return|tax-explanation)\/?$|business-expense-analysis\/?$|self-employment-income-analysis\/?$)/u;

async function enter(group: Locator, label: string, value: string) {
  const select = group.getByRole('combobox', { name: label, exact: true });
  if (await select.count()) {
    await select.selectOption(value);
    return;
  }
  const textbox = group.getByRole('textbox', { name: label, exact: true });
  const field = (await textbox.count()) ? textbox : group.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Tab');
}

function source(state: GuidedFlowState) {
  return required(state.sectionData['state-return']?.paResidencySources);
}

function employee(state: GuidedFlowState) {
  return required(source(state).employeeSources);
}

async function saved(page: Page, id: string): Promise<GuidedFlowState> {
  return page.evaluate(id => {
    const data = localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`);
    if (!data) throw new Error('Expected a saved local guided return');
    return JSON.parse(data);
  }, id);
}

async function seedUnrelatedOriginals(page: Page) {
  const { state, data } = guidedPAOrdinaryPanelFixture();
  required(state.sectionData['income-w2']).entries[0].allocatedTips = '0';
  const originals = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
  const parent = structuredClone(required(data.paResidencySources));
  Object.assign(parent.wages[0].payroll[0], {
    serviceFrom: '2025-12-29', paServicesCompensation: '50000', outsidePAServicesCompensation: '0',
  });
  data.paResidencySources = confirmGuidedPAResidencySources(originals, parent);
  const unrelatedHistory = required(data.paOrdinaryReturnCompletionSources).otherStateTaxes;
  required(unrelatedHistory.jurisdictions[0]).completeThroughDate = '2026-02-01';
  const route = buildSectionRoute(state.segmentation);
  const index = route.findIndex(section => section.id === 'state-return');
  expect(index).toBeGreaterThan(0);
  state.phase = 'interview';
  state.currentSectionIndex = index;
  state.completedSections = route.slice(0, index + 1).map(section => section.id);
  expect(source(state).employeeSources).toBeUndefined();

  await page.goto('/returns/new');
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/iu);
  const id = required(new URL(page.url()).pathname.split('/').at(-1));
  await expect.poll(() => page.evaluate(workspace => Boolean(
    JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[workspace],
  ), id)).toBe(true);
  // Seed unrelated fictional facts once. Every employment, signed verification,
  // calendar and dues-receipt fact starts absent and is entered through the UI.
  await page.evaluate(({ id, state }) => {
    localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
  }, { id, state });
  await page.reload();
  return { id, originals };
}

async function enterCalendarRange(group: Locator, reference: string, from: string, through: string, classification: string) {
  await enter(group, 'Original work calendar reference', reference);
  await enter(group, 'Calendar range first date', from);
  await enter(group, 'Calendar range last date', through);
  await enter(group, 'Actual classification for each date in the range', classification);
  await group.getByRole('button', { name: 'Add documented work calendar range', exact: true }).click();
}

async function confirmByKeyboard(group: Locator) {
  const confirm = group.getByRole('button', { name: confirmDues, exact: true });
  await confirm.focus();
  await expect(confirm).toBeFocused();
  await confirm.press('Enter');
}

async function verifyGeometry(group: Locator, testInfo: TestInfo) {
  const geometry = await group.evaluate(root => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    clippedControls: Array.from(root.querySelectorAll('input, select, button')).filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(node => node.getAttribute('type') ?? node.tagName),
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.clippedControls).toEqual([]);
  await testInfo.attach('union-dues-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' });
}

function assertResidencyResult(state: GuidedFlowState, expenses: string, taxableIncome: string, tax: string) {
  const current = required(buildGuidedPAOrdinarySourceInput(state));
  const result = calculatePAResidencySources(current, current.paResidencySources);
  expect(result.employeeSources?.perEmployer[0].scheduleUE.line1.toFixed()).toBe(expenses);
  expect([
    result.reportedCompensation,
    result.unreimbursedEmployeeExpenses,
    result.totalOrdinaryPATaxableIncome,
    result.taxBeforeCredits,
  ].map(amount => amount.toFixed())).toEqual(['50000', expenses, taxableIncome, tax]);
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Native PA union dues at ${viewport.width}px`, () => {
    test('collects and reopens original union dues, distinguishing unknown from zero', async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize(viewport);
      const origin = new URL(required(baseURL)).origin;
      const requests: Array<{ url: string; body: string }> = [];
      const errors: string[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      page.on('pageerror', error => errors.push(error.message));

      const { id, originals } = await seedUnrelatedOriginals(page);
      const section = page.locator('.guided-section-transition');
      await expect(section.getByRole('heading', { name: 'Pennsylvania State Return', exact: true })).toBeVisible();
      const add = section.getByRole('button', { name: 'Add actual Pennsylvania union dues', exact: true });
      await add.focus();
      await expect(add).toBeFocused();
      await add.press('Enter');
      const group = section.getByRole('group', { name: 'Actual Pennsylvania union dues', exact: true });
      const status = group.getByRole('status');
      await expect(status).toHaveText(unconfirmed);
      const before = employee(await saved(page, id));
      expect(before.sourceFactsConfirmed).toBeNull();
      expect(before.employers[0].calendar).toEqual([]);
      expect(before.employers[0].statement.signed).toBeNull();
      expect(before.employers[0].ue.expenses).toEqual([]);
      expect(before.employers[0].ue.allExpenseAndReimbursementSourcesReviewedConfirmed).toBeNull();
      expect(before.employers[0].employmentPeriods).toEqual([{ from: '', through: '', sourceReference: '' }]);
      expect(before.employers[0].originalW2).toEqual(originals.w2s[0]);

      const sourceValues = [
        ['Union dues employee packet reference', 'Fictional union dues ledger E-423'],
        ['Union dues records complete through', '2026-02-01'],
        ['Employer address for union dues', '25 Fictional Harrisburg Ave, Harrisburg PA 17101'],
        ['Employer telephone for union dues', '717-555-0105'],
        ['Job duties requiring union membership', 'Operate fictional municipal maintenance equipment'],
        ['Actual employment record reference', 'Fictional employment record W-423'],
        ['Actual employment first date', '2025-12-29'],
        ['Actual employment last date', '2025-12-31'],
        ['Signed employer verification reference', statementReference],
        ['Employer signer name', 'Morgan Example'],
        ['Employer signer role', 'Payroll manager'],
        ['Employer statement signature date', '2026-01-22'],
        ['Signed employer statement is available and verifies the complete PA work calendar', 'true'],
      ];
      for (const [label, value] of sourceValues) await enter(group, label, value);
      await enterCalendarRange(group, workingReference, '2025-12-29', '2025-12-30', 'working');
      await enterCalendarRange(group, leaveReference, '2025-12-31', '2025-12-31', 'vacation_leave');
      await group.getByText('Review 3 recorded calendar dates', { exact: true }).click();
      await expect(group.getByText(`${leaveReference} (2025-12-31) · Vacation or leave without work`, { exact: false })).toBeVisible();
      await group.getByRole('button', { name: 'Add actual union dues receipt', exact: true }).click();
      for (const [label, value] of [
        ['Union dues receipt 1 union name', 'Fictional Local 105'],
        ['Union dues receipt 1 original reference', receiptReference],
        ['Union dues receipt 1 date paid', '2025-12-30'],
        ['Union dues receipt 1 qualifies as an actual required unreimbursed expense', 'true'],
        ['Signed employer records confirm required dues and no reimbursement, and all sources were checked', 'true'],
        ['Other actual employee expense classes are known none', 'true'],
      ]) await enter(group, label, value);

      const amount = group.getByRole('textbox', { name: receiptAmount, exact: true });
      await expect(amount).toHaveValue('');
      await expect(amount).toHaveAttribute('inputmode', 'decimal');
      await confirmByKeyboard(group);
      await expect(status).toContainText(/actual.*amount/i);
      const unknown = await saved(page, id);
      expect(employee(unknown).employers[0].ue.expenses[0].amount).toBe('');
      expect(employee(unknown).sourceFactsConfirmed).toBeNull();
      expect(source(unknown).sourceFactsConfirmed).toBeNull();
      expect(buildGuidedPAOrdinarySourceInput(unknown)).toBeNull();
      await page.reload();
      await expect(amount).toHaveValue('');
      expect(employee(await saved(page, id))).toEqual(employee(unknown));

      await enter(group, receiptAmount, '0');
      await confirmByKeyboard(group);
      await expect(status).toHaveText(confirmed);
      const zero = await saved(page, id);
      expect(employee(zero).employers[0].ue.expenses[0].amount).toBe('0');
      assertResidencyResult(zero, '0', '50120', '1539');

      await enter(group, receiptAmount, '300.60');
      await expect(status).toHaveText(unconfirmed);
      expect(buildGuidedPAOrdinarySourceInput(await saved(page, id))).toBeNull();
      await confirmByKeyboard(group);
      await expect(status).toHaveText(confirmed);
      const withDues = employee(await saved(page, id));
      expect(withDues.employers[0].calendar.map(day => [day.kind, day.sourceReference])).toEqual([
        ['working', `${workingReference} (2025-12-29)`],
        ['working', `${workingReference} (2025-12-30)`],
        ['nonworking', `${leaveReference} (2025-12-31)`],
      ]);
      assertResidencyResult(await saved(page, id), '301', '49819', '1529');

      const progress = page.locator('.guided-progress-step');
      await progress.filter({ hasText: /^W-2 Wages$/u }).click();
      await expect(section.getByRole('textbox', { name: 'Employer name', exact: true })).toHaveValue(originals.w2s[0].employer.name);
      await progress.filter({ hasText: /^State Return$/u }).click();
      await expect(status).toHaveText(confirmed);
      const paSource = section.getByRole('region', { name: 'Actual Pennsylvania residency sources', exact: true });
      const payroll = paSource.getByRole('textbox', { name: 'Payroll 1 segment 1 actual record reference', exact: true });
      const originalPayroll = await payroll.inputValue();
      await enter(paSource, 'Payroll 1 segment 1 actual record reference', 'Fictional changed payroll original');
      await expect(status).toHaveText(unconfirmed);
      await confirmByKeyboard(group);
      await expect(status).toContainText('The original W-2, owner or payroll changed');
      expect(employee(await saved(page, id))).toEqual(withDues);
      await enter(paSource, 'Payroll 1 segment 1 actual record reference', originalPayroll);
      await enter(group, 'Union dues receipt 1 original reference', correctedReference);
      const stale = await saved(page, id);
      expect(employee(stale).sourceFactsConfirmed).toBeNull();
      expect(source(stale).sourceFactsConfirmed).toBeNull();
      expect(employee(stale).employers[0].originalW2).toEqual(originals.w2s[0]);
      await confirmByKeyboard(group);
      await expect(status).toHaveText(confirmed);
      assertResidencyResult(await saved(page, id), '301', '49819', '1529');

      const actualReturn = section.getByRole('region', { name: 'Actual Pennsylvania return sources', exact: true });
      await enter(actualReturn, 'Actual as-of date', '2026-02-01');
      await enter(actualReturn, 'Actual overpayment election status', 'allocation');
      await enter(actualReturn, 'Overpayment election original source reference', 'Fictional election to receive entire PA overpayment');
      await enter(actualReturn, 'Actual requested refund', '10');
      await actualReturn.getByRole('button', { name: 'Confirm all actual PA return sources after the last edit', exact: true }).click();
      await expect(actualReturn.getByRole('status')).toHaveText('Actual originals confirmed after the last edit.');
      await section.getByRole('button', { name: 'Confirm actual PA completion sources after the last edit', exact: true }).click();
      await expect(section.getByText('Actual completion originals confirmed after the last edit.', { exact: true })).toBeVisible();
      const taxRow = section.locator('.guided-ticker-breakdown-row').filter({ hasText: /^State Tax/u });
      await expect(taxRow).toContainText('$1,529');
      const finalState = await saved(page, id);
      const canonical = buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(finalState)), finalState);
      const calculated = calculatePAOrdinaryReturn(canonical, canonical.paOrdinaryReturnFacts, canonical.paOrdinaryReturnCompletionSources);
      expect(calculated.pa40.netOverpayment.toFixed()).toBe('10');
      expect(calculated.readiness.filingEligible).toBe(false);

      await amount.scrollIntoViewIfNeeded();
      await verifyGeometry(group, testInfo);
      await page.screenshot({ path: testInfo.outputPath('confirmed-pa-union-dues.png') });
      await page.goto('/');
      await page.goto(`/returns/${id}`);
      await expect(group.getByRole('textbox', { name: 'Union dues receipt 1 original reference', exact: true })).toHaveValue(correctedReference);
      await expect(amount).toHaveValue('300.60');
      await expect(status).toHaveText(confirmed);
      await expect(taxRow).toContainText('$1,529');
      const reopened = await saved(page, id);
      expect(source(reopened)).toEqual(source(finalState));
      assertResidencyResult(reopened, '301', '49819', '1529');

      expect(requests.every(request => new URL(request.url).origin === origin)).toBe(true);
      const restrictedCount = requests.filter(request => restrictedRequest.test(new URL(request.url).pathname)).length;
      expect(restrictedCount).toBe(0);
      const wire = requests.map(({ url, body }) => url + '\n' + body).join('\n');
      for (const marker of [originals.taxpayer.primary.ssn, receiptReference, correctedReference, statementReference, workingReference, leaveReference]) {
        expect(wire).not.toContain(marker);
      }
      expect(errors).toEqual([]);
      await testInfo.attach('union-dues-privacy.json', {
        body: JSON.stringify({ browserRequests: requests.length, restrictedRequests: restrictedCount, pageErrors: errors.length }),
        contentType: 'application/json',
      });
    });
  });
}
