/** Independent source-first: spec/state/oh-official-ordinary-physical-independent.yaml. */
import { expect, it } from 'vitest';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateOhioResidentReturnFromFederal } from '@/engine/state/oh-engine.js';
import { prepareOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { fillOhioReferenceForms } from '@/pdf/mappings/2025/fill-oh-reference-forms.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { ohioOrdinaryOfficialReviewFixture } from '../fixtures/oh-ordinary-official-review.js';

const physicalExpected: Record<string, Array<{ page: number; field: string; rect: number[]; value: string }>> = {
  "oh-it-1040-review.pdf": [
    {
      "page": 1,
      "field": "L1",
      "rect": [
        488.486,
        263.036,
        570.864,
        276.357
      ],
      "value": "100000"
    },
    {
      "page": 1,
      "field": "L3",
      "rect": [
        488.486,
        190.243,
        570.864,
        203.564
      ],
      "value": "100000"
    },
    {
      "page": 1,
      "field": "L4",
      "rect": [
        488.486,
        166.419,
        570.864,
        179.74
      ],
      "value": "1900"
    },
    {
      "page": 1,
      "field": "L4_EXEMPT",
      "rect": [
        325.176,
        151.882,
        351.783,
        167.804
      ],
      "value": "1"
    },
    {
      "page": 1,
      "field": "L5",
      "rect": [
        488.486,
        142.45,
        570.864,
        155.771
      ],
      "value": "98100"
    },
    {
      "page": 1,
      "field": "L7",
      "rect": [
        488.486,
        93.863,
        570.864,
        107.184
      ],
      "value": "98100"
    },
    {
      "page": 1,
      "field": "SD_NUM",
      "rect": [
        489.344,
        656.833,
        521.821,
        670.154
      ],
      "value": "9999"
    },
    {
      "page": 1,
      "field": "PRIM_NON_RES_STATE",
      "rect": [
        264.818,
        406.659,
        281.875,
        419.4
      ],
      "value": "VA"
    },
    {
      "page": 2,
      "field": "L7a",
      "rect": [
        488.217,
        706.483,
        570.283,
        718.971
      ],
      "value": "98100"
    },
    {
      "page": 2,
      "field": "L8A",
      "rect": [
        488.217,
        683.43,
        570.283,
        695.918
      ],
      "value": "2323"
    },
    {
      "page": 2,
      "field": "L8C",
      "rect": [
        488.217,
        635.109,
        570.283,
        647.597
      ],
      "value": "2323"
    },
    {
      "page": 2,
      "field": "L9",
      "rect": [
        488.217,
        611.313,
        570.283,
        623.801
      ],
      "value": "1858"
    },
    {
      "page": 2,
      "field": "L10",
      "rect": [
        488.217,
        586.268,
        570.283,
        598.756
      ],
      "value": "465"
    },
    {
      "page": 2,
      "field": "L13",
      "rect": [
        488.217,
        515.205,
        570.283,
        527.693
      ],
      "value": "465"
    },
    {
      "page": 2,
      "field": "L14",
      "rect": [
        488.217,
        491.587,
        570.283,
        504.075
      ],
      "value": "1000"
    },
    {
      "page": 2,
      "field": "L17",
      "rect": [
        488.217,
        418.394,
        570.283,
        430.882
      ],
      "value": "1000"
    },
    {
      "page": 2,
      "field": "L19",
      "rect": [
        488.217,
        372.461,
        570.283,
        384.949
      ],
      "value": "1000"
    },
    {
      "page": 2,
      "field": "L23",
      "rect": [
        488.217,
        275.625,
        570.283,
        288.113
      ],
      "value": "535"
    },
    {
      "page": 2,
      "field": "L26",
      "rect": [
        488.217,
        154.387,
        570.283,
        166.875
      ],
      "value": "535"
    },
    {
      "page": 2,
      "field": "L18",
      "rect": [
        488.217,
        395.523,
        570.283,
        408.011
      ],
      "value": ""
    },
    {
      "page": 2,
      "field": "L20",
      "rect": [
        488.217,
        347.976,
        570.283,
        360.464
      ],
      "value": ""
    },
    {
      "page": 2,
      "field": "L21",
      "rect": [
        488.217,
        324.025,
        570.283,
        336.513
      ],
      "value": ""
    },
    {
      "page": 2,
      "field": "L22",
      "rect": [
        488.217,
        299.894,
        570.283,
        312.382
      ],
      "value": ""
    }
  ],
  "oh-it-nrc-review.pdf": [
    {
      "page": 1,
      "field": "1a",
      "rect": [
        372.997,
        494.236,
        463.777,
        507.7
      ],
      "value": "100000"
    },
    {
      "page": 1,
      "field": "1b",
      "rect": [
        487.394,
        495.712,
        578.174,
        509.176
      ],
      "value": "20000"
    },
    {
      "page": 1,
      "field": "9b",
      "rect": [
        487.394,
        358.592,
        578.174,
        372.057
      ],
      "value": "20000"
    },
    {
      "page": 1,
      "field": "16b",
      "rect": [
        487.394,
        204.714,
        578.174,
        218.179
      ],
      "value": "100000"
    },
    {
      "page": 1,
      "field": "17b",
      "rect": [
        487.394,
        180.411,
        578.174,
        193.876
      ],
      "value": "20000"
    },
    {
      "page": 1,
      "field": "18b",
      "rect": [
        487.394,
        155.33,
        578.174,
        168.795
      ],
      "value": "80000"
    },
    {
      "page": 1,
      "field": "19",
      "rect": [
        487.407,
        128.869,
        578.187,
        142.334
      ],
      "value": ".8000"
    },
    {
      "page": 1,
      "field": "20",
      "rect": [
        487.407,
        103.788,
        578.187,
        117.253
      ],
      "value": "1858"
    }
  ],
  "oh-schedule-credits-review.pdf": [
    {
      "page": 1,
      "field": "SchedC_L1",
      "rect": [
        502.159,
        644.628,
        578.336,
        658.024
      ],
      "value": "2323"
    },
    {
      "page": 1,
      "field": "SchedC_L11",
      "rect": [
        502.159,
        404.317,
        578.336,
        417.713
      ],
      "value": "2323"
    },
    {
      "page": 2,
      "field": "SchedC_L37",
      "rect": [
        497.675,
        405.706,
        577.577,
        418.551
      ],
      "value": "2323"
    },
    {
      "page": 2,
      "field": "SchedC_L38",
      "rect": [
        497.675,
        371.629,
        577.577,
        384.801
      ],
      "value": "1858"
    },
    {
      "page": 2,
      "field": "SchedC_L40",
      "rect": [
        497.675,
        323.498,
        577.577,
        337.107
      ],
      "value": "1858"
    }
  ],
  "oh-schedule-of-withholding-review.pdf": [
    {
      "page": 1,
      "field": "SchedW_A",
      "rect": [
        432.542,
        624.172,
        508.24,
        636.881
      ],
      "value": "1000"
    },
    {
      "page": 1,
      "field": "SchedW_B_L1_PS",
      "rect": [
        41.975,
        574.746,
        53.803,
        587.662
      ],
      "value": "P"
    },
    {
      "page": 1,
      "field": "SchedW_B_L1_WAGE",
      "rect": [
        228.114,
        575.353,
        297.76,
        587.353
      ],
      "value": "100000"
    },
    {
      "page": 1,
      "field": "SchedW_B_L1_FITW",
      "rect": [
        401.434,
        575.353,
        464.534,
        587.353
      ],
      "value": "10000"
    },
    {
      "page": 1,
      "field": "SchedW_B_L1_OHWAGE",
      "rect": [
        228.114,
        539.393,
        297.76,
        551.393
      ],
      "value": "20000"
    },
    {
      "page": 1,
      "field": "SchedW_B_L1_OHIT",
      "rect": [
        429.514,
        539.393,
        491.864,
        551.393
      ],
      "value": "1000"
    }
  ]
};

it('independent Ohio paper retains original source and literal tax/refund arithmetic', () => {
  const input = ohioOrdinaryOfficialReviewFixture();
  const before = JSON.stringify(input);
  const w2 = input.w2s[0];
  if (!w2?.stateLocalSources) throw new Error('Actual two-row original required');
  expect(w2.stateLocalSources.stateRows.map(row => [row.state, row.wages, row.withheld])).toEqual([
    ['VA', '100000', '0'], ['OH', '20000', '1000'],
  ]);
  expect(new Decimal(w2.wages).eq('100000')).toBe(true);
  expect(new Decimal(w2.federalWithheld).eq('10000')).toBe(true);
  const federal = calculateFederalTax(input);
  const oh = calculateOhioResidentReturnFromFederal({ taxInput: input, federalResult: federal });
  expect(federal.agi.eq('100000')).toBe(true);
  expect(oh.it1040.line4_exemptions.eq('1900')).toBe(true);
  expect(oh.it1040.line5_ohioTaxableIncome.eq('98100')).toBe(true);
  expect(oh.it1040.line8c_totalTax.eq('2323')).toBe(true);
  expect(oh.nonresidentCreditResult?.line20.eq('1858')).toBe(true);
  expect(oh.it1040.line10_taxAfterCredits.eq('465')).toBe(true);
  expect(oh.it1040.line26_refund.eq('535')).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
});

it('independent Ohio paper reopens seven privacy-preserving official pages', async () => {
  const input = ohioOrdinaryOfficialReviewFixture();
  const before = JSON.stringify(input);
  const federal = calculateFederalTax(input);
  const context = prepareOhioResidencyReview(input);
  const dir = await mkdtemp(join(tmpdir(), 'oh-paper-independent-'));
  const out = process.env.OH_PAPER_INDEPENDENT_ARTIFACT_DIR ?? dir;
  try {
    const result = await fillOhioReferenceForms(redactReviewIdentifiers(input), federal, out, {}, context);
    const files = Object.fromEntries(result.filledForms.map(p => [basename(p), p]));
    const expected = {
      'oh-it-1040-review.pdf': [2, ['100000', '1900', '98100', '2323', '1858', '465', '1000', '535', '9999']],
      'oh-it-nrc-review.pdf': [1, ['100000', '20000', '80000', '.8000', '1858']],
      'oh-schedule-credits-review.pdf': [2, ['2323', '1858']],
      'oh-schedule-of-withholding-review.pdf': [2, ['100000', '10000', '20000', '1000']],
    } as const;
    for (const [name, [pages, literals]] of Object.entries(expected)) {
      expect(files[name]).toBeDefined();
      const file = files[name];
      if (!file) throw new Error(`Missing actual official companion ${name}`);
      const checked = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', String.raw`
from pypdf import PdfReader
from pypdf.generic import IndirectObject, ContentStream
import sys,json,re
r=PdfReader(sys.argv[1],strict=True)
assert len(r.pages)==int(sys.argv[2])
assert not r.get_fields()
assert '/AcroForm' not in r.trailer['/Root']
assert '/OpenAction' not in r.trailer['/Root']
assert not r.trailer['/Root'].get('/Names',{}).get('/EmbeddedFiles')
texts=[]; objects=[]
for page in r.pages:
 assert all(a.get_object().get('/Subtype')!='/Widget' for a in page.get('/Annots',[]))
 text=page.extract_text() or ''
 assert text.count('FOR REVIEW ONLY - NOT FOR FILING')==1
 texts.append(text)
object_ids={(gen,num) for gen,entries in r.xref.items() if gen!=65535 for num in entries if num}
object_ids.update((0,num) for num in r.xref_objStm)
for gen,num in sorted(object_ids):
 obj=r.get_object(IndirectObject(num,gen,r))
 if isinstance(obj,dict):
  assert '/AA' not in obj and '/OpenAction' not in obj and '/JS' not in obj
  assert obj.get('/S')!='/JavaScript'
  assert obj.get('/Subtype')!='/Widget' and '/FT' not in obj
 objects.append(str(obj))
 if hasattr(obj,'get_data'): objects.append(repr(obj.get_data()))
raw='\n'.join(objects+texts+[str(r.metadata)])
for private in json.loads(sys.argv[3]): assert private not in raw,private
text='\n'.join(texts)
compact=re.sub(r'[ ,\n\r\t]','',text)
for amount in json.loads(sys.argv[4]): assert amount in compact,(amount,compact)
# Read the saved painted Form XObjects by exact independently retained official
# field rectangles. Logical text anywhere on a page cannot satisfy another line.
def mult(m,n):
 a,b,c,d,e,f=m; g,h,i,j,k,l=n
 return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]
def painted_cells(page):
 matrix=[1,0,0,1,0,0]; stack=[]; found=[]
 for args,op in ContentStream(page['/Contents'],r).operations:
  if op==b'q': stack.append(matrix[:])
  elif op==b'Q': matrix=stack.pop()
  elif op==b'cm': matrix=mult(matrix,[float(v) for v in args])
  elif op==b'Do':
   xo=page.get('/Resources',{}).get('/XObject',{}).get(args[0])
   if xo is None: continue
   xo=xo.get_object()
   if xo.get('/Subtype')!='/Form' or '/BBox' not in xo: continue
   m=mult(matrix,[float(v) for v in xo.get('/Matrix',[1,0,0,1,0,0])])
   a,b,c,d,e,f=m; l,bt,rt,t=[float(v) for v in xo['/BBox']]
   points=[(a*x+c*y+e,b*x+d*y+f) for x,y in [(l,bt),(l,t),(rt,bt),(rt,t)]]
   rect=[min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
   strings=[]
   for vals,operator in ContentStream(xo,r).operations:
    if operator==b'Tj':strings.append(str(vals[0]))
    elif operator==b'TJ':strings.extend(str(v) for v in vals[0] if isinstance(v,str))
   found.append((rect,''.join(strings),any(operator in [b'f',b'f*'] for vals,operator in ContentStream(xo,r).operations)))
 return found
for cell in json.loads(sys.argv[5]):
 matches=[text for rect,text,ink in painted_cells(r.pages[cell['page']-1]) if all(abs(a-b)<.02 for a,b in zip(rect,cell['rect']))]
 assert len(matches)==1,(cell,'appearance count',len(matches))
 assert matches[0].replace(',','').strip()==cell['value'],(cell,'saved physical appearance',matches[0])
# Source /Rect for Single has reversed Y ordering. Physical placement must use
# normalized printed bounds, not paint a true logical value over the heading.
if sys.argv[1].endswith('oh-it-1040-review.pdf'):
 for label,expected_rect in [('single',[330.723,406.407,338.898,419.275]),('primary nonresident',[179.555,407.416,187.73,420.284])]:
  status=[ink for rect,text,ink in painted_cells(r.pages[0]) if all(abs(a-b)<.02 for a,b in zip(rect,expected_rect))]
  assert status==[True],(label,'selected check at printed bounds',expected_rect,status)
print(json.dumps({'pages':len(r.pages),'fields':len(r.get_fields() or {}),'text':text}))
`, file, String(pages), JSON.stringify([input.taxpayer.primary.ssn, '90-7000612', '907000612', 'PRIVATE-FICTIONAL-', 'PRIVATE-OH-ORIGINAL-ID', 'PRIVATE-VA-ORIGINAL-ID']), JSON.stringify(literals), JSON.stringify(physicalExpected[name])], { encoding: 'utf8' });
      expect(JSON.parse(checked).pages).toBe(pages);
    }
    expect(JSON.stringify(input)).toBe(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it.each(['absent context', 'forged context', 'same-money employer', 'same-money recipient', 'actual state-row reference', 'stale federal AGI'] as const)(
  'independent Ohio paper denies before I/O %s', async kind => {
    const input = ohioOrdinaryOfficialReviewFixture();
    const federal = calculateFederalTax(input);
    const context = prepareOhioResidencyReview(input);
    const w2 = input.w2s[0];
    if (!w2?.stateLocalSources) throw new Error('Actual original needed');
    if (kind === 'same-money employer') w2.employer.name = 'FICTIONAL EQUAL-DOLLAR DIFFERENT EMPLOYER';
    if (kind === 'same-money recipient') input.taxpayer.primary.lastName = 'DifferentActualRecipient';
    if (kind === 'actual state-row reference') {
      const row = w2.stateLocalSources.stateRows[1];
      if (!row) throw new Error('Actual OH second row needed');
      row.sourceReference = 'Changed actual OH original reference';
    }
    if (kind === 'stale federal AGI') federal.agi = federal.agi.plus('1');
    const dir = await mkdtemp(join(tmpdir(), 'oh-paper-independent-deny-'));
    const output = join(dir, 'must-not-be-created');
    try {
      await expect(fillOhioReferenceForms(redactReviewIdentifiers(input), federal, output, {},
        kind === 'absent context' ? undefined : kind === 'forged context' ? {} as typeof context : context)).rejects.toThrow();
      await expect(access(output)).rejects.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  },
);
