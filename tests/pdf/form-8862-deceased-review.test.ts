// Spec: spec/federal/form-8862-deceased-claimant.yaml. Fictional actual sources.
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8862, FORM_8862_FIELDS as F } from '@/pdf/fill-form-8862.js';
import { prepareEicReview } from '@/pdf/eic-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { deceasedForm8862Input } from '../fixtures/form-8862-deceased.js';
import { known } from '../fixtures/form-8862.js';

it('reopens separate deceased and survivor day fields with their original period records', async () => {
  const input = deceasedForm8862Input(), result = calculateFederalTax(input), context = prepareEicReview(input), rendering = redactReviewIdentifiers(input);
  const before = JSON.stringify(input), doc = await fillForm8862(rendering, redactReviewIdentifiers(result), 'forms/blank/2025/f8862.pdf', context);
  const dir = await mkdtemp(join(tmpdir(), 'deceased-claimant-review-'));
  try {
    const path = join(dir, '8862.pdf'); await writeFile(path, await doc.save());
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);fields=r.get_fields();widgets=[]
for page in r.pages:
 for ref in page.get('/Annots',[]):
  a=ref.get_object();n=a if '/T' in a else a.get('/Parent',{}).get_object()
  if n.get('/T') in ('f2_01[0]','f2_02[0]','f2_03[0]','f2_04[0]'):widgets.append(bool(a.get('/AP',{}).get('/N')))
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in fields.items()},'appearances':widgets}))`, path], { encoding: 'utf8', timeout: 30_000 }));
    expect(checked.fields[F.line9a]).toBe('91'); expect(checked.fields[F.line9b]).toBe('183');
    expect(checked.fields[F.line10a]).toBe('40'); expect(checked.fields[F.line10b]).toBe('40');
    expect(checked.appearances).toEqual([true, true, true, true]); expect(checked.pages).toHaveLength(4);
    expect(checked.pages[3]).toContain('2025-01-01 through 2025-06-30; 181 days');
    expect(checked.pages[3]).toContain('2025-01-01 through 2025-12-31; 365 days');
    for (const page of checked.pages) expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');
    for (const secret of [input.taxpayer.primary.ssn, known(input.taxpayer.spouse).ssn, 'Fictional confidential final-year marriage record']) expect(checked.pages.join('\n')).not.toContain(secret);
    for (const edit of [(next: typeof rendering) => { known(next.standardDeductionFacts).primaryDeathDate = '2025-07-01'; },
      (next: typeof rendering) => { known(next.eic?.recertificationSources?.jointReturnAfterDeath).survivingSpouseRemarriedBeforeOwnYearEnd = true; },
      (next: typeof rendering) => { known(next.eic?.recertificationSources?.filers?.[1]).applicableYearEnd = '2025-06-30'; }]) {
      const changed = structuredClone(rendering); edit(changed);
      await expect(fillForm8862(changed, result, '/missing-template.pdf', context)).rejects.toThrow(/stale|conflict/i);
    }
    const forged = calculateFederalTax(input); known(forged.scheduleEIC?.form8862?.physical.claimantRows?.[0]).applicableYearDays = 365;
    await expect(fillForm8862(rendering, forged, '/missing-template.pdf', context)).rejects.toThrow(/retained calculation/i);
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
