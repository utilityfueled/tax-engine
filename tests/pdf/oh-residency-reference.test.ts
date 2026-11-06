/** Spec: spec/state/oh-return.yaml#actual-nrc-reference-replay-before-io */
import { it, expect } from 'vitest';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { simpleW2Fixture } from '../fixtures/simple-w2.js';
import { ohioResidencyFacts } from '../fixtures/oh-residency.js';
function packet() { const original = structuredClone(simpleW2Fixture); original.w2s = [{ ...original.w2s![0]!, accountHolder: 'primary', taxYear: 2025, wages: '100000', socialSecurityWages: '100000', medicareWages: '100000', federalWithheld: '0', state: 'OH', stateWages: '20000', stateTaxWithheld: '0', localTaxWithheld: '0' }]; const facts = { ...ohioResidencyFacts(), originalFederalSources: structuredClone(original) }; Object.assign(facts.owners[0]!.amounts.wages, { federalAmount: '100000', nonresidentOhioAmount: '20000' }); return { ...original, ohioResidency: facts }; }
it('saves actual nonresident reference worksheet with original-bound redaction', async () => { const input = packet(), result = calculateFederalTax(input), context = prepareOhioResidencyReview(input); const dir = await mkdtemp(join(tmpdir(), 'ohio-nrc-actual-')); try {
    const rendered = await fillOhioReferenceForms(redactReviewIdentifiers(input), result, dir, {}, context);
    const file = rendered.filledForms.find(p => p.endsWith('/oh-it-nrc-reference.pdf'));
    expect(file).toBeDefined();
    const text = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `from pypdf import PdfReader\nimport sys\nr=PdfReader(sys.argv[1],strict=True)\nassert not r.get_fields()\nfor p in r.pages:\n assert all(a.get_object().get('/Subtype')!='/Widget' for a in p.get('/Annots',[]))\nprint('\\n'.join(p.extract_text() or '' for p in r.pages))`, file!], { encoding: 'utf8' });
    expect(text).toContain('REFERENCE SUMMARY ONLY');
    expect(text).toContain('1858');
    expect(text).toContain('0.8');
    expect(text).not.toContain(input.taxpayer.primary.ssn);
    expect(text).not.toContain('Synthetic actual Ohio NRC original worksheet');
    expect((await readFile(file!)).length).toBeGreaterThan(1000);
}
finally {
    await rm(dir, { recursive: true, force: true });
} });
it.each(['forgedContext', 'staleFederal', 'changedSource'])('rejects source conflicts before creating output %s', async (kind) => { const input = packet(), result = calculateFederalTax(input), context = prepareOhioResidencyReview(input); const dir = await mkdtemp(join(tmpdir(), 'ohio-nrc-pre-io-')); const output = join(dir, 'never-created'); if (kind === 'staleFederal')
    result.agi = result.agi.plus(1); if (kind === 'changedSource')
    input.w2s![0]!.employer.name = 'Changed same-dollar original'; try {
    await expect(fillOhioReferenceForms(redactReviewIdentifiers(input), result, output, {}, kind === 'forgedContext' ? {} as typeof context : context)).rejects.toThrow();
    await expect(access(output)).rejects.toThrow();
}
finally {
    await rm(dir, { recursive: true, force: true });
} });
