import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';
import { vehicleRefinancingFixture } from '../../../tests/fixtures/vehicle-refinancing';

for (const width of [1280, 390]) {
  test(`actual vehicle refinancing records survive confirmation and reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = []; page.on('request', request => requests.push(`${request.url()}\n${request.postData() ?? ''}`));
    await page.goto('/returns/new');
    await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
    const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic workspace');
    const source = vehicleRefinancingFixture();
    await page.evaluate(({ id, personal, source }) => {
      const { refinancingSources: _history, ...loan } = source;
      localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
        segmentation: { filingStatus: 'single', incomeTypes: [], lifeEvents: ['additional-deductions'], stateCode: null },
        currentSectionIndex: 2, completedSections: ['personal-info', 'deductions'],
        sectionData: { 'personal-info': personal, deductions: { deductionType: 'standard' },
          'additional-deductions': { schedule1A: { sourceTaxYear: '2025', sourceReference: 'Synthetic annual records', sourceFactsConfirmed: true,
            allSourcesIncluded: true, excludedPuertoRicoIncome: '0', form4563Exclusion: '0', employeeTips: [], businessTips: [], overtime: [], seniorOwners: [],
            vehicleLoans: [{ ...loan, sourceTaxYear: '2025', grossVehicleWeightRating: '4000' }] } } } }));
    }, { id, personal: taxpayerFacts2025, source });
    await page.reload();
    const prefix = 'Vehicle loan 1 refinancing';
    await page.getByText(`${prefix}: Original and refinancing records`, { exact: true }).click();
    await page.getByRole('button', { name: `${prefix}: Add original and refinancing records`, exact: true }).click();
    await expect(page.getByRole('textbox', { name: `${prefix}: Source tax year`, exact: true })).toHaveValue('');
    await page.getByRole('textbox', { name: `${prefix}: Source tax year`, exact: true }).fill('2025');
    await page.getByRole('textbox', { name: `${prefix}: VIN`, exact: true }).fill(source.vin);
    await page.getByRole('textbox', { name: `${prefix}: Packet reference`, exact: true }).fill('Synthetic complete refinance records');
    for (const label of ['All original and refinancing loans are included', 'Same original borrower throughout', 'Principal payments were proportional with no later advances or capitalized interest']) {
      await page.getByRole('combobox', { name: `${prefix}: ${label}`, exact: true }).selectOption('true');
    }
    await page.getByRole('button', { name: `${prefix}: Add original purchase loan`, exact: true }).click();
    const original = source.refinancingSources.originalLoan, refinance = source.refinancingSources.refinancings[0];
    if (!refinance) throw new Error('Missing synthetic refinancing');
    const fields = [ ['sourceId', 'Source ID'], ['sourceReference', 'Source reference'], ['lenderName', 'Lender'], ['loanAccountReference', 'Loan account reference'],
      ['originationDate', 'Loan date'], ['principal', 'Original principal of this loan'], ['interestPaid', 'Current-year interest paid'],
      ['interestDeductedElsewhere', 'Qualifying interest deducted elsewhere'], ['otherExcludedInterest', 'Other excluded qualifying interest'] ] as const;
    for (const [key, label] of fields) {
      const name = `${prefix} original: ${label}`;
      await (key === 'originationDate' ? page.getByLabel(name, { exact: true }) : page.getByRole('textbox', { name, exact: true })).fill(original[key]);
    }
    for (const [key, label] of [['qualifiedPurchaseCosts', 'Qualified purchase costs'], ['otherPurchaseCosts', 'Other purchase costs'], ['downPayment', 'Down payment']] as const) {
      await page.getByRole('textbox', { name: `${prefix} original: ${label}`, exact: true }).fill(original[key]);
    }
    await page.getByRole('combobox', { name: `${prefix} original: First lien`, exact: true }).selectOption('true');
    await page.getByRole('combobox', { name: `${prefix} original: Related-party lender`, exact: true }).selectOption('false');
    await page.getByRole('button', { name: `${prefix}: Add refinancing loan`, exact: true }).click();
    for (const [key, label] of fields) {
      const name = `${prefix} refinance 1: ${label}`;
      await (key === 'originationDate' ? page.getByLabel(name, { exact: true }) : page.getByRole('textbox', { name, exact: true })).fill(refinance[key]);
    }
    await page.getByRole('textbox', { name: `${prefix} refinance 1: Previous loan source ID`, exact: true }).fill('purchase');
    await page.getByRole('textbox', { name: `${prefix} refinance 1: Previous outstanding principal`, exact: true }).fill('20000');
    await page.getByRole('combobox', { name: `${prefix} refinance 1: First lien`, exact: true }).selectOption('true');
    await page.getByRole('combobox', { name: `${prefix} refinance 1: Related-party lender`, exact: true }).selectOption('false');
    await page.getByRole('combobox', { name: `${prefix}: Sources checked after the last edit`, exact: true }).selectOption('true');
    await page.getByRole('combobox', { name: 'Additional deductions: Sources checked after the last edit', exact: true }).selectOption('true');
    const stored = () => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? 'null').sectionData['additional-deductions'].schedule1A, id);
    expect((await stored()).sourceFactsConfirmed).toBe(true);
    await page.reload();
    await page.getByText(`${prefix}: Original and refinancing records`, { exact: true }).click();
    await expect(page.getByRole('textbox', { name: `${prefix} original: Down payment`, exact: true })).toHaveValue('0');
    await expect(page.getByRole('combobox', { name: `${prefix}: Sources checked after the last edit`, exact: true })).toHaveValue('true');
    const paid = page.getByRole('textbox', { name: `${prefix} refinance 1: Current-year interest paid`, exact: true });
    await paid.fill('1000.10'); await paid.blur();
    const edited = await stored(); expect(edited.sourceFactsConfirmed).toBeNull(); expect(edited.vehicleLoans[0].refinancingSources.sourceFactsConfirmed).toBeNull();
    expect(edited.vehicleLoans[0].refinancingSources.refinancings[0].interestPaid).toBe('1,000.10');
    await paid.fill('0'); await paid.blur(); expect((await stored()).vehicleLoans[0].refinancingSources.refinancings[0].interestPaid).toBe('0');
    await paid.fill(''); await paid.blur(); expect((await stored()).vehicleLoans[0].refinancingSources.refinancings[0].interestPaid).toBe('');
    expect(requests.join('\n')).not.toContain(source.vin); expect(requests.join('\n')).not.toContain('new-account'); expect(requests.join('\n')).not.toContain('900-70-0001');
  });
}
