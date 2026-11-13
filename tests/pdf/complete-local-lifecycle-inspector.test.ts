import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Contract and retained review receipts: docs/upgrade-2026-lifecycle-inspector-work.md.
const source = ts.createSourceFile('complete-local-lifecycle.spec.ts', readFileSync(
  new URL('../../apps/web/tests/complete-local-lifecycle.spec.ts', import.meta.url), 'utf8',
), ts.ScriptTarget.Latest, true);
const inspectors: string[] = [];
function findInspector(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'execFileSync') {
    const args = node.arguments[1];
    if (args && ts.isArrayLiteralExpression(args)) {
      const [mode, script] = args.elements;
      if (mode && ts.isStringLiteral(mode) && mode.text === '-c' && script &&
          ts.isNoSubstitutionTemplateLiteral(script) && script.text.includes('from pypdf import PdfReader')) {
        inspectors.push(script.text);
      }
    }
  }
  ts.forEachChild(node, findInspector);
}
findInspector(source);

const replay = String.raw`
from contextlib import redirect_stdout
from io import StringIO
import json,sys,types

inspector,cases=json.load(sys.stdin)
code=compile(inspector,'<lifecycle inspector>','exec')
notice='FOR REVIEW ONLY - NOT FOR FILING'
heading='Form 1040\nFiling Status'
primary=[('f1_47','52000'),('f1_75','52000')]
companion=[('f2_01','52000'),('f2_02','15750'),('f2_06','36250'),('f2_08','4115'),
 ('f2_16','4115'),('f2_17','5000'),('f2_20','5000'),('f2_29','5000'),('f2_30','885'),('f2_31','885')]

class Annotation:
 def __init__(self,value): self.value=value
 def get_object(self): return self.value

def cells(fields, offset):
 return [(name,value,offset+index*12,45+index*8) for index,(name,value) in enumerate(fields)]

class Page:
 def __init__(self,text,rows=()):
  self.text=text+'\n'+notice
  self.rows=list(rows)
  self.annotations=[Annotation({'/Subtype':'/Link'})]
  self.visits=[]
 def get(self,key,default):
  assert key=='/Annots' and default==[]
  return self.annotations
 def extract_text(self,visitor_text=None):
  self.visits.append(visitor_text is not None)
  if visitor_text is not None:
   for _,value,x,y in self.rows:
    visitor_text(' '+value+'\n',[1,0,0,1,x+0.01,y-0.01],None,None,10)
    visitor_text(' ',[1,0,0,1,x,y],None,None,10)
  return self.text

def run(case):
 first,second=cells(primary,100),cells(companion,260)
 lead=Page(heading,first)
 follow=Page('Companion',second)
 tail=Page('Attachments')
 cover=Page('Form 1040', [(first[0][0],'decoy',first[0][2],first[0][3])])
 pages=[lead,follow]
 if case=='cover and tail': pages=[cover,Page('Filing Status'),lead,follow,tail]
 if case=='two eligible headings': pages=[lead,follow,Page(heading),tail]
 if case=='first eligible heading controls': pages=[Page(heading),Page('Companion'),lead,follow]
 if case=='companion must follow immediately': pages=[lead,Page('Attachments'),follow]
 if case=='missing heading': pages=[cover,Page('Filing Status'),follow]
 if case=='missing companion': pages=[cover,lead]
 if case=='wrong first-page amount': lead.rows[0]=(first[0][0],'51999',first[0][2],first[0][3])
 if case=='duplicate companion amount': follow.rows.append(second[0])
 if case=='wrong coordinate': follow.rows[0]=(second[0][0],second[0][1],second[0][2]+0.02,second[0][3])
 if case.startswith('missing printed cell '):
  field=case.split()[-1]
  for page in (lead,follow): page.rows=[row for row in page.rows if row[0]!=field]
 if case=='missing notice on tail': tail.text='Attachments'
 if case=='widget on tail': tail.annotations.append(Annotation({'/Subtype':'/Widget'}))
 if case=='unresolved annotation on tail': tail.annotations.append(Annotation(None))
 if case=='formatted SSN on tail': tail.text+='\n900-70-0311'
 if case=='compact SSN on tail': tail.text+='\n900700311'
 if case.endswith(' on tail'): pages.append(tail)
 blank_pages=[{'/Annots':[Annotation({'/T':name+'[0]','/Rect':[x,y,x+4,y+5]})
  for name,_,x,y in rows]} for rows in (first,second)]
 if case=='missing blank coordinate': blank_pages[1]['/Annots'].pop()

 def reader(filename,*,strict):
  assert strict is True
  if filename=='official-blank': return types.SimpleNamespace(pages=blank_pages)
  assert filename=='review-output'
  return types.SimpleNamespace(pages=pages,get_fields=lambda: {'unexpected':{}} if case=='interactive fields' else None)

 sys.modules['pypdf']=types.SimpleNamespace(PdfReader=reader)
 sys.argv=['-c','review-output','official-blank']
 output=StringIO()
 try:
  with redirect_stdout(output): exec(code,{})
 except (AssertionError,IndexError,StopIteration):
  assert not output.getvalue()
  return {'receipt':None}
 return {'receipt':json.loads(output.getvalue()),'visits':[p.visits for p in pages]}

print(json.dumps({case:run(case) for case in cases}))
`;

function inspect(cases: readonly string[]) {
  expect(inspectors).toHaveLength(1);
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-I', '-B', '-c', replay], {
    encoding: 'utf8', input: JSON.stringify([inspectors[0], cases]), timeout: 10_000,
  })) as Record<string, { receipt: unknown; visits?: boolean[][] }>;
}

const layouts = [
  ['plain pair', [[true], [true]]],
  ['cover and tail', [[true], [true], [true], [true], [false]]],
  ['two eligible headings', [[true], [true], [false], [false]]],
] as const;

describe('local lifecycle PDF inspector', () => {
  it.each(layouts)('extracts each page once and verifies the first Form 1040 pair in %s', (layout, visits) => {
    const result = inspect([layout])[layout];
    expect(result.receipt).toEqual({
      pages: visits.length, physicalCells: 12, reviewNotices: visits.length, fields: 0,
      widgets: 0, unresolvedAnnotations: 0, privateSsnPresent: false,
    });
    expect(result.visits).toEqual(visits);
  });

  it('rejects every missing, misplaced, interactive or private output control', () => {
    const cases = [
      'first eligible heading controls', 'companion must follow immediately', 'missing heading',
      'missing companion', 'wrong first-page amount', 'duplicate companion amount', 'wrong coordinate',
      'missing blank coordinate', 'missing notice on tail', 'interactive fields', 'widget on tail',
      'unresolved annotation on tail', 'formatted SSN on tail', 'compact SSN on tail',
      ...['f1_47', 'f1_75', 'f2_01', 'f2_02', 'f2_06', 'f2_08', 'f2_16', 'f2_17', 'f2_20', 'f2_29', 'f2_30', 'f2_31']
        .map(field => `missing printed cell ${field}`),
    ];
    const results = inspect(cases);
    for (const label of cases) expect(results[label].receipt, label).toBeNull();
  });
});
