// Spec: spec/federal/guided-ira-basis.yaml
import { expect, test } from '@playwright/test';
import { taxpayerFacts2025 } from './guided-fixtures';

const owners = ['primary', 'spouse'].map((accountHolder, index) => ({ accountHolder,
  identity: { firstName: index ? 'John' : 'Jane', lastName: 'Doe', dateOfBirth: '1960-01-15', ssnLast4: index ? '4321' : '6789' },
  basisHistory: { method: 'prior_form_8606', sourceTaxYear: '2024', line14: index ? '2000' : '1000', line15cWorksheetAdjustment: '0',
    sourceReference: `synthetic-private-${accountHolder}-prior-return`, mostRecentFormConfirmed: true, allPriorRecordsReviewed: true, basisChangesSinceThatReturn: false },
  ordinaryFacts: { currentYearContributionsPresent: false, conversionsPresent: false, rolloversPresent: false, qcdPresent: false, hsaFundingPresent: false,
    contributionReturnsPresent: false, specialDistributionsOrRepaymentsPresent: false, inheritedAccountsPresent: false, divorceOrOtherBasisTransfersPresent: false, otherBasisEventsPresent: false },
  accounts: [{ accountId: `${accountHolder}-one`, sourceTaxYear: '2025', accountType: 'traditional', custodian: 'Actual Custodian', custodianTin: '12-3456789',
    accountReference: `private-${accountHolder}-account`, sourceReference: 'Actual December 31 statement', yearEndValue: index ? '8000' : '2002.49' }],
}));
const entries = owners.map((owner, index) => ({ payer: 'Actual Custodian', payerTin: '12-3456789', accountReference: owner.accounts[0]!.accountReference, accountHolder: owner.accountHolder,
  sourceTaxYear: '2025', grossDistribution: index ? '2000' : '1001.49', taxableAmount: '', federalWithheld: '0', distributionCode: '7', isIraSepSimple: true,
  taxableAmountNotDetermined: true, taxableAmountConfirmed: null, employeeContributions: '0', capitalGainIncluded: '0', netUnrealizedAppreciation: '0', otherSourceAmount: '0', inPlanRothRolloverAmount: '0',
  stateTaxReporting: 'none', localTaxReporting: 'none', iraBasisConfirmedZero: false, eligibleGovernmental457bPlan: false, militaryPensionOrSurvivorBenefit: false,
  qualifiedJointSurvivorAnnuity: false, additionalWorksheetRequired: true, otherRetirementWorksheetRequired: false, sourceFactsConfirmed: true,
}));
const basisSources = { sourceTaxYear: '2025', sourceReference: 'Actual complete separate-owner IRA packet', sourceFactsConfirmed: true,
  allIraOwnersAndAccountsIncluded: true, allDistributionsIncluded: true, owners,
  distributions: entries.map((entry, index) => ({ sourceId: `form1099R:${index}`, sourceTaxYear: '2025', sourceReference: 'Actual original distribution statement',
    accountId: owners[index]!.accounts[0]!.accountId, accountHolder: entry.accountHolder, payer: entry.payer, payerTin: entry.payerTin, accountReference: entry.accountReference,
    grossDistribution: entry.grossDistribution, taxableAmount: '', taxableAmountNotDetermined: true, iraSepSimple: true, distributionCode: '7' })),
};

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`IRA source basis at ${viewport.width}px`, () => {
    test('persists actual owner basis and original source amounts', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: string[] = [];
      page.on('request', request => requests.push(request.postData() ?? ''));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic workspace');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      const personal = { ...taxpayerFacts2025, firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789', dateOfBirth: '1960-01-15',
        spouse: { firstName: 'John', lastName: 'Doe', ssn: '987-65-4321', dateOfBirth: '1960-01-15', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true }, livedWithSpouseAtAnyTimeDuringYear: true };
      await page.evaluate(({ id, personal, entries, basisSources }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025, currentSectionIndex: 1,
          completedSections: ['personal-info'], segmentation: { filingStatus: 'mfj', incomeTypes: ['retirement'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-retirement': { entries, basisSources } } }));
      }, { id, personal, entries, basisSources });
      await page.reload();
      const basis = page.getByRole('textbox', { name: /^Owner #1 prior Form 8606 line 14\b/ });
      await expect(basis).toHaveValue('1000');
      await expect(page.getByRole('textbox', { name: /^Printed taxable amount \(Box 2a\)/ }).first()).toHaveValue('');
      await basis.fill('1001'); await basis.press('Tab');
      const confirmation = page.getByRole('combobox', { name: 'All IRA basis sources checked after the last edit', exact: true });
      await expect(confirmation).toHaveValue(''); await confirmation.selectOption('true');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-retirement']?.basisSources?.sourceFactsConfirmed, id)).toBe(true);
      await page.reload(); await expect(basis).toHaveValue('1,001'); await expect(confirmation).toHaveValue('true');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['income-retirement'], id);
      expect(saved.entries[0].taxableAmount).toBe(''); expect(saved.basisSources.distributions[0].taxableAmount).toBe('');
      expect(saved.basisSources.owners[1].basisHistory.line14).toBe('2000');
      await page.getByRole('textbox', { name: /^Gross distribution \(Box 1\)/ }).first().fill('1002.49');
      await expect(confirmation).toHaveValue('');
      await page.getByRole('combobox', { name: 'Owner #1: Any Roth conversions?', exact: true }).selectOption('');
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Owner #1: Any Roth conversions?', exact: true })).toHaveValue('');
      await expect(confirmation).toHaveValue(''); await confirmation.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`ira-basis-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const secret of [personal.ssn, 'private-primary-account', 'synthetic-private-primary-prior-return']) expect(requests.join('\n')).not.toContain(secret);
    });
  });
}
