// Spec: spec/federal/form-1099-q-distinct-in-kind-assistance.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { buildForm1099QReferenceSummary } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_5329_FIELDS as F } from '@/pdf/fill-form-5329.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { distinctInKindFixture } from '../fixtures/education-distinct-in-kind.js';

it('binds all distinct original tuition sources before producing the review packet', async () => {
  const original = distinctInKindFixture(2025), result = calculateFederalTax(original), token = prepareEducationReview(original);
  const input = redactReviewIdentifiers(original), rendered = redactReviewIdentifiers(result);
  const directory = await mkdtemp(join(tmpdir(),'distinct-tuition-review-'));
  try {
    const summary = buildForm1099QReferenceSummary(input.form1099Q,rendered.form1099Q!,input.qualifiedEducationExpenses,token);
    expect(summary.statementCount).toBe(2);
    expect(summary.sourceLines.filter(row => row.line.includes(':in-kind-assistance:')).map(row => row.value)).toEqual(['1000','1500']);
    for (const mutation of ['balanced-second-source','remove-statement','remove-second-benefit','missing-second-audit']) {
      const changed = structuredClone(input), facts = changed.qualifiedEducationExpenses!.sourceFacts!;
      if (mutation === 'balanced-second-source') { facts.expenses![1]!.amount='6001';facts.expenses![1]!.taxFreeAssistance='1501'; }
      if (mutation === 'remove-statement') changed.form1099Q.pop();
      if (mutation === 'remove-second-benefit') facts.inKindBenefits!.pop();
      const changedResult = mutation === 'missing-second-audit' ? {...rendered,form1099Q:{...rendered.form1099Q!,lines:rendered.form1099Q!.lines.filter(row => row.line!=='second-prepaid:in-kind-assistance:second-tuition')}} : rendered;
      await expect(fillReturn(changed,changedResult,{blankFormsDir:join(directory,'absent'),outputDir:directory,educationReview:token})).rejects.toThrow(/stale|conflict|audit|reconcile/);
    }
    expect(await readdir(directory)).toEqual([]);
    await fillReturn(input,rendered,{blankFormsDir:'forms/blank/2025',outputDir:directory,educationReview:token});
    const checked = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3',['-c',
      'import json,sys;from pathlib import Path;from pypdf import PdfReader\np=Path(sys.argv[1]);r=PdfReader(p/"f5329-primary-filled.pdf");f=r.get_fields();print(json.dumps({"income":f[sys.argv[2]].get("/V"),"tax":f[sys.argv[3]].get("/V"),"ssn":f[sys.argv[4]].get("/V"),"pages":[page.extract_text() or "" for q in sorted(p.glob("*.pdf")) for page in PdfReader(q).pages]}))',
      directory,F.line5,F.line8,F.ssn],{encoding:'utf8',timeout:10000})) as {income:string;tax:string;ssn?:string;pages:string[]};
    expect(checked.income).toBe('425');expect(checked.tax).toBe('43');expect(checked.ssn ?? '').toBe('');
    for(const page of checked.pages) { expect(page).toContain(REVIEW_PDF_NOTICE);for(const secret of [original.taxpayer.primary.ssn,'prepaid-account','second-actual-account']) expect(page).not.toContain(secret); }
    expect(checked.pages.join(' ')).toContain('Tax-free assistance: $1500');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
