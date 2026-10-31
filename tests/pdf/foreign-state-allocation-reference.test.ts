// Spec: spec/federal/foreign-tax-state-allocation.yaml.
import { execFileSync } from '../helpers/file-stdin-exec';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { FORM_1116_REFERENCE_FILENAME } from '@/pdf/fill-form-1116.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { carryFixture, stateAllocationFacts } from '../fixtures/foreign-tax-carryover.js';

function stateAllocationInput() {
  const base = carryFixture(), election = base.foreignTaxElection, facts = election?.deductionYearCarryover;
  if (!election || !facts?.incomeSources?.[0]) throw new Error('Missing actual source fixture');
  const first = facts.incomeSources[0];
  return TaxYearInputSchema.parse({ ...base, scheduleA: undefined,
    w2s: [{ ...base.w2s[0], wages: '75000', stateWages: '75000', stateTaxWithheld: '6000' }],
    donations: [{ qualifiedOrganization: true, isPrivateFoundation: false, organization: 'Synthetic public charity', type: 'cash', amount: '20000', dateOfDonation: '2025-10-15' }],
    form1099Int: [{ ...base.form1099Int[0], interestIncome: '15000' },
      { ...base.form1099Int[0], interestIncome: '10000', foreignTaxPaid: '0', foreignCountry: 'France', accountReference: 'Second private account' }],
    foreignTaxElection: { ...election, deductionYearCarryover: { ...facts,
      incomeSources: [{ ...first, reportedIncome: '15000', foreignIncome: '15000' },
        { ...first, sourceId: 'form1099Int:1', reportedIncome: '10000', foreignIncome: '10000', foreignCountry: 'France', accountReference: 'Second private account' }],
      carryovers: [{ originTaxYear: 2024, category: 'passive', amount: '4000', sourceReference: 'Actual adjusted prior balance' }],
      itemizedAllocation: { sourceFactsConfirmed: true, sourceReference: 'Actual source worksheet', noTreatyCharitableDeductionConfirmed: true,
        incomeOrSalesTaxes: '6000', homeRealPropertyTaxes: '0', personalPropertyTaxes: '0', stateAllocation:stateAllocationFacts(),stateIncomeTaxes: [
          { stateCode: 'NY', deductibleAmount: '6000', stateTaxableIncome: '70000', foreignIncomeSpecificallyExempt: false,
            sourceReference: 'Actual state source', countryIncomeConfirmed: true,
            countryIncome: [{ foreignCountry: 'Canada', stateTaxableIncome: '12000.01', sourceReference: 'Private Canadian source' },
              { foreignCountry: 'France', stateTaxableIncome: '2999.99', sourceReference: 'Private French source' }] },
        ] },
    } },
  });
}

it('rejects the former gross-only state source in the canonical return', () => {
  const input = stateAllocationInput();
  const state = input.foreignTaxElection?.deductionYearCarryover?.itemizedAllocation?.stateIncomeTaxes?.[0];
  if (!state) throw new Error('Missing state source fixture');
  state.stateTaxableIncome = '90000';
  const before = JSON.stringify(input);
  expect(() => calculateFederalTax(input)).toThrow(/state income.*source reconciliation/i);
  expect(JSON.stringify(input)).toBe(before);
});

async function checkSavedSourceRecord(input:ReturnType<typeof stateAllocationInput>) {
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  const value = (id: string) => result.foreignTaxDeductionCarryover?.lines.find(row => row.line === id)?.value.toFixed();
  // Pre-state federal80000 less foreign25000 leaves U.S.55000. Actual state70000
  // taxes15000foreign;6000*12000.01/70000=>1029 and6000*2999.99/70000=>257.
  // Published74000-74050single TaxTable11200; round4(23714/74000)=.3205.
  expect(result.agi.toFixed()).toBe('100000'); expect(result.deductionAmount.toFixed()).toBe('26600');
  expect(value('state-us-taxable-before-deduction')).toBe('55000');
  expect(value('18')).toBe('74000'); expect(value('20')).toBe('11200'); expect(value('21')).toBe('3590');
  expect(value('absorbed')).toBe('2990'); expect(value('carryforward')).toBe('1010'); expect(result.foreignTaxCredit.isZero()).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
  const directory = await mkdtemp(join(tmpdir(), 'foreign-country-review-'));
  try {
    const { filledForms } = await fillReturn(input, result, { blankFormsDir: 'forms/blank', outputDir: directory });
    const path = filledForms.find(file => file.endsWith(FORM_1116_REFERENCE_FILENAME));
    if (!path) throw new Error('Missing actual country allocation review record');
    const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c',
      "import sys,io,json; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],
    { input: await readFile(path), encoding: 'utf8' })) as string[];
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    const text = pages.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Line state-aggregate-taxable-base: Aggregate nonexempt state taxable base Value: 70000');
    expect(text).toContain('Line state-aggregate-deductible-tax: Allowed nonexempt state income-tax pool Value: 6000');
    expect(text).toContain('Value: 3590'); expect(text).toContain('Value: 2990'); expect(text).toContain('Value: 1010');
    expect(text).toContain('Line country-1:state-tax: State income tax allocated to foreign country Value: 1029');
    expect(text).toContain('Line country-2:state-tax: State income tax allocated to foreign country Value: 257');
    expect(text).toContain('No current foreign tax credit');
    for (const identity of ['Private Canadian source', 'Private French source', 'Second private account', '112233445', 'Private NY source', 'Private NJ source']) expect(text).not.toContain(identity);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

it('preserves actual country allocation in the canonical review record', async () => {
  await checkSavedSourceRecord(stateAllocationInput());
});

it('preserves multiple-state source aggregation in the saved review record', async () => {
  const input=stateAllocationInput(),allocation=input.foreignTaxElection?.deductionYearCarryover?.itemizedAllocation;
  if(!allocation?.stateIncomeTaxes?.[0])throw new Error('Missing state source fixture');
  allocation.stateIncomeTaxes=[
    {stateCode:'NY',deductibleAmount:'4000',stateTaxableIncome:'40000',foreignIncomeSpecificallyExempt:false,sourceReference:'Private NY source',countryIncomeConfirmed:true,
      countryIncome:[{foreignCountry:'Canada',stateTaxableIncome:'7000.01',sourceReference:'Private Canadian source'}, {foreignCountry:'France',stateTaxableIncome:'1999.99',sourceReference:'Private French source'}]},
    {stateCode:'NJ',deductibleAmount:'2000',stateTaxableIncome:'30000',foreignIncomeSpecificallyExempt:false,sourceReference:'Private NJ source',countryIncomeConfirmed:true,
      countryIncome:[{foreignCountry:'Canada',stateTaxableIncome:'5000',sourceReference:'Private Canadian source'}, {foreignCountry:'France',stateTaxableIncome:'1000',sourceReference:'Private French source'}]},
  ];
  const result=calculateFederalTax(input),lines=result.foreignTaxDeductionCarryover?.lines;
  expect(lines?.find(row=>row.line==='state-aggregate-taxable-base')?.value.toFixed()).toBe('70000');
  expect(lines?.find(row=>row.line==='state-aggregate-deductible-tax')?.value.toFixed()).toBe('6000');
  await checkSavedSourceRecord(input);
});
