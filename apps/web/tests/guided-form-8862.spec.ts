// Spec: spec/federal/guided-form-8862.yaml. Explicit fictional local source records.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { taxpayerFacts2025 } from './guided-fixtures';
import { fictionalEicHistory2025 } from './eic-history-fixtures';
const child = { firstName: 'Alex', lastName: 'Example', ssn: '', dateOfBirth: '2025-10-01', relationship: 'child', monthsLivedWithYou: '3', qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: false };
const history = fictionalEicHistory2025(false);
const personal = { ...taxpayerFacts2025, firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '2003-02-01',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true, dependentCount: '1', dependents: [child],
  eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-8862-claimant', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } },
  eicDisallowanceHistory: { ...history, filers: history.filers.map(row => ({ ...row, denials: [{ sourceId: 'synthetic-private-8862-denial', sourceReference: 'synthetic-private-8862-IRS-assessment', taxYear: '2024', originalReturnFiledDate: '2025-03-15', noticeDate: '2025-09-01', assessmentDate: '2025-12-01', finalDeterminationDate: null, reason: 'other', procedure: 'deficiency', conduct: 'none', appealPending: false }] })) },
  eicRecertificationSources: { sourceTaxYear: '', sourceReference: '', sourceFactsConfirmed: null,
    filers: [{ owner: 'primary', sourceReference: 'synthetic-private-8862-original-filer', originalTaxpayer: { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333', dateOfBirth: '2003-02-01' } }],
    allCandidateChildrenIncluded: true, children: [{ sourceId: 'dependent:0', sourceReference: 'synthetic-private-8862-child',
      original: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, relationship: child.relationship, monthsLivedWithYou: child.monthsLivedWithYou },
      livedWithTaxpayerInUnitedStatesMoreThanHalfYear: true, specialResidencePeriodClaimed: true, marriedAtYearEnd: false, jointReturnFiled: false,
      validSsnIssuedByDueDate: false, allOtherEligibleClaimantsIncluded: true, otherEligibleClaimants: [], deathDate: '2025-12-31',
      bornAndDeceasedRecord: { sourceReference: 'synthetic-private-8862-hospital', recordType: 'hospital_record', showsLiveBirth: true, copyAvailableForReturnAttachment: false } }] } };
const w2 = { employerName: 'Synthetic current recertification employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '10000', federalWithheld: '0', socialSecurityWages: '10000', socialSecurityTips: '0', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145', box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Current Form8862 at ${viewport.width}px`, () => {
    test('saves current child recertification and downloads the source-bound review', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new'); await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing fictional return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'],
          segmentation: { filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null }, sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload(); const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).toHaveText('Enter more info for an estimate');
      const open = async () => { for (const name of ['Current Form 8862 EIC recertification records', 'Prior Earned Income Credit decisions', 'Earned Income Credit claimant records']) await page.getByText(name, { exact: true }).click(); };
      const select = (name: string) => page.getByRole('combobox', { name, exact: true });
      const text = (name: string) => page.getByRole('textbox', { name, exact: true });
      const confirm = async () => { for (const name of ['Form 8862 current sources checked after the last edit', 'Primary filer: history checked after the last edit', 'EIC history checked after the last edit', 'EIC claimant sources checked after the last edit']) await select(name).selectOption('true'); };
      await open(); await expect(text('Form 8862 current source tax year')).toHaveValue('');
      await text('Form 8862 current source tax year').fill('2025'); await text('Form 8862 current source reference').fill('synthetic-private-8862-current');
      const prefix = 'Form 8862 child 1'; await page.getByRole('button', { name: `${prefix}: add actual residence days`, exact: true }).click();
      await expect(text(`${prefix}: actual U.S. home days`)).toHaveValue('');
      await text(`${prefix}: residence source reference`).fill('synthetic-private-8862-calendar'); await text(`${prefix}: actual U.S. home days`).fill('47');
      await text(`${prefix}: counted foreign extended-duty days`).fill('0'); await page.getByRole('button', { name: `${prefix}: record no temporary absences`, exact: true }).click();
      await select(`${prefix}: all days recorded without overlap`).selectOption('true'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await expect(select(`${prefix}: actual document copy available to attach`)).toHaveValue('false');
      await select(`${prefix}: actual document copy available to attach`).selectOption('true'); await confirm(); await expect(hero).toHaveText('$3,409');
      await page.reload(); await open(); await expect(hero).toHaveText('$3,409'); await expect(text(`${prefix}: actual U.S. home days`)).toHaveValue('47');
      await text(`${prefix}: actual U.S. home days`).fill('46'); await confirm(); await expect(hero).toHaveText('Enter more info for an estimate');
      await text(`${prefix}: actual U.S. home days`).fill(''); await page.reload(); await open();
      await expect(text(`${prefix}: actual U.S. home days`)).toHaveValue(''); await expect(select('Form 8862 current sources checked after the last edit')).toHaveValue('');
      await text(`${prefix}: actual U.S. home days`).fill('47'); await confirm(); await expect(hero).toHaveText('$3,409');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData['personal-info'], id);
      expect(saved.dependents[0].ssn).toBe(''); expect(saved.eicRecertificationSources.children[0].homeDays.actualUnitedStatesDays).toBe('47');
      expect(saved.eicRecertificationSources.children[0].homeDays.temporaryAbsences).toEqual([]); expect(saved.eicRecertificationSources.children[0].validSsnIssuedByDueDate).toBe(false);
      const secrets = ['synthetic-private-8862', '111-22-3333']; for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await select(`${prefix}: actual document copy available to attach`).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current8862-source-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click(); await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true }); await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download'), response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`current8862-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);original=PdfReader(sys.argv[2]);sei=PdfReader(sys.argv[3]);assert r.get_fields() is None
pages=[p.extract_text() or '' for p in r.pages]
f=next(i for i,t in enumerate(pages) if 'Information To Claim Certain Credits After Disallowance' in t)
s=next(i for i,t in enumerate(pages) if 'Qualifying Child Information' in t and 'Alex Example' in t)
def values(page,template,field):
 rect=next(a.get_object()['/Rect'] for a in template.pages[0]['/Annots'] if a.get_object().get('/T')==field);found=[]
 def visit(text,cm,tm,font,size):
  if text.strip() and abs(cm[4]-float(rect[0]))<.01 and abs(cm[5]-float(rect[1]))<.01:found.append(text.strip())
 page.extract_text(visitor_text=visit);return found
print(json.dumps({'pages':pages,'days':values(r.pages[f],original,'f1_07[0]'),'ssn':values(r.pages[s],sei,'f1_06[0]'),'months':values(r.pages[s],sei,'f1_24[0]')}))`, output, resolve('../../forms/blank/2025/f8862.pdf'), resolve('../../forms/blank/2025/f1040sei.pdf')], { encoding: 'utf8', timeout: 30_000 }));
      // The official three-cell comb field extracts as "3 6 5". Normalize only
      // extraction whitespace inside this exact field; retain row count/value.
      expect(checked.days.map((value: string) => value.replace(/\s+/g, ''))).toEqual(['365']); expect(checked.ssn).toEqual(['Died']); expect(checked.months).toEqual(['12']);
      expect(checked.pages.join('\n')).toContain('actual 47 days; printed 365 days'); expect(checked.pages.join('\n')).toContain('Attach the actual live-birth document copy');
      for (const pageText of checked.pages) expect(pageText).toContain('FOR REVIEW ONLY - NOT FOR FILING');
      for (const secret of [...secrets, '111223333', 'dependent:0']) expect(checked.pages.join('\n')).not.toContain(secret);
      for (const request of requests.filter(request => secrets.some(secret => request.body.includes(secret)))) { expect(new URL(request.url).origin).toBe(new URL(page.url()).origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return'); }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`current8862-review-${viewport.width}.png`) });
    });
  });
}
