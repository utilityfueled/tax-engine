// Spec: spec/federal/eic-separated-review.yaml. Fictional local source records.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { taxpayerFacts2025 } from './guided-fixtures';

const child = { firstName: 'Alex', lastName: 'Example', ssn: '', dateOfBirth: '2015-06-01', relationship: 'child', monthsLivedWithYou: '6',
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
  test.describe(`Separated-spouse child review at ${viewport.width}px`, () => {
    test('downloads the actual self-only child review after local reload', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing actual synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'],
          segmentation: { filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload(); await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$649');
      await page.reload(); await expect(page.locator('.guided-ticker-value-hero').first()).toHaveText('$649');
      const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['personal-info'], id);
      expect(saved.dependents[0].ssn).toBe(''); expect(saved.dependents[0].monthsLivedWithYou).toBe('6');
      expect(saved.eicSeparatedSpouseSources.children[0].original.monthsLivedWithYou).toBe('6');
      expect(saved.eicSeparatedSpouseSources.children[0].validSsnIssuedByDueDate).toBe(false);
      const secrets = ['synthetic-private-rule3', personal.ssn, personal.spouse.ssn];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
      await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
      const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
      await expect(bundle).toContainText('Filing exports are not yet qualified');
      const downloading = page.waitForEvent('download');
      const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
      await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click(); expect((await response).status()).toBe(200);
      const output = testInfo.outputPath(`actual-child-review-${viewport.width}.pdf`); await (await downloading).saveAs(output);
      const reopened = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `import json,sys
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);form=PdfReader(sys.argv[2]);child=PdfReader(sys.argv[3]);assert r.get_fields() is None
pages=[p.extract_text() or '' for p in r.pages]
sei=next(i for i,t in enumerate(pages) if 'Qualifying Child Information' in t and 'Alex Example' in t)
def mark(page,template,pageno,field):
 rect=next(a.get_object()['/Rect'] for a in template.pages[pageno]['/Annots'] if a.get_object().get('/T')==field)
 values=[]
 def visit(text,cm,tm,font,size):
  if '✔' in text and abs(cm[4]-float(rect[0]))<.01 and abs(cm[5]-float(rect[1]))<.01: values.append(text)
 page.extract_text(visitor_text=visit)
 return len(values)==1
# The flattened text appearance at line6 must contain seven, not the original six.
rect=next(a.get_object()['/Rect'] for a in child.pages[0]['/Annots'] if a.get_object().get('/T')=='f1_24[0]')
months=[]
def visit(text,cm,tm,font,size):
 # The saved field appearance has its own text matrix; its CTM identifies the widget origin.
 if abs(cm[4]-float(rect[0]))<.01 and abs(cm[5]-float(rect[1]))<.01 and text.strip(): months.append(text.strip())
r.pages[sei].extract_text(visitor_text=visit)
print(json.dumps({'text':' '.join(pages),'home':mark(r.pages[1],form,0,'c1_5[0]'),'noEic':mark(r.pages[2],form,1,'c2_13[0]'),'months':months,'pages':len(pages)}))`, output,
        resolve('../../forms/blank/2025/f1040.pdf'), resolve('../../forms/blank/2025/f1040sei.pdf')], { encoding: 'utf8', timeout: 30_000 }));
      expect(reopened.home).toBe(false); expect(reopened.noEic).toBe(false); expect(reopened.months).toEqual(['7']);
      expect(reopened.text).toContain('649'); expect(reopened.text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
      for (const secret of [...secrets, '111223333', '222334444', 'dependent:0']) expect(reopened.text).not.toContain(secret);
      const origin = new URL(page.url()).origin;
      for (const request of requests.filter(request => secrets.some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await bundle.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`actual-child-review-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
