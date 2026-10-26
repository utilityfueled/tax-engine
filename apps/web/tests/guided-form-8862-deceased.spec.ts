// Spec: spec/federal/form-8862-deceased-claimant.yaml. Fictional original records.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { taxpayerFacts2025 } from './guided-fixtures';
import { fictionalEicHistory2025 } from './eic-history-fixtures';

const filers = [
  { owner: 'primary', firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '1985-01-02', end: '2025-06-30', days: '91' },
  { owner: 'spouse', firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1988-01-02', end: '2025-12-31', days: '183' },
];
const history = fictionalEicHistory2025(true);
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '1985-01-02',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true, livedWithSpouseAtAnyTimeDuringYear: true,
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1988-01-02', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, primaryDeceased: true, primaryDeathDate: '2025-06-30',
    spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false },
  eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-death-claimant', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false,
    primaryQualifyingChildOfAnotherTaxpayer: false, spouseQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false },
    spouseChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } },
  eicDisallowanceHistory: { ...history, filers: history.filers.map(row => row.owner === 'primary' ? { ...row,
    denials: [{ sourceId: 'synthetic-private-death-denial', sourceReference: 'synthetic-private-death-assessment', taxYear: '2024',
      originalReturnFiledDate: '2025-03-15', noticeDate: '2025-09-01', assessmentDate: '2025-12-01', finalDeterminationDate: null,
      reason: 'other', procedure: 'deficiency', conduct: 'none', appealPending: false }] } : row) },
  eicRecertificationSources: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-death-current', sourceFactsConfirmed: true,
    allCandidateChildrenIncluded: true, children: [], filers: filers.map(row => ({ owner: row.owner,
      sourceReference: `synthetic-private-death-${row.owner}`, originalTaxpayer: { firstName: row.firstName, lastName: row.lastName, ssn: row.ssn, dateOfBirth: row.dateOfBirth },
      applicableYearStart: '2025-01-01', applicableYearEnd: row.end, homeDays: { sourceReference: `synthetic-private-death-calendar-${row.owner}`,
        actualUnitedStatesDays: row.days, temporaryAbsences: [], militaryOutsideUnitedStatesDays: '0', allDaysIncludedAndDistinctConfirmed: true } })) } };
const w2 = { employerName: 'Synthetic final-year employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '10000', federalWithheld: '0',
  socialSecurityWages: '10000', socialSecurityTips: '0', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Actual deceased-claimant periods at ${viewport.width}px`, () => {
    test('saves separate death periods and downloads the actual claimant review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'],
          segmentation: { filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).toHaveText('Enter more info for an estimate');
      const open = async () => { for (const label of ['Current Form 8862 EIC recertification records', 'Prior Earned Income Credit decisions', 'Earned Income Credit claimant records']) await page.getByText(label, { exact: true }).click(); };
      const text = (name: string) => page.getByRole('textbox', { name, exact: true });
      const select = (name: string) => page.getByRole('combobox', { name, exact: true });
      const confirm = async () => { for (const label of ['Form 8862 current sources checked after the last edit', 'Primary filer: history checked after the last edit', 'Spouse: history checked after the last edit', 'EIC history checked after the last edit', 'EIC claimant sources checked after the last edit']) await select(label).selectOption('true'); };
      const remarried = select('Did the surviving spouse remarry before the end of their own tax year?');
      await open(); await page.getByRole('button', { name: 'Add actual joint-return-after-death records', exact: true }).click();
      await expect(text('Form 8862 joint death-period source reference')).toHaveValue(''); await expect(remarried).toHaveValue('');
      await text('Form 8862 joint death-period source reference').fill('synthetic-private-death-marriage');
      await remarried.selectOption('true'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await remarried.selectOption('false'); await confirm(); await expect(hero).toHaveText('$649');
      const primaryDays = text('Form 8862 primary filer: actual U.S. home days');
      const spouseDays = text('Form 8862 spouse filer: actual U.S. home days');
      await expect(primaryDays).toHaveValue('91'); await expect(spouseDays).toHaveValue('183');
      await primaryDays.fill('90'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await primaryDays.fill('91'); await confirm(); await expect(hero).toHaveText('$649');
      await spouseDays.fill('182'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await spouseDays.fill('183'); await confirm(); await expect(hero).toHaveText('$649');
      await remarried.selectOption(''); await page.reload(); await open();
      await expect(remarried).toHaveValue(''); await expect(select('Form 8862 current sources checked after the last edit')).toHaveValue('');
      await expect(hero).toHaveText('Enter more info for an estimate');
      await remarried.selectOption('false'); await confirm(); await page.reload(); await open();
      await expect(remarried).toHaveValue('false'); await expect(primaryDays).toHaveValue('91'); await expect(spouseDays).toHaveValue('183');
      await expect(hero).toHaveText('$649');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData['personal-info'], id);
      expect(saved.eicRecertificationSources.filers.map((row: { applicableYearEnd: string; homeDays: { actualUnitedStatesDays: string } }) => [row.applicableYearEnd, row.homeDays.actualUnitedStatesDays])).toEqual([['2025-06-30', '91'], ['2025-12-31', '183']]);
      expect(saved.eicRecertificationSources.jointReturnAfterDeath.survivingSpouseRemarriedBeforeOwnYearEnd).toBe(false);
      const secrets = ['synthetic-private-death', '111-22-3333', '222-33-4444'];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await remarried.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`deceased8862-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`deceased8862-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);original=PdfReader(sys.argv[2]);assert r.get_fields() is None
pages=[p.extract_text() or '' for p in r.pages];first=next(i for i,t in enumerate(pages) if 'Information To Claim Certain Credits After Disallowance' in t)
def values(field):
 rect=next(a.get_object()['/Rect'] for a in original.pages[1]['/Annots'] if a.get_object().get('/T')==field);found=[]
 def visit(text,cm,tm,font,size):
  if text.strip() and abs(cm[4]-float(rect[0]))<.01 and abs(cm[5]-float(rect[1]))<.01:found.append(text.strip())
 r.pages[first+1].extract_text(visitor_text=visit);return found
print(json.dumps({'pages':pages,'daysPrimary':values('f2_01[0]'),'daysSpouse':values('f2_02[0]'),'agePrimary':values('f2_03[0]'),'ageSpouse':values('f2_04[0]')}))`, output, resolve('../../forms/blank/2025/f8862.pdf')], { encoding: 'utf8', timeout: 30_000 }));
      const numeric = (values: string[]) => values.map(value => value.replace(/\s+/g, ''));
      expect(numeric(checked.daysPrimary)).toEqual(['91']); expect(numeric(checked.daysSpouse)).toEqual(['183']);
      expect(numeric(checked.agePrimary)).toEqual(['40']); expect(numeric(checked.ageSpouse)).toEqual(['37']);
      expect(checked.pages.join('\n')).toContain('2025-01-01 through 2025-06-30; 181 days');
      expect(checked.pages.join('\n')).toContain('2025-01-01 through 2025-12-31; 365 days');
      for (const pageText of checked.pages) expect(pageText.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of [...secrets, '111223333', '222334444']) expect(checked.pages.join('\n')).not.toContain(secret);
      for (const request of requests.filter(request => secrets.some(secret => request.body.includes(secret)))) { expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`deceased8862-review-${viewport.width}.png`) });
    });
  });
}
