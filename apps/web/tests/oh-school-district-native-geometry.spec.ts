// Spec: spec/state/oh-school-district-native-geometry.yaml.
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { guidedSchoolDistrictFixture, readSchoolDraft, required, sdConfirmLabel } from '../../../tests/fixtures/guided-oh-school-district-complete';
import { buildSectionRoute, type GuidedFlowState } from '../src/lib/guided-interview-flow';
const expectedBlankError = "Ohio school district sources: complete actual source facts; zero only when known (taxYear; sourceReference; owner.accountHolder; owner.originalTaxpayer.firstName; owner.originalTaxpayer.lastName; owner.originalTaxpayer.ssn; owner.originalTaxpayer.dateOfBirth; residence.sourceReference; residence.originalAddress.street; residence.originalAddress.city; residence.originalAddress.state; residence.originalAddress.zip; residence.periods; residence.lookup.sourceReference; residence.lookup.taxYear; residence.lookup.lookupDate; residence.lookup.originalAddress.street; residence.lookup.originalAddress.city; residence.lookup.originalAddress.state; residence.lookup.originalAddress.zip; residence.lookup.districtCode; residence.lookup.districtName; residence.lookup.officialResultMatchedConfirmed; income.sourceReference; income.ordinaryCompensationOnlyConfirmed; income.noSelfEmploymentIncomeConfirmed; income.allOtherIncomeSourcesCheckedConfirmed; income.noSpecialWageAdjustmentsConfirmed; w2Sources; payments.sourceReference; payments.allCurrentAndPriorPaymentsIncludedConfirmed; payments.withholdingTreatment; payments.account.sourceReference; payments.account.accountName; payments.account.accountSsn; payments.account.taxYear; payments.account.returnType; payments.account.asOfDate; payments.account.completeAccountConfirmed; payments.account.estimatedPaymentsCredited; payments.account.priorCreditApplied; payments.priorReturn.status; payments.priorCreditCarryforward.status; payments.remainingTaxPayment.status; payments.remainingTaxPayment.sourceReference; payments.remainingTaxPayment.sourceFactsConfirmed; payments.currentTiming.kind; payments.filingExtension.kind; payments.paymentExtension.kind; payments.returnKind; payments.specialMethod; payments.refundDisposition.sourceReference; payments.refundDisposition.outgoingCarryforward)";
async function saved(page: Page, id: string) {
  const state = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? 'null') as GuidedFlowState | null, id);
  return required(state);
}
async function measure(page: Page, phase: string) {
  return page.getByRole('region', { name: 'Ohio school district actual source facts', exact: true }).evaluate((section, phase) => {
    const nodes = [section, ...section.querySelectorAll('fieldset,input,select,button,[role="alert"]')].filter(node => {
      const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
    }).map(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return { tag: node.tagName, label: node.getAttribute('role') ?? node.closest('label')?.querySelector('.guided-field-label')?.textContent ?? node.querySelector('legend')?.textContent ?? '', left: rect.left, right: rect.right, width: rect.width, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, minWidth: style.minWidth, overflowWrap: style.overflowWrap, display: style.display };
    });
    return { phase, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, nodes };
  }, phase);
}

test('keeps actual blank school source validation within the mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/returns/new');
  await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id || id === 'new') throw Error('An actual local synthetic workspace is required');
  await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
  const state = structuredClone(guidedSchoolDistrictFixture().state), section = required(state.sectionData['state-return']);
  Reflect.deleteProperty(section, 'ohioSchoolDistrict');
  expect(section).not.toHaveProperty('ohioSchoolDistrict');
  const route = buildSectionRoute(state.segmentation), index = route.findIndex(section => section.id === 'state-return');
  if (index < 0) throw Error('The actual state interview route is required');
  state.phase = 'interview'; state.currentSectionIndex = index; state.completedSections = route.slice(0, index).map(section => section.id);
  await page.evaluate(({ id, state }) => {
    localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
    localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state));
  }, { id, state });
  await page.reload();
  await page.getByRole('button', { name: 'Add actual Ohio school district source facts', exact: true }).click();
  const source = page.getByRole('region', { name: 'Ohio school district actual source facts', exact: true });
  const year = page.locator('label').filter({ has: page.getByText('School district source year', { exact: true }) }).locator('input');
  await expect(year).toHaveValue('');
  const blank = readSchoolDraft(required((await saved(page, id)).sectionData['state-return']));
  const before = await measure(page, 'actual blank before confirmation');
  await year.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('school-geometry-before-confirm.png') });
  await page.getByRole('button', { name: sdConfirmLabel, exact: true }).click();
  const alert = source.getByRole('alert');
  await expect(alert).toHaveCount(1); await expect(alert).toHaveText(expectedBlankError);
  const afterBlankConfirm = await measure(page, 'actual blank validation error');
  expect(readSchoolDraft(required((await saved(page, id)).sectionData['state-return']))).toEqual(blank);
  await year.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('school-geometry-after-blank-confirm.png') });
  // Only a separately supplied actual source year changes; all other unknowns remain unknown.
  await year.fill('2025'); await year.press('Tab');
  await expect(source.getByRole('alert')).toHaveCount(0);
  const afterErrorClear = await measure(page, 'actual year edit clears validation error');
  const edited = readSchoolDraft(required((await saved(page, id)).sectionData['state-return']));
  expect(edited).toEqual({ ...blank, taxYear: '2025' });
  expect(edited.sourceFactsConfirmed).toBeNull(); expect(edited.originalFederalSources).toBeUndefined();
  await expect(page.getByRole('region', { name: 'School district return review', exact: true })).toHaveCount(0);
  await year.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('school-geometry-error-cleared.png') });
  const phases = [before, afterBlankConfirm, afterErrorClear];
  const output = testInfo.outputPath('school-geometry.json');
  await writeFile(output, JSON.stringify({ phases, fullError: expectedBlankError, sourceFactsStayedUnknown: true }, null, 2));
  await testInfo.attach('actual-school-geometry', { path: output, contentType: 'application/json' });
  for (const phase of phases) {
    expect(phase.viewport).toBe(390); expect(phase.nodes.length).toBeGreaterThan(30);
    expect(phase.nodes.filter(node => node.left < 0 || node.right > phase.viewport)).toEqual([]);
    expect(phase.nodes.filter(node => node.label === 'alert' && node.scrollWidth > node.clientWidth)).toEqual([]);
  }
});
