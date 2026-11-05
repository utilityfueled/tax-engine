// Spec: spec/state/oh-2026-school-native-browser.yaml. Prospective source journeys only.
import { expect, test, type Page } from '@playwright/test';
import { ohioSchoolBrowserFixture, ohioSchoolBrowserAnswers, ohioSchoolBrowserReference, ohioSchoolBrowserPrivateMarkers, ohioSchoolBrowserContainsPrivateOriginal } from '../../../tests/fixtures/oh-2026-school-native-browser';
import { buildSectionRoute, type GuidedFlowState } from '../src/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { buildGuidedOhio2026SchoolSource } from '../src/lib/guided-ohio-2026-school-sources';
import { TaxYearInputSchema } from '../../../src/models/inputs';
import { calculateFederalTax } from '../../../src/engine/federal';
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from '../../../src/pdf/export-policy';

const currentText = 'Current2026 source facts validated; school calculation remains incomplete.';
const confirmName = 'Confirm actual2026 earned-school sources after the last edit';
const scopes = [
  ['filledReturn', /^\/api\/workspace\/filled-return\/?$/u],
  ['provider', /^\/api\/provider(?:\/.*)?$/u],
  ['businessExpenseAnalysis', /^\/api\/business-expense-analysis\/?$/u],
  ['selfEmploymentIncomeAnalysis', /^\/api\/self-employment-income-analysis\/?$/u],
] as const;
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Actual saved source fact is absent'); return value; }
async function saved(page: Page, id: string): Promise<GuidedFlowState> { return page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? 'null'), id); }
function draft(state: GuidedFlowState) { return required(state.sectionData['state-return']?.ohio2026SchoolSources); }
function control(page: Page, label: string) { return page.locator('label').getByText(label, { exact: true }).locator('..').locator('input,select'); }
async function enter(page: Page, label: string, value: string) {
  const field = control(page, label); await expect(field).toHaveCount(1);
  if (await field.evaluate(node => node.tagName) === 'SELECT') await field.selectOption(value);
  else { await field.fill(value); await field.press('Tab'); }
}
function actualProjection(state: GuidedFlowState) {
  return buildGuidedOhio2026SchoolSource(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), draft(state));
}
function expectCashOnly(state: GuidedFlowState) {
  expect(actualProjection(state)).toMatchObject({ taxYear: 2026, districtCode: '0302', districtName: 'Hillsdale LSD', taxBase: 'earned', rate: '0.0125', residentCompensation: '50000', schoolWithholding: '625.25', taxLiability: null, payments: null, refund: null, underpaymentPenalty: null, lateInterest: null, filingQualified: false, calculationStatus: 'source-only-incomplete' });
}
for (const width of [1280, 390]) test.describe(`Actual2026 earned-school original intake at ${width}px`, () => {
  test('collects current original school facts visibly without inventing a2026 settlement', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [], downloads: string[] = [], requests: Array<{ url: string; body: string }> = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/iu);
    const id = required(new URL(page.url()).pathname.split('/').at(-1));
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const { state: initial, original } = ohioSchoolBrowserFixture(), route = buildSectionRoute(initial.segmentation), index = route.findIndex(section => section.id === 'state-return');
    expect(index).toBeGreaterThanOrEqual(0); initial.phase = 'interview'; initial.currentSectionIndex = index; initial.completedSections = route.slice(0, index).map(section => section.id);
    expect(initial.sectionData['state-return']).toBeUndefined(); expect(original.ohioResidency).toBeUndefined(); expect(original.ohioSchoolDistrict).toBeUndefined();
    // The sole setup write precedes every target action. It contains only the unrelated
    // current household and W2 originals; no Ohio source draft, snapshots or result.
    await page.evaluate(({ id, state }) => { localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true'); localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state)); }, { id, state: initial });
    await page.reload(); await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.', { exact: true })).toBeVisible();
    const panel = page.getByRole('region', { name: '2026 earned school source projection', exact: true });
    await panel.getByRole('button', { name: 'Add actual2026 earned-school originals', exact: true }).click();
    await expect(control(page, '2026 school actual source year')).toHaveValue(''); await expect(control(page, '2026 Finder decimal rate')).toHaveValue('');
    expect(draft(await saved(page, id)).employmentOriginals).toEqual([]); expect(draft(await saved(page, id)).originalTaxInput).toBeUndefined();
    await panel.getByRole('button', { name: confirmName, exact: true }).click(); await expect(panel.getByRole('alert')).toBeVisible(); expect(draft(await saved(page, id)).sourceFactsConfirmed).toBeNull();
    await panel.getByRole('button', { name: 'Capture current2026 school owner home and canonical originals', exact: true }).click();
    await expect(control(page, '2026 captured SSN')).toHaveValue('900-70-0901');
    const captured = structuredClone(required(draft(await saved(page, id)).originalFederalSources));
    await expect(control(page, '2026 school actual source year')).toHaveValue(''); await expect(control(page, '2026 Finder decimal rate')).toHaveValue('');
    await panel.getByRole('button', { name: 'Add actual primary domicile record', exact: true }).click();
    await panel.getByRole('button', { name: 'Add actual2026 employer source', exact: true }).click();
    await panel.getByRole('button', { name: 'Add actual2026 payroll 1', exact: true }).click();
    await panel.getByRole('button', { name: 'Add actual2026 local W2 coverage', exact: true }).click();
    // Printed-row choices depend on the explicitly selected current W2.
    await enter(page, '2026 local W2 1 current original', '0');
    await panel.getByRole('button', { name: 'Add actual2026 printed local row 1', exact: true }).click();
    for (const [label, value] of ohioSchoolBrowserAnswers()) await enter(page, label, value);
    expect(draft(await saved(page, id)).sourceFactsConfirmed).toBeNull();
    await panel.getByRole('button', { name: confirmName, exact: true }).click(); await expect(panel.getByText(currentText, { exact: true })).toBeVisible();
    const current = await saved(page, id); expectCashOnly(current); expect(draft(current).originalFederalSources).toEqual(captured);
    await expect(panel.getByText('Actual resident compensation 50000; actual school withholding 625.25', { exact: true })).toBeVisible();
    await expect(panel.getByText('Liability unknown; payments unknown; refund unknown; penalty unknown; interest unknown. Filing qualified: no.', { exact: true })).toBeVisible();
    const wages = control(page, '2026 payroll 1.1 wages'); await wages.focus(); await wages.press('Tab'); expect(draft(await saved(page, id))).toEqual(draft(current));
    await wages.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate(root => ({ documentWidth: document.documentElement.scrollWidth, issues: [root, ...root.querySelectorAll('label,input,select,button,fieldset')].flatMap(node => { const rect = node.getBoundingClientRect(); return !rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden' || rect.left >= -1 && rect.right <= innerWidth + 1 ? [] : [{ tag: node.tagName, left: rect.left, right: rect.right }]; }) }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(width); expect(geometry.issues).toEqual([]);
    await info.attach('school-original-control-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' }); await page.screenshot({ path: info.outputPath('school-source-originals.png') });
    await enter(page, '2026 payroll 1.1 reference', ohioSchoolBrowserReference);
    const stale = await saved(page, id); expect(draft(stale).sourceFactsConfirmed).toBeNull(); expect(draft(stale).employmentOriginals[0]?.serviceRows[0]?.wages).toBe('50000');
    expect(draft(stale).originalFederalSources).toEqual(draft(current).originalFederalSources); expect(draft(stale).originalTaxInput).toEqual(draft(current).originalTaxInput); expect(draft(stale).confirmedSourceFacts).toEqual(draft(current).confirmedSourceFacts);
    expect(() => actualProjection(stale)).toThrow(); await expect(panel.getByText(currentText, { exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: confirmName, exact: true }).click(); await expect(panel.getByText(currentText, { exact: true })).toBeVisible();
    const reconfirmed = await saved(page, id); expectCashOnly(reconfirmed); expect(draft(reconfirmed).confirmedSourceFacts).not.toEqual(draft(current).confirmedSourceFacts);
    await enter(page, '2026 capitalGains nonresidentOhioAmount', ''); const unknown = await saved(page, id);
    await panel.getByRole('button', { name: confirmName, exact: true }).click(); await expect(panel.getByRole('alert')).toBeVisible(); expect(draft(await saved(page, id)).sourceFactsConfirmed).toBeNull(); expect(() => actualProjection(unknown)).toThrow();
    await page.reload(); await expect(control(page, '2026 capitalGains nonresidentOhioAmount')).toHaveValue(''); expect(draft(await saved(page, id)).originalTaxInput).toEqual(draft(reconfirmed).originalTaxInput);
    await enter(page, '2026 capitalGains nonresidentOhioAmount', '0');
    const unsupportedLabel = width === 1280 ? '2026 Finder tax base' : '2026 local W2 1 row 1 classification';
    await enter(page, unsupportedLabel, width === 1280 ? 'traditional' : 'municipal'); await panel.getByRole('button', { name: confirmName, exact: true }).click(); await expect(panel.getByRole('alert')).toBeVisible(); expect(draft(await saved(page, id)).sourceFactsConfirmed).toBeNull();
    await enter(page, unsupportedLabel, width === 1280 ? 'earned' : 'school_district'); await panel.getByRole('button', { name: confirmName, exact: true }).click(); await expect(panel.getByText(currentText, { exact: true })).toBeVisible();
    const final = await saved(page, id); expectCashOnly(final);
    await page.goto('/'); await page.goto(`/returns/${id}`); await expect(panel.getByText(currentText, { exact: true })).toBeVisible(); expect(draft(await saved(page, id))).toEqual(draft(final));
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(final)); expect(() => calculateFederalTax(input)).toThrow(/incomplete; calculation is unavailable/u);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false }); expect(() => assertPdfExportAllowed(2026, 2026, 'review')).toThrow(); expect(() => assertPdfExportAllowed(2026, 2026, 'filing')).toThrow();
    await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click(); await expect(page.getByText('2026 not supported yet', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Review PDF', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
    const counts = Object.fromEntries(scopes.map(([name, pattern]) => [name, requests.filter(request => pattern.test(new URL(request.url).pathname)).length])); expect(counts).toEqual({ filledReturn: 0, provider: 0, businessExpenseAnalysis: 0, selfEmploymentIncomeAnalysis: 0 });
    expect(ohioSchoolBrowserPrivateMarkers.length).toBeGreaterThan(0); expect(requests.some(request => ohioSchoolBrowserContainsPrivateOriginal(request.url) || ohioSchoolBrowserContainsPrivateOriginal(request.body))).toBe(false);
    expect(requests.some(request => new URL(request.url).hostname === 'tax.ohio.gov')).toBe(false); expect(downloads).toEqual([]); expect(errors).toEqual([]);
    await info.attach('school-source-request-counts.json', { body: JSON.stringify(counts), contentType: 'application/json' });
  });
});
