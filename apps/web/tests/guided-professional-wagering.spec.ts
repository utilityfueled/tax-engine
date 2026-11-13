// Spec: spec/federal/schedule-c-wagering-2026.yaml
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { completeBusinessSection } from '../../../tests/guided-interview/complete-facts';

const baseline = JSON.parse(readFileSync(new URL('../../../tests/fixtures/nonitemized-allowable-carry-guide-original.json', import.meta.url), 'utf8'));
const confirmations = [
  'This ledger covers the entire calendar year', 'This ledger includes all domestic professional wagering',
  'The ledger includes no other activity or duplicate amounts', 'There are no Forms W-2G to reconcile',
];

for (const width of [1280, 390]) {
  test(`keeps the professional wagering ledger local at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateReference = `private-wagering-ledger-${width}`;
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
    original.sectionData['income-self-employment'] = { ...completeBusinessSection, businessFacts: {
      ...completeBusinessSection.businessFacts, activityDescription: 'Professional wagering', businessCode: '713200',
    } };
    await page.evaluate(({ id, original }) => {
      localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify(original));
    }, { id, original });
    await page.reload();
    const permission = page.getByRole('checkbox', { name: 'Allow AI review of selected business documents', exact: true });
    await permission.check();
    await page.getByRole('button', { name: 'Add professional wagering ledger', exact: true }).click();
    await expect(permission).toBeDisabled();
    await expect(permission).not.toBeChecked();
    const reference = page.getByLabel('Private wagering ledger reference', { exact: true });
    await reference.fill(privateReference);
    await page.getByRole('textbox', { name: 'Gross taxable wagering gains', exact: true }).fill('12000.15');
    const losses = page.getByRole('textbox', { name: 'Wagering losses', exact: true });
    const expenses = page.getByRole('textbox', { name: 'Otherwise deductible wagering expenses', exact: true });
    await losses.fill('10000.25');
    await expenses.fill('0');
    const confirmationControls = confirmations.map(name => page.getByRole('combobox', { name, exact: true }));
    for (const control of confirmationControls) await control.selectOption('true');
    await page.reload();
    await expect(reference).toHaveValue(privateReference);
    await expect(losses).toHaveValue('10,000.25');
    await expect(expenses).toHaveValue('0');
    for (const control of confirmationControls) await expect(control).toHaveValue('true');
    await losses.fill('10000.50');
    for (const control of confirmationControls) await expect(control).toHaveValue('');
    await expect(page.getByText(/Enter the complete professional ledger/)).toBeVisible();
    if (width === 390) {
      const statement = `synthetic-private-slot-statement-${width}`;
      const payer = 'Synthetic Private Slot Payer';
      const payerTin = '95-8765432';
      await page.getByRole('button', { name: 'Add Form W-2G original', exact: true }).click();
      const fields = {
        'Private statement reference': statement, 'Private linked ledger entry': 'synthetic-private-slot-ledger-entry',
        'Payer name': payer, 'Payer TIN': payerTin,
        'Recipient TIN last four digits': original.sectionData['personal-info'].ssn.slice(-4),
        'Date won (box 2)': '2026-03-12',
      };
      for (const [label, value] of Object.entries(fields)) await page.getByLabel(`W-2G 1: ${label}`, { exact: true }).fill(value);
      await page.getByRole('textbox', { name: 'W-2G 1: Reportable winnings (box 1)', exact: true }).fill('5000.01');
      await page.getByRole('textbox', { name: 'W-2G 1: Recognized gain in your ledger', exact: true }).fill('5000.01');
      const withheld = page.getByRole('textbox', { name: 'W-2G 1: Federal withholding (box 4)', exact: true });
      await withheld.fill('1200.04');
      const others = page.getByRole('textbox', { name: 'Other gross taxable wagering gains', exact: true });
      await others.fill('7000.14');
      const allOriginals = page.getByRole('combobox', { name: 'These are all original individual 2026 domestic cash slot payments, with no state or local reporting', exact: true });
      for (const control of confirmationControls.slice(0, -1)) await control.selectOption('true');
      await allOriginals.selectOption('true');
      await expect(page.getByText(/Enter the complete professional ledger/)).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel('W-2G 1: Private statement reference', { exact: true })).toHaveValue(statement);
      await expect(withheld).toHaveValue('1,200.04');
      await expect(allOriginals).toHaveValue('true');
      await expect(permission).toBeDisabled();
      await others.fill('7000.15');
      await expect(allOriginals).toHaveValue('');
      for (const control of confirmationControls.slice(0, -1)) await control.selectOption('true');
      await allOriginals.selectOption('true');
      await expect(page.getByText(/W-2G and other gains do not reconcile to the annual ledger/)).toBeVisible();
      for (const marker of [statement, payer, payerTin, 'synthetic-private-slot-ledger-entry', '1200.04']) {
        expect(requests.join('\n')).not.toContain(marker);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Switch to advanced mode', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Return Summary', exact: true })).toContainText('2026 not supported yet');
    await expect(page.getByRole('button', { name: 'Download Draft Filled Return PDF', exact: true })).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
    expect(requests.join('\n')).not.toContain(privateReference);
    expect(requests.join('\n')).not.toContain(original.sectionData['personal-info'].ssn);
  });
}
