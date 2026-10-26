// Spec: spec/federal/eic-claimant-eligibility.yaml. Synthetic local records only.
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', dateOfBirth: '2002-02-01',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true, livedWithSpouseAtAnyTimeDuringYear: true,
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1998-02-01', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false },
  eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-eic-source', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false } };
const w2 = { employerName: 'Synthetic EIC employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '10000', federalWithheld: '0',
  socialSecurityWages: '10000', socialSecurityTips: '0', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`EIC claimant sources at ${viewport.width}px`, () => {
    test('preserves actual EIC claimant answers and local privacy', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: [], segmentation: { filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload(); await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$649');
      const open = async () => { await page.getByText('Earned Income Credit claimant records', { exact: true }).click(); };
      await open();
      await expect(page.getByRole('combobox', { name: 'Were you a nonresident alien for any part of the tax year?', exact: true })).toHaveValue('false');
      await expect(page.getByRole('combobox', { name: 'Valid joint resident election under section 6013(g) or (h)', exact: true })).toHaveValue('');
      const spouseSsn = page.getByRole('combobox', { name: "Was your spouse's employment-valid SSN issued by the return due date, including extensions?", exact: true });
      const confirmation = page.getByRole('combobox', { name: 'EIC claimant sources checked after the last edit', exact: true });
      await spouseSsn.selectOption('false'); await expect(confirmation).toHaveValue('');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await confirmation.selectOption('true'); await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$0');
      await page.reload(); await open(); await expect(spouseSsn).toHaveValue('false'); await expect(confirmation).toHaveValue('true');
      await expect(page.getByRole('textbox', { name: 'EIC claimant source reference', exact: true })).toHaveValue('synthetic-private-eic-source');
      await spouseSsn.selectOption('true'); await confirmation.selectOption('true');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$649');
      await page.getByRole('combobox', { name: 'Was your spouse a nonresident alien for any part of the tax year?', exact: true }).selectOption('');
      await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['personal-info']?.eicClaimantEligibility?.spouseNonresidentAlienDuringYear, id)).toBeNull();
      await page.reload(); await open();
      await expect(page.getByRole('combobox', { name: 'Was your spouse a nonresident alien for any part of the tax year?', exact: true })).toHaveValue('');
      await expect(confirmation).toHaveValue('');
      await confirmation.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`eic-claimant-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of ['synthetic-private-eic-source', personal.ssn, personal.spouse.ssn]) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
