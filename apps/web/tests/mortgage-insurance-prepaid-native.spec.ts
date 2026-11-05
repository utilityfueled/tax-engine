// Spec: spec/federal/guided-mortgage-insurance-prepaid-browser.yaml. Prospective native journeys only.
import { expect, test, type Page } from '@playwright/test';
import { mortgagePrepaidBrowserFixture, mortgagePrepaidBrowserAnswers, mortgagePrepaidBrowserEditedReference, mortgagePrepaidBrowserPrivateMarkers } from '../../../tests/fixtures/mortgage-insurance-prepaid-browser';
import { buildSectionRoute, type GuidedFlowState } from '../src/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '../src/lib/guided-interview-bridge';
import { buildGuidedMortgageInputs } from '../src/lib/guided-mortgage-worksheet';
import { TaxYearInputSchema } from '../../../src/models/inputs';
import { calculateFederalTax } from '../../../src/engine/federal';
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from '../../../src/pdf/export-policy';

const entryConfirmation = 'Have you checked all mortgage source and qualification facts after the last edit?';
const annualConfirmation = 'Have you confirmed the complete annual home-debt worksheet after the last change?';
const confirmedText = 'Original premium records explicitly confirmed.';
const protectedScopes = [
  ['filledReturn', /^\/api\/workspace\/filled-return\/?$/u],
  ['provider', /^\/api\/provider(?:\/.*)?$/u],
  ['businessExpenseAnalysis', /^\/api\/business-expense-analysis\/?$/u],
  ['selfEmploymentIncomeAnalysis', /^\/api\/self-employment-income-analysis\/?$/u],
] as const;
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error('Actual saved source fact is absent'); return value; }
async function saved(page: Page, id: string): Promise<GuidedFlowState> { return page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? 'null'), id); }
function entry(state: GuidedFlowState) { return required(required(state.sectionData.deductions?.mortgageEntries)[0]); }
function draft(state: GuidedFlowState) { return required(entry(state).insurancePrepaid); }
function control(page: Page, label: string) { return page.locator('label').getByText(label, { exact: true }).locator('..').locator('input,select'); }
async function enter(page: Page, label: string, value: string) {
  const field = control(page, label); await expect(field).toHaveCount(1);
  if (await field.evaluate(node => node.tagName) === 'SELECT') await field.selectOption(value);
  else { await field.fill(value); await field.press('Tab'); }
}
async function confirmParent(page: Page) { await enter(page, entryConfirmation, 'true'); await enter(page, annualConfirmation, 'true'); }
for (const width of [1280, 390]) test.describe(`Native original prepaid mortgage insurance at ${width}px`, () => {
  test('enters original premiums visibly and preserves current capture while stale and unknown facts remain blocked', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [], downloads: string[] = [], requests: Array<{ url: string; body: string }> = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
    page.on('download', download => downloads.push(download.suggestedFilename()));
    await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+/iu);
    const id = required(new URL(page.url()).pathname.split('/').at(-1));
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const initial = mortgagePrepaidBrowserFixture(), route = buildSectionRoute(initial.segmentation), index = route.findIndex(section => section.id === 'deductions');
    expect(index).toBeGreaterThanOrEqual(0); initial.phase = 'interview'; initial.currentSectionIndex = index; initial.completedSections = route.slice(0, index).map(section => section.id);
    expect(entry(initial).insurancePrepaid).toBeUndefined(); expect(entry(initial).insuranceAllocationMethod).toBeUndefined(); expect(entry(initial).insurancePremiumsAllocableToYear).toBeUndefined();
    // Sole setup write: unrelated household and ordinary mortgage originals.
    // No source snapshot, premium answer, annual scalar or calculated result.
    await page.evaluate(({ id, state }) => { localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true'); localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(state)); }, { id, state: initial });
    await page.reload(); await enter(page, 'Tax year for this interview', '2026');
    await expect.poll(async () => (await saved(page, id)).taxYear).toBe(2026);
    await expect(page.getByText('You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.', { exact: true })).toBeVisible();
    await expect(control(page, 'Actual mortgage insurance allocation method')).toHaveCount(0);
    for (const [label, value] of mortgagePrepaidBrowserAnswers) await enter(page, label, value);
    expect(draft(await saved(page, id)).capturedOriginal).toBeUndefined(); expect(buildTaxInputFromGuidedData(await saved(page, id))).toBeNull();
    await confirmParent(page); await page.getByRole('button', { name: 'Capture actual original premium records', exact: true }).click();
    await expect.poll(async () => draft(await saved(page, id)).capturedOriginal?.source.prepaidPremiumPaid).toBe('9240');
    const captured = structuredClone(required(draft(await saved(page, id)).capturedOriginal));
    expect(draft(await saved(page, id)).sourceFactsConfirmed).toBeNull(); expect(entry(await saved(page, id)).sourceFactsConfirmed).toBeNull();
    expect(required((await saved(page, id)).sectionData.deductions?.mortgageWorksheet).sourceFactsConfirmed).toBeNull();
    await confirmParent(page); await page.getByRole('button', { name: 'Confirm retained original premium records', exact: true }).click();
    await expect(page.getByText(confirmedText, { exact: true })).toBeVisible();
    const current = await saved(page, id), input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(current));
    expect(draft(current).capturedOriginal).toEqual(captured); expect(entry(current).insurancePremiumsAllocableToYear).toBeUndefined();
    expect(input.form1098[0]?.mortgageInsuranceQualification?.prepaidSources).toEqual(captured.source);
    expect(() => calculateFederalTax(input)).toThrow(/incomplete; calculation is unavailable/u);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertPdfExportAllowed(2026, 2026, 'review')).toThrow(); expect(() => assertPdfExportAllowed(2026, 2026, 'filing')).toThrow();
    const premium = control(page, 'Actual original prepaid premium paid'); await premium.focus(); await premium.press('Tab');
    expect(draft(await saved(page, id))).toEqual(draft(current));
    const panel = page.getByRole('group', { name: 'Original prepaid mortgage insurance records', exact: true }); await premium.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate(root => ({ documentWidth: document.documentElement.scrollWidth, issues: [root, ...root.querySelectorAll('label,input,select,button,fieldset')].flatMap(node => { const rect = node.getBoundingClientRect(); return !rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden' || rect.left >= -1 && rect.right <= innerWidth + 1 ? [] : [{ tag: node.tagName, left: rect.left, right: rect.right }]; }) }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(width); expect(geometry.issues).toEqual([]);
    await info.attach('actual-prepaid-control-geometry.json', { body: JSON.stringify(geometry), contentType: 'application/json' }); await page.screenshot({ path: info.outputPath('actual-prepaid-originals.png') });
    await page.reload(); expect(draft(await saved(page, id))).toEqual(draft(current)); await expect(page.getByText(confirmedText, { exact: true })).toBeVisible();
    // Zero is an actual edit, never a replacement for the unknown refund history.
    await enter(page, 'Actual original prepaid premium paid', '0'); await enter(page, 'Were any of these premiums refunded?', ''); await confirmParent(page);
    await page.getByRole('button', { name: 'Capture actual original premium records', exact: true }).click(); await expect(panel.getByRole('alert')).toBeVisible();
    const unresolved = await saved(page, id); expect(draft(unresolved).prepaidPremiumPaid).toBe('0'); expect(draft(unresolved).premiumsRefunded).toBeNull(); expect(draft(unresolved).capturedOriginal).toEqual(captured); expect(buildTaxInputFromGuidedData(unresolved)).toBeNull();
    await page.reload(); expect(draft(await saved(page, id))).toEqual(draft(unresolved)); await expect(control(page, 'Were any of these premiums refunded?')).toHaveValue('');
    await enter(page, 'Actual original prepaid premium paid', '9240'); await enter(page, 'Were any of these premiums refunded?', 'false'); await confirmParent(page);
    await page.getByRole('button', { name: 'Capture actual original premium records', exact: true }).click(); await confirmParent(page); await page.getByRole('button', { name: 'Confirm retained original premium records', exact: true }).click(); await expect(page.getByText(confirmedText, { exact: true })).toBeVisible();
    const recaptured = structuredClone(required(draft(await saved(page, id)).capturedOriginal));
    await enter(page, 'Original premium policy and payment record reference', mortgagePrepaidBrowserEditedReference);
    const stale = await saved(page, id); expect(draft(stale).prepaidPremiumPaid).toBe('9240'); expect(draft(stale).sourceFactsConfirmed).toBeNull(); expect(entry(stale).sourceFactsConfirmed).toBeNull(); expect(required(stale.sectionData.deductions?.mortgageWorksheet).sourceFactsConfirmed).toBeNull(); expect(draft(stale).capturedOriginal).toEqual(recaptured);
    await confirmParent(page); await page.getByRole('button', { name: 'Confirm retained original premium records', exact: true }).click(); await expect(panel.getByRole('alert')).toBeVisible();
    expect(draft(await saved(page, id)).sourceFactsConfirmed).toBeNull(); expect(draft(await saved(page, id)).capturedOriginal).toEqual(recaptured); const staleAfterConfirm = await saved(page, id); expect(() => buildGuidedMortgageInputs(required(staleAfterConfirm.sectionData.deductions), 2026, 'single')).toThrow();
    await page.reload(); expect(draft(await saved(page, id)).capturedOriginal).toEqual(recaptured); expect(buildTaxInputFromGuidedData(await saved(page, id))).toBeNull();
    await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click(); await expect(page.getByText('2026 not supported yet', { exact: true })).toBeVisible(); await expect(page.getByRole('region', { name: 'Draft Return Bundle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Review PDF', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
    const counts = Object.fromEntries(protectedScopes.map(([name, pattern]) => [name, requests.filter(request => pattern.test(new URL(request.url).pathname)).length]));
    expect(counts).toEqual({ filledReturn: 0, provider: 0, businessExpenseAnalysis: 0, selfEmploymentIncomeAnalysis: 0 });
    for (const marker of mortgagePrepaidBrowserPrivateMarkers) expect(requests.some(request => request.body.includes(marker))).toBe(false);
    expect(downloads).toEqual([]); expect(errors).toEqual([]);
    await info.attach('prepaid-request-counts.json', { body: JSON.stringify(counts), contentType: 'application/json' });
  });
});
