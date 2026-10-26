// Spec: spec/federal/guided-eic-disallowance-history.yaml. Fictional local records.
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

const home = { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false };
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', dateOfBirth: '1990-02-01',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true, livedWithSpouseAtAnyTimeDuringYear: true,
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1990-02-01', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false },
  eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-history-claimant', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false,
    primaryQualifyingChildOfAnotherTaxpayer: false, spouseQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { ...home }, spouseChildless: { ...home } } };
const w2 = { employerName: 'Synthetic history employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '10000', federalWithheld: '0',
  socialSecurityWages: '10000', socialSecurityTips: '0', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual EIC history at ${viewport.width}px`, () => {
    test('saves separate actual EIC histories and derived bans locally', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const bodies: string[] = [];
      page.on('request', request => bodies.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: [], segmentation: { filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('Enter more info for an estimate');
      const open = async () => {
        await page.getByText('Prior Earned Income Credit decisions', { exact: true }).click();
        await page.getByText('Earned Income Credit claimant records', { exact: true }).click();
      };
      await open(); await page.getByRole('button', { name: 'Add EIC denial and allowance history', exact: true }).click();
      const select = (name: string) => page.getByRole('combobox', { name, exact: true });
      const text = (name: string) => page.getByRole('textbox', { name, exact: true });
      await expect(text('EIC history source tax year')).toHaveValue('');
      await text('EIC history source tax year').fill('2025');
      await text('EIC history source reference').fill('synthetic-private-history-source');
      await select('Current EIC claim status').selectOption('preparing');
      await page.getByLabel('EIC history reviewed through', { exact: true }).fill('2026-03-01');
      await page.getByLabel('EIC preparation as of', { exact: true }).fill('2026-03-01');
      await page.getByRole('button', { name: 'Copy actual filer identities', exact: true }).click();
      for (const owner of ['Primary filer', 'Spouse']) {
        await expect(select(`${owner}: all EIC history included`)).toHaveValue('');
        await text(`${owner}: history source reference`).fill(`synthetic-private-${owner}-history`);
        await page.getByRole('button', { name: `${owner}: record no prior EIC denials`, exact: true }).click();
        await page.getByRole('button', { name: `${owner}: record no later IRS allowances`, exact: true }).click();
        await select(`${owner}: all EIC history included`).selectOption('true');
      }
      const confirm = async () => {
        for (const owner of ['Primary filer', 'Spouse']) await select(`${owner}: history checked after the last edit`).selectOption('true');
        await select('EIC history checked after the last edit').selectOption('true');
        await select('EIC claimant sources checked after the last edit').selectOption('true');
      };
      await confirm(); await expect(hero).toHaveText('$649');
      await page.reload(); await open(); await expect(hero).toHaveText('$649');
      await page.getByRole('button', { name: 'Spouse: add an actual EIC denial', exact: true }).click();
      const prefix = 'Spouse denial 1';
      await text(`${prefix}: original denial ID`).fill('synthetic-private-denial');
      await text(`${prefix}: source reference`).fill('synthetic-private-irs-determination');
      await text(`${prefix}: denied return tax year`).fill('2024');
      await page.getByLabel(`${prefix}: original return filing date`, { exact: true }).fill('2025-03-15');
      await page.getByLabel(`${prefix}: IRS notice date`, { exact: true }).fill('2025-09-01');
      for (const fact of ['assessment', 'final determination']) {
        await expect(select(`${prefix}: ${fact} status`)).toHaveValue('');
        await select(`${prefix}: ${fact} status`).selectOption('occurred');
        await page.getByLabel(`${prefix}: ${fact} date`, { exact: true }).fill('2025-12-01');
      }
      await select(`${prefix}: actual denial reason`).selectOption('income_only');
      await select(`${prefix}: actual IRS procedure`).selectOption('deficiency');
      await select(`${prefix}: final conduct determination`).selectOption('reckless');
      await select(`${prefix}: pending appeal`).selectOption('false');
      await page.getByRole('button', { name: `${prefix}: record no intervening original returns`, exact: true }).click();
      await select(`${prefix}: complete intervening filing history recorded`).selectOption('true');
      await expect(select('EIC history checked after the last edit')).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await select('Spouse: all EIC history included').selectOption('true');
      await confirm(); await expect(hero).toHaveText('$0');
      await page.reload(); await open(); await expect(hero).toHaveText('$0');
      await expect(select(`${prefix}: pending appeal`)).toHaveValue('false');
      await expect(page.getByLabel(`${prefix}: final determination date`, { exact: true })).toHaveValue('2025-12-01');
      await select(`${prefix}: pending appeal`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`eic-history-ban-${viewport.width}.png`) });
      await page.getByRole('button', { name: 'Spouse: mark denial history unknown', exact: true }).click();
      await expect(hero).toHaveText('Enter more info for an estimate');
      await page.reload(); await open();
      await expect(page.getByRole('button', { name: 'Spouse: record no prior EIC denials', exact: true })).toBeVisible();
      await expect(select('Spouse: history checked after the last edit')).toHaveValue('');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['personal-info']?.eicDisallowanceHistory, id);
      expect(saved.filers[0].denials).toEqual([]); expect(saved.filers[1].denials).toBeUndefined();
      expect(saved.filers[1].laterAllowances).toEqual([]); expect(saved.sourceFactsConfirmed).toBeNull();
      expect(saved.filers[1].originalTaxpayer.ssn).toBe(personal.spouse.ssn);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await select('EIC history checked after the last edit').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`eic-history-unknown-${viewport.width}.png`) });
      for (const secret of ['synthetic-private-history-source', 'synthetic-private-irs-determination', personal.ssn, personal.spouse.ssn]) expect(bodies.join('\n')).not.toContain(secret);
    });
  });
}
