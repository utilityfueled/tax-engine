// Spec: charitable-determined-nol.yaml actual-workspace.
import { execFileSync } from '../../helpers/file-stdin-exec';
import {expect,it,vi} from 'vitest';
import {buildWorkspaceFilledReturnDownload} from '@/lib/workspace-filled-return';
import {createWorkspaceRecord} from '@/lib/workspace-storage';
import {REVIEW_PDF_NOTICE} from '@/pdf/export-policy';
import {determinedCharitableNolInterview} from '../../fixtures/guided-charitable-determined-nol';
vi.mock('server-only',()=>({}));
it('exports determined original charity from actual guided sources',async()=>{
  const state=determinedCharitableNolInterview(),before=structuredClone(state),workspace=createWorkspaceRecord('synthetic-determined-charity');
  workspace.returnSummary.targetTaxYear=2025;
  const result=await buildWorkspaceFilledReturnDownload(workspace,state);
  const pages=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',
    "import sys,json,io;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    {input:result.contents,encoding:'utf8'})) as string[];
  pages.forEach(page=>expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2));
  const text=pages.join(' ').replace(/\s+/g,' ');
  expect(text).toContain('Determined regular charitable origins');expect(text).toContain('remaining 32880');
  expect(text).toContain('Current AMT charity adjustment 10600');
  for(const value of ['111-22-3333','111223333','synthetic-regular-2024','Synthetic independent AMT charitable worksheet'])expect(text).not.toContain(value);
  expect(state).toEqual(before);
});
