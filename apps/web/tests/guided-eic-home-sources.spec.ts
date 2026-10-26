// Spec: spec/federal/guided-eic-home-sources.yaml. Synthetic local sources only.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { taxpayerFacts2025 } from './guided-fixtures';

const personal = { ...taxpayerFacts2025, firstName: 'Jordan', ssn: '111-22-3333', dateOfBirth: '1990-02-01',
  employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true, livedWithSpouseAtAnyTimeDuringYear: true,
  spouse: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444', dateOfBirth: '1990-02-01', usResidencyMonths: '12', employmentValidSsnIssuedByDueDate: true, tinIssuedByDueDate: true },
  standardDeductionFacts: { ...taxpayerFacts2025.standardDeductionFacts, spouseBlind: false, spouseCanBeClaimedAsDependent: false, spouseDeceased: false },
  dependentCount: '1', dependents: [{ firstName: 'Alex', lastName: 'Example', ssn: '333-44-5555', dateOfBirth: '2015-06-01', relationship: 'child', monthsLivedWithYou: '12',
    qualifiesForCTC: false, qualifiesForODC: false, qualifiesForEIC: true, ctcSsnEligible: true, odcTinEligible: true }],
  eicClaimantEligibility: { sourceTaxYear: '2025', sourceReference: 'synthetic-private-childful-home', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, spouseNonresidentAlienDuringYear: false,
    primaryQualifyingChildOfAnotherTaxpayer: false, spouseQualifyingChildOfAnotherTaxpayer: false } };
const w2 = { employerName: 'Synthetic EIC employer', employerEin: '12-3456789', accountHolder: 'primary', wages: '10000', federalWithheld: '0',
  socialSecurityWages: '10000', socialSecurityTips: '0', socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145',
  box10DependentCareBenefits: '0', box12CodeW: '0', stateTaxReporting: 'none' };

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Childful main-home sources at ${viewport.width}px`, () => {
    test('saves and prints actual childful home facts without changing EIC eligibility', async ({ page }, testInfo) => {
      await page.setViewportSize(viewport); const requests: { url: string; body: string }[] = [];
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() ?? '' }));
      await page.goto('/returns/new');
      await expect(page).toHaveURL(/\/returns\/(?!new(?:[/?#]|$))[a-z0-9-]+(?:\?create=1)?$/i);
      const id = new URL(page.url()).pathname.split('/').at(-1); if (!id) throw new Error('Missing synthetic return');
      await expect.poll(() => page.evaluate(id => Boolean(JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1') ?? '{}').workspaces?.[id]), id)).toBe(true);
      await page.evaluate(({ id, personal, w2 }) => {
        localStorage.setItem(`tax-engine:guided-mode:${id}`, 'true');
        localStorage.setItem(`tax-engine.guided-flow-state.v1:${id}`, JSON.stringify({ factsVersion: 2, phase: 'interview', taxYear: 2025,
          currentSectionIndex: 0, completedSections: ['personal-info', 'income-w2', 'deductions', 'credits', 'payments', 'review', 'final-review'],
          segmentation: { filingStatus: 'mfj', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null },
          sectionData: { 'personal-info': personal, 'income-w2': { entries: [w2] } } }));
      }, { id, personal, w2 });
      await page.reload();
      const hero = page.locator('.guided-ticker-value-hero').first(); await expect(hero).toHaveText('$3,409');
      const open = async () => { await page.getByText('Earned Income Credit claimant records', { exact: true }).click(); };
      await open();
      const primaryHome = page.getByRole('combobox', { name: 'Your main home was in the United States for more than half of the applicable tax year', exact: true });
      const spouseHome = page.getByRole('combobox', { name: "Your spouse's main home was in the United States for more than half of the applicable tax year", exact: true });
      const confirmation = page.getByRole('combobox', { name: 'EIC claimant sources checked after the last edit', exact: true });
      await expect(primaryHome).toHaveValue(''); await expect(spouseHome).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Add your dependency filing-exception records', exact: true })).toHaveCount(0);
      await primaryHome.selectOption('true'); await spouseHome.selectOption('false'); await expect(confirmation).toHaveValue('');
      await page.getByRole('combobox', { name: "Your spouse's main-home answer counts military duty outside the United States", exact: true }).selectOption('false');
      await page.getByRole('combobox', { name: 'Your main-home answer counts military duty outside the United States', exact: true }).selectOption('true');
      await confirmation.selectOption('true'); await expect(hero).toHaveText('Enter more info for an estimate');
      await page.getByRole('textbox', { name: 'Your military-duty source reference', exact: true }).fill('synthetic-private-duty-home');
      const order = page.getByRole('combobox', { name: 'Your active-duty order was for more than 90 days or indefinite', exact: true });
      await expect(order).toHaveValue(''); await order.selectOption('true'); await confirmation.selectOption('true');
      await expect(hero).toHaveText('$3,409');
      await page.reload(); await open(); await expect(spouseHome).toHaveValue('false'); await expect(confirmation).toHaveValue('true');
      await spouseHome.selectOption(''); await expect(confirmation).toHaveValue('');
      await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`) ?? '{}').sectionData?.['personal-info']?.eicClaimantEligibility?.spouseChildless?.mainHomeInUnitedStatesMoreThanHalfYear, id)).toBeNull();
      await page.reload(); await open(); await expect(spouseHome).toHaveValue(''); await expect(order).toHaveValue('true');
      await spouseHome.selectOption('true'); await confirmation.selectOption('true'); await expect(hero).toHaveText('$3,409');
      await order.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`childful-home-controls-${viewport.width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const secrets = ['synthetic-private-childful-home', 'synthetic-private-duty-home', personal.ssn, personal.spouse.ssn];
      for (const secret of secrets) expect(requests.some(request => request.body.includes(secret))).toBe(false);

      async function download(home: boolean) {
        await page.locator('.guided-progress-steps').getByRole('button', { name: 'Final Review', exact: true }).click();
        await page.getByRole('button', { name: 'Open Full Return', exact: true }).click();
        const bundle = page.getByRole('region', { name: 'Return Bundle', exact: true });
        await expect(bundle).toContainText('Filing exports are not yet qualified');
        const downloading = page.waitForEvent('download');
        const response = page.waitForResponse(response => response.url().endsWith('/api/workspace/filled-return'));
        await bundle.getByRole('button', { name: 'Download Review PDF', exact: true }).click();
        expect((await response).status()).toBe(200);
        const file = await downloading; const output = testInfo.outputPath(`childful-home-${String(home)}-${viewport.width}.pdf`);
        await file.saveAs(output);
        const reopened = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
          // Review downloads are flattened. Reopen their printed marks at the official field rectangles.
          `import json,sys
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);template=PdfReader(sys.argv[2])
assert r.get_fields() is None

