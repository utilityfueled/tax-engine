// Spec: spec/federal/nonitemized-charitable-election.yaml.
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025,
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false,
    spouseDeceased: false, spouseItemizes: true, claimSpouseAdditionalDeduction: false },
  livedWithSpouseAtAnyTimeDuringYear: true, employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true,
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '900-70-0002', dateOfBirth: '1991-04-15', usResidencyMonths: '12',
    employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true } };
const w2 = { employerName: 'Synthetic nonitemizer employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '75000',
  federalWithheld: '15000', socialSecurityWages: '75000', socialSecurityTips: '0', socialSecurityWithheld: '4650',
  medicareWages: '75000', medicareWithheld: '1087.50', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Nonitemized charity at ${viewport.width}px`, () => {
    test('preserves an explicit nonitemized election and current cash facts', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const bodies: string[] = [];
      page.on('request', request => bodies.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2026,
          currentSectionIndex: 2, completedSections: ['personal-info', 'income-w2'],
          segmentation: { filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] }, deductions: {
            method: 'standard', medicalExpenses: '250.10', stateLocalTaxes: '0', realEstateTaxes: '0', mortgageInterest: '0',
            charitableContributions: '0', casualtyLosses: '0', otherItemized: '0', gamblingWinnings: '0',
            nonW2IncomeTaxesDeductedElsewhere: '0', donationEntries: [],
          } } }));
      }, { id, personal, w2 });
      await page.reload();
      const choice = page.getByRole('radio', { name: /Do not itemize; standard deduction unavailable/ });
      await choice.check(); await expect(choice).toBeChecked();
      await expect(page.locator('.guided-deduction-standard-callout')).toHaveCount(0);
      const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('button', { name: 'Add donation', exact: true }).click();
      await page.getByRole('textbox', { name: 'Donation recipient', exact: true }).fill('Synthetic private current-charity source');
      await page.getByRole('combobox', { name: 'Donation type', exact: true }).selectOption('cash');
      const amount = page.getByRole('textbox', { name: /^Donation amount \/ fair market value/ });
      await amount.fill('1500.10'); await amount.press('Tab');
      await page.getByLabel('Donation date', { exact: true }).fill('2026-05-15');
      for (const [label, answer] of [
        ['Recipient is a private foundation / second-category organization', 'false'],
        ['Recipient qualifies for a charitable contribution deduction', 'true'],
        ['Recipient is a supporting organization', 'false'], ['Gift was to a donor-advised fund', 'false'],
      ]) await page.getByRole('combobox', { name: label, exact: true }).selectOption(answer);
      const supporting = page.getByRole('combobox', { name: 'Recipient is a supporting organization', exact: true });
      await supporting.selectOption('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}')
        .sectionData?.deductions?.donationEntries?.[0]?.supportingOrganization, id)).toBe(null);
      await page.reload();
      await expect(choice).toBeChecked(); await expect(amount).toHaveValue('1,500.10'); await expect(supporting).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await supporting.selectOption('false');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}')
        .sectionData?.deductions?.donationEntries?.[0]?.supportingOrganization, id)).toBe(false);
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}'), id);
      expect(saved.taxYear).toBe(2026); expect(saved.sectionData.deductions.method).toBe('nonitemized');
      expect(saved.sectionData.deductions.medicalExpenses).toBe('250.10');
      expect(saved.sectionData['personal-info'].standardDeductionFacts.spouseItemizes).toBe(true);
      expect(saved.sectionData.deductions.donationEntries[0]).toMatchObject({ amount: '1,500.10', date: '2026-05-15',
        qualifiedOrganization: true, isPrivateFoundation: false, supportingOrganization: false, donorAdvisedFund: false });
      expect(saved.sectionData.deductions).not.toHaveProperty('standardDeduction');
      expect(saved.sectionData.deductions).not.toHaveProperty('nonitemizerCharitableDeduction');
      await choice.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`nonitemized-charity-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const source of ['Synthetic private current-charity source', personal.ssn, personal.spouse.ssn]) expect(bodies.join('\n')).not.toContain(source);
    });
  });
}
