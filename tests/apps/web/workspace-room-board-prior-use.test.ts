// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml saved-workspace-review.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildWorkspaceFilledReturnDownload } from '@/lib/workspace-filled-return';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { actualGuidedRoomBoardPriorUse } from '../../fixtures/guided-room-board-prior-use';
import { requiredPeriodSource as required } from '../../fixtures/guided-room-board-periods';
vi.mock('server-only', () => ({}));
function workspace() { const record = createWorkspaceRecord('fictional-prior-period-review'); record.returnSummary.targetTaxYear = 2025; record.returnSummary.taxYearState = 'single'; return record; }
it('replays actual historical room and board sources before workspace redaction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-room-prior-'));
  try {
    for (const medium of ['cash', 'in_kind_prepaid_tuition']) {
      const { state } = actualGuidedRoomBoardPriorUse();
      const source = required(state.sectionData.credits?.educationDistributions);
      required(source.forms?.[0]).fields.distributionMedium = medium;
      if (medium === 'cash') source.inKindBenefits = [];
      const before = JSON.stringify(state), download = await buildWorkspaceFilledReturnDownload(workspace(), state);
      expect(download.includedForms).toContain('f1099q-reference-filled.pdf');
      expect(download.includedForms.filter(path => path.includes('f5329'))).toEqual(['f5329-primary-filled.pdf']);
      const path = join(directory, `${medium}.pdf`); await writeFile(path, download.contents);
      const pages: string[] = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
        'import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))', path], { encoding: 'utf8', timeout: 30000 }));
      const text = pages.join(' ').replace(/\s+/g, ' ');
      for (const value of ['Prior qualified cost before assistance: $5000', 'Prior adjusted qualified expenses: $4000', 'Remaining period limit: $1000',
        'Primary taxpayer, Form 5329 line 5: Education distributions included in recipient income: $1800',
        'Primary taxpayer, Form 5329 line 8: Additional tax on education distributions: $180']) expect(text).toContain(value);
      for (const page of pages) expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);
      for (const secret of ['123456789', '123-45-6789', 'fictional-institution', 'Fictional filed prior period worksheet', 'Fictional actual prior room receipt', 'prepaid-account']) expect(text).not.toContain(secret);
      expect(JSON.stringify(state)).toBe(before);
      const unknown = structuredClone(state);
      required(required(unknown.sectionData.credits?.educationDistributions).roomBoardPriorUses?.[0]).sourceFactsConfirmed = null;
      await expect(buildWorkspaceFilledReturnDownload(workspace(), unknown)).rejects.toThrow(/complete|source|history|prior|confirm/i);
      const nextYear = structuredClone(state); nextYear.taxYear = 2026;
      await expect(buildWorkspaceFilledReturnDownload(workspace(), nextYear)).rejects.toThrow(/year|2026|source/i);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
