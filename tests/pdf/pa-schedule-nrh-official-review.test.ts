/** Spec: state/pa-schedule-nrh-official-review.yaml */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { assertPdfExportAllowed } from '@/pdf/export-policy';
import { fillReturn } from '@/pdf/fill-return';
import { PA_40_FIELDS } from '@/pdf/mappings/2025/fill-pa-40';
import { preparePAOrdinaryReturnReview } from '@/pdf/pa-ordinary-return-review-context';
import { assertReviewTemplateBytes } from '@/pdf/template-registry';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { paOrdinaryEmployeeReturnFixture, paFullYearWorkingDaysReviewFixture as fullCalendarFixture } from '../fixtures/pa-ordinary-employee-sources';
import { execFileSync } from '../helpers/file-stdin-exec';

async function packet<T>(f: ReturnType<typeof fullCalendarFixture>, check: (dir: string, names: string[]) => Promise<T>, redacted = true) {
  Object.assign(f.input, { paOrdinaryReturnFacts: f.facts, paOrdinaryReturnCompletionSources: f.sources });
  const ordinary = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
  expect(ordinary.readiness.filingEligible).toBe(false);
  const result = calculateFederalTax(f.input);
  result.stateReturns = { pennsylvania: ordinary };
  const token = preparePAOrdinaryReturnReview(f.input);
  const outputDir = await mkdtemp(join(tmpdir(), 'pa-nrh-review-'));
  try {
    const filled = await fillReturn(redacted ? redactReviewIdentifiers(f.input) : f.input, result, {
      blankFormsDir: join(process.cwd(), 'forms/blank/2025'), outputDir, paOrdinaryReview: token,
    });
    return await check(outputDir, filled.filledForms.map(name => basename(name)));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

it('renders actual signed day categories and PA-40 transfers on the physical 2025 NRH review', async () => {
  const f = fullCalendarFixture();
  await packet(f, async (output, names) => {
    expect(names).toContain('pa-schedule-nrh-filled.pdf');
    expect(names).not.toContain('pa-schedule-nrh-reference.pdf');
    expect(names).not.toContain('pa-schedule-ue-reference.pdf');
    const pa40 = await PDFDocument.load(await readFile(join(output, 'pa-40-filled.pdf')));
    for (const field of [PA_40_FIELDS.line1a, PA_40_FIELDS.line1c]) {
      expect(pa40.getForm().getTextField(field).getText()).toBe('30000');
    }
    const bytes = await readFile(join(output, 'pa-schedule-nrh-filled.pdf'));
    if (process.env.PA_NRH_REVIEW_ARTIFACT) await writeFile(process.env.PA_NRH_REVIEW_ARTIFACT, bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getForm().getFields()).toHaveLength(0);
    const source = await readFile('forms/blank/2025/pa-schedule-nrh.pdf');
    const inspection = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', String.raw`
import io,json,re,sys
from pypdf import PdfReader
r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True)
rows={}
def visitor(text, cm, tm, font, size):
    value=text.strip()
    if size == 10 and re.fullmatch(r'\d+', value):
        rows.setdefault(str(round(tm[5])), []).append(value)
page=r.pages[0]
content=page.extract_text(visitor_text=visitor)
print(json.dumps([content, rows, len(page.get('/Annots', [])), '/AcroForm' in r.root_object]))
`], { input: bytes, encoding: 'utf8' });
    const [content, rows, annotations, interactive] = JSON.parse(inspection) as [string, Record<string, string[]>, number, boolean];
    expect(createHash('sha256').update(source).digest('hex')).toBe('39254e3bd00841ff8c64445fea3ce869860993ca01f15b71ef1df10aede8e323');
    expect(assertReviewTemplateBytes('pa-schedule-nrh.pdf', source, 2025).revisionQualification).toMatch(/review-only/);
    expect(rows).toEqual({
      '708': ['25'], '552': ['365'], '531': ['105'], '519': ['4'], '507': ['6'],
      '494': ['115'], '481': ['250'], '470': ['100'], '458': [...'0400000'],
      '345': ['75000'], '333': [...'0400000'], '310': ['30000'],
      '156': ['30000'], '132': ['30000'], '108': ['30000'],
    });
    expect(annotations).toBe(0);
    expect(interactive).toBe(false);
    expect(content.match(/FOR REVIEW ONLY - NOT FOR FILING/g)).toHaveLength(1);
    for (const secret of [f.input.taxpayer.primary.ssn, f.input.w2s[0].employer.ein, f.input.w2s[0].employer.name, 'Fictional Payroll Officer', 'Fictional signed original day']) {
      expect(content).not.toContain(secret);
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
    }
  });
});

it.each(['short calendar with expenses', 'unsupported nonworking category', 'correct PA Box 16'] as const)('keeps the prior NRH reference for %s', async kind => {
  const f = kind === 'short calendar with expenses' ? paOrdinaryEmployeeReturnFixture() : fullCalendarFixture(kind);
  await packet(f, async (_output, names) => {
    expect(names).toContain('pa-schedule-nrh-reference.pdf');
    expect(names).not.toContain('pa-schedule-nrh-filled.pdf');
  });
});

it('uses the prior reference when the same eligible original input is not redacted', async () => {
  await packet(fullCalendarFixture(), async (_output, names) => {
    expect(names).toContain('pa-schedule-nrh-reference.pdf');
    expect(names).not.toContain('pa-schedule-nrh-filled.pdf');
  }, false);
});

it('keeps the 2026 review and 2025 filing export holds', () => {
  expect(() => assertPdfExportAllowed(2026, 2026, 'review')).toThrow(/No qualified review PDF mapping/);
  expect(() => assertPdfExportAllowed(2025, 2025, 'filing')).toThrow(/Filing exports are unavailable/);
});
