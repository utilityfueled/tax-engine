// Spec: spec/federal/schedule-c-standard-mileage-2026.yaml
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { completeBusinessSection } from '../../../tests/guided-interview/complete-facts';

const baseline = JSON.parse(readFileSync(new URL('../../../tests/fixtures/nonitemized-allowable-carry-guide-original.json', import.meta.url), 'utf8'));
const confirmations = [
  'I own the vehicle and chose standard mileage in its first business year',
  'I kept a complete written mileage log',
  'Parking and tolls are eligible business costs',
  'No reimbursements, other vehicle deductions or other business use',
  'I did not dispose of this vehicle in 2026',
];

for (const width of [1280, 390]) {
  test(`keeps the original business mileage local at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateReference = `synthetic-private-vehicle-${width}`;
    const requests: string[] = [];
    const protectedRequests: string[] = [];
    page.on('request', request => {
      requests.push(request.url(), request.postData() ?? '');
      const { pathname } = new URL(request.url());
      if (/^\/api\/(provider\/|workspace\/(?:filled-return|tax-explanation)|guided-review-summary|(?:document-detection|business-expense-analysis|self-employment-income-analysis)(?:\/|$))/.test(pathname)) {
        protectedRequests.push(pathname);
      }
    });
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) throw new Error('Missing synthetic return ID');
    await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
    const original = structuredClone(baseline);
    delete original.sectionData['personal-info'].spouse;
    delete original.sectionData['income-w2'];
    original.segmentation.incomeTypes = ['self-employment'];
    original.currentSectionIndex = 1;
    original.completedSections = ['personal-info'];
    original.sectionData['income-self-employment'] = { ...completeBusinessSection, manualGrossReceipts: '10000' };
    await page.evaluate(({ id, original }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(original));
    }, { id, original });
    await page.reload();
    const expenses = page.getByText('Schedule C — Business Expenses', { exact: true });
    await expenses.click();
    await page.getByRole('button', { name: 'Add business mileage log', exact: true }).click();
    await page.getByLabel('Private business mileage log reference', { exact: true }).fill(privateReference);
    await page.getByLabel('First business-use date', { exact: true }).fill('2026-06-30');
    await page.getByLabel('Total vehicle miles', { exact: true }).fill('42');
    const commuting = page.getByLabel('Commuting miles', { exact: true });
    await commuting.fill('0');
    await page.getByLabel('Other personal miles', { exact: true }).fill('17');
    await page.getByRole('textbox', { name: 'Eligible business parking and tolls', exact: true }).fill('0');
    await page.getByLabel('Business mileage 1 date', { exact: true }).fill('2026-06-30');
    await page.getByLabel('Business mileage 1 eligible miles', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Add business mileage date', exact: true }).click();
    await page.getByLabel('Business mileage 2 date', { exact: true }).fill('2026-07-01');
    const julyMiles = page.getByLabel('Business mileage 2 eligible miles', { exact: true });
    await julyMiles.fill('15');
    const confirmationControls = confirmations.map(name => page.getByRole('combobox', { name, exact: true }));
    for (const control of confirmationControls) await control.selectOption('true');
    const partIV = page.getByText('Schedule C Part IV vehicle answers', { exact: true });
    await partIV.click();
    const offDuty = page.getByRole('combobox', { name: 'Was this vehicle available for personal use off duty?', exact: true });
    await offDuty.selectOption('false');
    await expect(page.getByText(/complete both Part IV vehicle-availability answers/i)).toBeVisible();
    await page.getByRole('combobox', { name: 'Did you have another vehicle available for personal use?', exact: true }).selectOption('false');
    await page.getByRole('combobox', { name: 'Confirm that Form 4562 is not required for this business', exact: true }).selectOption('true');
    await page.reload();
    await expenses.click();
    await partIV.click();
    await expect(julyMiles).toHaveValue('15');
    await expect(commuting).toHaveValue('0');
    await expect(offDuty).toHaveValue('false');
    for (const control of confirmationControls) await expect(control).toHaveValue('true');
    await julyMiles.fill('16');
    for (const control of confirmationControls) await expect(control).toHaveValue('');
    await expect(offDuty).toHaveValue('');
    await expect(page.getByText('Includes a vehicle log for calculation')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Return Summary', exact: true })).toContainText('2026 not supported yet');
    await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    expect(requests.join('\n')).not.toContain(privateReference);
    expect(requests.join('\n')).not.toContain(original.sectionData['personal-info'].ssn);
  });
}
