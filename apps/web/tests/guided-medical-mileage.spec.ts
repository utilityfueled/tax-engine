import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const baseline = JSON.parse(readFileSync(new URL('../../../tests/fixtures/nonitemized-allowable-carry-guide-original.json', import.meta.url), 'utf8'));
const confirmations = [
  'Trips were essential to my own qualified medical care',
  'One vehicle and only eligible parking and tolls',
  'All claimed transportation costs were paid and unreimbursed',
  'No actual vehicle costs or duplicate tax benefits',
];

for (const width of [1280, 390]) {
  test(`keeps confirmed medical mileage local and the 2026 year gated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateReference = `synthetic-medical-record-${width}`;
    const requests: string[] = [];
    const protectedRequests: string[] = [];
    page.on('request', request => {
      requests.push(request.url(), request.postData() ?? '');
      if (/^\/api\/(provider\/|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(new URL(request.url()).pathname)) {
        protectedRequests.push(new URL(request.url()).pathname);
      }
    });
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing synthetic return ID');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const original = structuredClone(baseline);
    delete original.sectionData['personal-info'].spouse;
    original.sectionData.deductions = { method: 'itemized', medicalExpenses: '', stateLocalTaxes: '', realEstateTaxes: '', mortgageInterest: '', charitableContributions: '', casualtyLosses: '', otherItemized: '' };
    await page.evaluate(({ id, original }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(original));
    }, { id, original });
    await page.reload();
    await page.getByRole('button', { name: 'Add medical mileage log', exact: true }).click();
    await page.getByLabel('Private mileage log reference', { exact: true }).fill(privateReference);
    await page.getByRole('textbox', { name: 'Other eligible unreimbursed medical expenses', exact: true }).fill('0');
    const parking = page.getByRole('textbox', { name: 'Eligible medical parking and tolls', exact: true });
    await parking.fill('0');
    await page.getByLabel('Medical mileage 1 date', { exact: true }).fill('2026-06-30');
    await page.getByLabel('Medical mileage 1 eligible miles', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Add medical mileage date', exact: true }).click();
    await page.getByLabel('Medical mileage 2 date', { exact: true }).fill('2026-07-01');
    const julyMiles = page.getByLabel('Medical mileage 2 eligible miles', { exact: true });
    await julyMiles.fill('20.125');
    const confirmationControls = confirmations.map(name => page.getByRole('combobox', { name, exact: true }));
    for (const control of confirmationControls) await control.selectOption('true');
    await page.reload();
    await expect(julyMiles).toHaveValue('20.125');
    await expect(parking).toHaveValue('0');
    for (const control of confirmationControls) await expect(control).toHaveValue('true');
    await julyMiles.fill('20.250');
    for (const control of confirmationControls) await expect(control).toHaveValue('');
    await page.getByRole('radio', { name: /^Standard deduction/ }).click();
    await page.getByRole('radio', { name: /^Itemize deductions/ }).click();
    await expect(julyMiles).toHaveValue('20.250');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Return Summary', exact: true })).toContainText('2026 not supported yet');
    await expect(page.getByRole('button', { name: 'Download Review PDF', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    expect(requests.join('\n')).not.toContain(privateReference);
    expect(requests.join('\n')).not.toContain(original.sectionData['personal-info'].ssn);
  });
}
