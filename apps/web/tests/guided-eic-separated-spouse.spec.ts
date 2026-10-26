// Spec: spec/federal/guided-eic-separated-spouse.yaml. Fictional local source records.
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

const child = { firstName: 'Alex', lastName: 'Example', ssn: '', dateOfBirth: '2015-06-01', relationship: 'child', monthsLivedWithYou: '12',
  qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', dateOfBirth: '2003-02-15',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true, livedWithSpouseAtAnyTimeDuringYear: true,
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1990-02-01', usResidencyMonths: '12' },
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseItemizes: false, claimSpouseAdditionalDeduction: false },
  dependentCount: '1', dependents: [child],
  eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-rule3-claimant', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: false, countedMilitaryDutyOutsideUnitedStates: false } },
  eicSeparatedSpouseSources: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-rule3-separation', sourceFactsConfirmed: true,
    taxpayer: { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '2003-02-15' },
    applicableYearStart: '2025-01-01', applicableYearEnd: '2025-12-31', marriedAtYearEnd: true, principalHomesApartLastSixMonths: true,
    allCandidateChildrenIncluded: true, children: [{ sourceId: 'dependent:0', sourceReference: 'synthetic-private-rule3-child',
      original: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou },
      livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: false, marriedAtYearEnd: false,
      jointReturnFiled: false, validSsnIssuedByDueDate: false, allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [] }] } };
const w2 = { employerName: 'Synthetic Rule3 employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '10000', federalWithheld: '0',
  socialSecurityWages: '10000', socialSecurityTips: '0', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Separated-spouse EIC sources at ${viewport.width}px`, () => {
    test('saves actual separation and self-only child facts locally without guessing eligibility', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const bodies: string[] = [];
      page.on('request', request => bodies.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'],
          segmentation: { filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first();
      await expect(hero).toHaveText('$649');
      const open = async () => {
        await page.getByText('Earned Income Credit claimant records', { exact: true }).click();
        await page.getByText('Separated-spouse Earned Income Credit records', { exact: true }).click();
      };
      await open();
      const field = (name: string) => page.getByRole('combobox', { name, exact: true });
      const apart = field('Principal homes were apart throughout the last six months');
      const checked = field('Separated-spouse sources checked after the last edit');
      const claimantChecked = field('EIC claimant sources checked after the last edit');
      const validSsn = field('Child 1: timely valid employment-authorized SSN');
      await expect(validSsn).toHaveValue('false');
      await expect(field('Legally separated under a qualifying state-law agreement or decree')).toHaveValue('');
      await expect(page.getByText(/The copied identifier is actually blank/)).toBeVisible();
      await apart.selectOption('false'); await expect(checked).toHaveValue(''); await expect(claimantChecked).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await field('Legally separated under a qualifying state-law agreement or decree').selectOption('true');
      await field('Different households at the end of the applicable year').selectOption('true');
      await page.getByRole('button', { name: 'Add the actual separation instrument', exact: true }).click();
      await field('Separation instrument type').selectOption('written-separation-agreement');
      await page.getByRole('textbox', { name: 'Separation instrument state abbreviation', exact: true }).fill('OH');
      await page.getByLabel('Separation instrument effective date', { exact: true }).fill('2025-11-01');
      await page.getByRole('textbox', { name: 'Separation instrument source reference', exact: true }).fill('synthetic-private-rule3-instrument');
      await checked.selectOption('true'); await claimantChecked.selectOption('true'); await expect(hero).toHaveText('$649');
      await page.reload(); await open();
      await expect(apart).toHaveValue('false'); await expect(validSsn).toHaveValue('false'); await expect(checked).toHaveValue('true');
      await validSsn.selectOption(''); await expect(checked).toHaveValue(''); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['personal-info']?.eicSeparatedSpouseSources?.children?.[0]?.validSsnIssuedByDueDate, id)).toBeNull();
      await page.reload(); await open(); await expect(validSsn).toHaveValue('');
      await validSsn.selectOption('false'); await checked.selectOption('true'); await claimantChecked.selectOption('true');
      await expect(hero).toHaveText('$649');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['personal-info'], id);
      expect(saved.dependents[0].ssn).toBe(''); expect(saved.eicSeparatedSpouseSources.children[0].original.ssn).toBe('');
      expect(saved.eicSeparatedSpouseSources.children[0].otherEligibleClaimants).toEqual([]);
      expect(saved.eicSeparatedSpouseSources.principalHomesApartLastSixMonths).toBe(false);
      expect(saved.eicSeparatedSpouseSources.separationInstrument.sourceReference).toBe('synthetic-private-rule3-instrument');
      expect(saved.eicClaimantEligibility.primaryChildless.mainHomeInUnitedStatesMoreThanHalfYear).toBe(false);
      for (const secret of ['synthetic-private-rule3', personal.ssn, personal.spouse.ssn]) expect(bodies.some(body => body.includes(secret))).toBe(false);
      await validSsn.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`separated-child-sources-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await apart.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`separated-alternatives-${viewport.width}.png`) });
    });
  });
}
