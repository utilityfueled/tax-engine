// Spec: spec/state/oh-school-district-native-browser.yaml.
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  guidedSchoolDistrictFixture,
  readSchoolDraft,
  required,
  schoolNativeFields,
  sdConfirmLabel,
} from '../../../tests/fixtures/guided-oh-school-district-complete';
import { buildSectionRoute, type GuidedFlowState } from '../src/lib/guided-interview-flow';

// Exact visible label, including password/date fields without an implicit textbox role.
function control(page: Page, label: string): Locator {
  return page.locator('label').filter({ has: page.getByText(label, { exact: true }) }).locator('input,select');
}
async function enter(page: Page, label: string, value: string) {
  const field = control(page, label);
  await expect(field).toHaveCount(1);
  if (await field.evaluate(node => node.tagName) === 'SELECT') await field.selectOption(value);
  else { await field.fill(value); await field.press('Tab'); }
}
async function saved(page: Page, id: string): Promise<GuidedFlowState> {
  const state = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? 'null') as GuidedFlowState | null, id);
  return required(state);
}
async function draft(page: Page, id: string) {
  return readSchoolDraft(required((await saved(page, id)).sectionData['state-return']));
}
function schoolReview(page: Page) {
  return page.getByRole('region', { name: 'School district return review', exact: true });
}
async function expectRow(scope: Page | Locator, label: string, value: string) {
  const row = scope.getByText(label, { exact: true }).locator('..').filter({ visible: true });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.guided-ticker-breakdown-label')).toHaveText(label);
  await expect(row.locator('.guided-ticker-breakdown-value')).toHaveText(value);
}
async function expectFederalIncome(page: Page) {
  const row = page.locator('.guided-ticker-item').filter({ has: page.getByText('Total Income', { exact: true }) }).filter({ visible: true });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.guided-ticker-value')).toHaveText('$80,000');
}
async function expectSeparateResults(page: Page) {
  const school = schoolReview(page);
  await expect(school).toBeVisible();
  await expect(school.getByRole('heading', { name: 'SD100 — Hillsdale LSD (0302)', exact: true })).toBeVisible();
  for (const [label, value] of [
    ['School district earned income', '$80,000'],
    ['School district tax', '$1,000'],
    ['School district withholding', '$1,100'],
    ['School district estimated payments', '$0'],
    ['School district prior credit', '$0'],
    ['School district total payments', '$1,100'],
    ['School district overpayment', '$100'],
    ['Actual school credit election', '$0'],
    ['Calculated school district refund', '$100'],
    ['School district balance due', '$0'],
  ]) await expectRow(school, label, value);
  await expectRow(page, 'Ohio IT1040 Payments', '$3,000');
  await expect(school).toContainText('A calculated refund is not received cash.');
  await expect(school).toContainText('Physical school-district forms and filing remain unavailable pending their separate qualification.');
  await expect(school).not.toContainText('$4,100');
  for (const secret of ['900-70-0302', '302 Fictional District Lane', 'PRIVATE-', 'originalFederalSources', 'originalTaxpayer', 'accountSsn']) {
    await expect(school).not.toContainText(secret);
  }
  await expectFederalIncome(page);
}
async function seedUnrelatedOriginals(page: Page) {
  await page.goto('/returns/new');
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id || id === 'new') throw Error('A distinct local synthetic workspace is required');
  await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
  const fixture = guidedSchoolDistrictFixture(), state = structuredClone(fixture.state);
  const section = required(state.sectionData['state-return']);
  Reflect.deleteProperty(section, 'ohioSchoolDistrict');
  expect(section).not.toHaveProperty('ohioSchoolDistrict');
  const route = buildSectionRoute(state.segmentation), index = route.findIndex(section => section.id === 'state-return');
  if (index < 0) throw Error('The actual state interview route is required');
  state.phase = 'interview'; state.currentSectionIndex = index;
  state.completedSections = route.slice(0, index).map(section => section.id);
  // Sole initial source seed: unrelated complete fictional originals only. Never pass the SD packet.
  await page.evaluate(({ id, state }) => {
    localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
  }, { id, state });
  await page.reload();
  return { fixture, id, originalSection: structuredClone(section) };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Native school district at ${viewport.width}px`, () => {
    test('originates actual school sources and preserves separate cash through reconfirmation and reopen', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const errors: string[] = [], requests: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => requests.push(request.url() + '\n' + (request.postData() ?? '')));
      const { fixture, id, originalSection } = await seedUnrelatedOriginals(page);
      expect((await saved(page, id)).sectionData['state-return']).not.toHaveProperty('ohioSchoolDistrict');
      await expect(schoolReview(page)).toHaveCount(0);
      await expectFederalIncome(page);
      await page.getByRole('button', { name: 'Add actual Ohio school district source facts', exact: true }).click();
      for (const label of ['School district source year', 'School original first name', 'School Finder district code', 'School account estimated payments credited', 'School outgoing carryforward election']) {
        await expect(control(page, label)).toHaveValue('');
      }
      await expect(control(page, 'School source owner')).toHaveValue('');
      const unknown = await draft(page, id);
      expect(unknown.sourceFactsConfirmed).toBeNull();
      expect(unknown.originalFederalSources).toBeUndefined();
      await page.getByRole('button', { name: sdConfirmLabel, exact: true }).click();
      expect((await draft(page, id)).sourceFactsConfirmed).toBeNull();
      await expect(schoolReview(page)).toHaveCount(0);
      await control(page, 'School district source year').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`school-unknown-${viewport.width}.png`) });

      for (const name of ['Add actual school residence period', 'Add actual school W2 source coverage', 'Add actual local source row']) {
        await page.getByRole('button', { name, exact: true }).click();
      }
      for (const [label, , value] of schoolNativeFields(fixture)) await enter(page, label, value);
      expect((await draft(page, id)).sourceFactsConfirmed).toBeNull();
      await expect(control(page, 'School original SSN')).toHaveAttribute('type', 'password');
      await expect(control(page, 'School account SSN')).toHaveAttribute('type', 'password');
      await page.getByRole('button', { name: sdConfirmLabel, exact: true }).click();
      await expect.poll(async () => (await draft(page, id)).sourceFactsConfirmed).toBe(true);
      await expectSeparateResults(page);
      const confirmed = await draft(page, id);
      expect(confirmed.originalFederalSources).toEqual(fixture.original);
      await schoolReview(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`school-confirmed-${viewport.width}.png`) });

      const newReference = 'PRIVATE-SD-BROWSER-RECHECKED-ACCOUNT-SAME-CASH';
      await enter(page, 'School account reference', newReference);
      const pending = await draft(page, id);
      expect(pending.sourceFactsConfirmed).toBeNull();
      expect(pending.originalFederalSources).toEqual(confirmed.originalFederalSources);
      expect(pending.payments.account).toEqual({ ...confirmed.payments.account, sourceReference: newReference });
      expect(pending.payments.paymentRows).toEqual(confirmed.payments.paymentRows);
      expect(pending.w2Sources).toEqual(confirmed.w2Sources);
      await expect(schoolReview(page)).toHaveCount(0);
      await expectFederalIncome(page);
      await control(page, 'School account reference').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`school-identity-pending-${viewport.width}.png`) });
      await page.getByRole('button', { name: sdConfirmLabel, exact: true }).click();
      await expect.poll(async () => (await draft(page, id)).sourceFactsConfirmed).toBe(true);
      await expectSeparateResults(page);

      await enter(page, 'School outgoing carryforward election', '');
      await expect(schoolReview(page)).toHaveCount(0);
      const unknownElection = await draft(page, id);
      expect(unknownElection.sourceFactsConfirmed).toBeNull();
      expect(unknownElection.payments.refundDisposition.outgoingCarryforward).toBe('');
      expect(unknownElection.payments.account.estimatedPaymentsCredited).toBe('0');
      expect(unknownElection.payments.account.priorCreditApplied).toBe('0');
      await page.reload();
      await expect(control(page, 'School outgoing carryforward election')).toHaveValue('');
      expect(await draft(page, id)).toEqual(unknownElection);
      await expect(schoolReview(page)).toHaveCount(0);
      await expectFederalIncome(page);
      await control(page, 'School outgoing carryforward election').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`school-saved-unknown-${viewport.width}.png`) });
      await enter(page, 'School outgoing carryforward election', '0');
      await page.getByRole('button', { name: sdConfirmLabel, exact: true }).click();
      await expect.poll(async () => (await draft(page, id)).sourceFactsConfirmed).toBe(true);
      await expectSeparateResults(page);
      const final = await draft(page, id);
      await page.goto('/'); await page.goto(`/returns/${id}`);
      await expectSeparateResults(page);
      expect(await draft(page, id)).toEqual(final);
      const reopened = await saved(page, id), reopenedSection = required(reopened.sectionData['state-return']);
      expect(reopened.sectionData['income-w2']).toEqual(fixture.state.sectionData['income-w2']);
      expect(reopenedSection.ohioResidency).toEqual(originalSection.ohioResidency);
      expect(reopenedSection.ohioPayments).toEqual(originalSection.ohioPayments);
      await schoolReview(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`school-reopened-${viewport.width}.png`) });
      await expect(page.locator('textarea')).toHaveCount(0);
      await expect(page.locator('nextjs-portal')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      for (const secret of ['900-70-0302', '302 Fictional District Lane', 'PRIVATE-SD-COMPLETE-ORIGINALS', 'PRIVATE-ACTUAL-COMPLETE-SD-AGENCY-ACCOUNT', 'PRIVATE-SD-W2-ALL-ORIGINAL-PAGES', 'PRIVATE-ACTUAL-SD-LOCAL-ROW', 'PRIVATE-FICTIONAL-SUPPLIED-2025-FINDER-RESULT', newReference]) {
        expect(requests.join('\n')).not.toContain(secret);
      }
      expect(requests.some(request => /thefinder\.tax\.ohio\.gov/i.test(request))).toBe(false);
      await testInfo.attach('browser-checks', { body: JSON.stringify({ viewport, consoleErrors: errors.length, requestCount: requests.length, schoolTax: '1000', schoolWithholding: '1100', calculatedSchoolRefund: '100', separateIT1040Payments: '3000', physicalFiling: 'unavailable' }), contentType: 'application/json' });
    });
  });
}