def checked(page, original_page, field):
    rect=next(a.get_object()['/Rect'] for a in template.pages[original_page]['/Annots'] if a.get_object().get('/T')==field)
    marks=[]
    def visit(text,cm,tm,font,size):
        if '✔' in text and abs(cm[4]-float(rect[0]))<0.01 and abs(cm[5]-float(rect[1]))<0.01:
            marks.append(text)
    page.extract_text(visitor_text=visit)
    return len(marks)==1
assert 'Form 1040 (2025)' in r.pages[1].extract_text()
assert 'Form 1040 (2025)' in r.pages[2].extract_text()
print(json.dumps({'home':checked(r.pages[1],0,'c1_5[0]'),'noEic':checked(r.pages[2],1,'c2_13[0]'),'text':' '.join(p.extract_text() or '' for p in r.pages)}))`, output, resolve('../../forms/blank/2025/f1040.pdf')],
        { encoding: 'utf8', timeout: 30_000 }));
        expect(reopened.home).toBe(home); expect(reopened.noEic).toBe(false);
        expect(reopened.text).toContain('3409'); expect(reopened.text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
        for (const secret of [...secrets, '111223333', '222334444', '333445555']) expect(reopened.text).not.toContain(secret);
      }
      await download(true);
      await page.getByRole('button', { name: 'Start guided interview', exact: true }).click();
      await page.locator('.guided-progress-steps').getByRole('button', { name: 'About You', exact: true }).click();
      await open(); await spouseHome.selectOption('false'); await confirmation.selectOption('true'); await expect(hero).toHaveText('$3,409');
      await page.reload(); await open(); await expect(spouseHome).toHaveValue('false'); await expect(confirmation).toHaveValue('true');
      await download(false);
      const origin = new URL(page.url()).origin;
      for (const request of requests.filter(request => secrets.some(secret => request.body.includes(secret)))) {
        expect(new URL(request.url).origin).toBe(origin); expect(new URL(request.url).pathname).toBe('/api/workspace/filled-return');
      }
      await page.screenshot({ path: testInfo.outputPath(`childful-home-reviewed-${viewport.width}.png`) });
    });
  });
}
