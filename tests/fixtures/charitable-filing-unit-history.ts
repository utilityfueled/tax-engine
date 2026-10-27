import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { charitableFilingUnitSources } from './charitable-filing-unit-sources.js';

/** Fictional filed histories; published allocation amounts, modern source years. */
export function charitableFilingUnitFixture(): TaxYearInput {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, donations: [], deductionElection: 'itemized' });
  input.charitableCarryoverSources = charitableFilingUnitSources();
  return input;
}

/** One original joint vintage, later allocated shares, then a renewed joint pool. */
export function recurrentCharitableFilingUnitFixture(jointUse = '3000'): TaxYearInput {
  const input = charitableFilingUnitFixture(), sources = input.charitableCarryoverSources!;
  const timeline = sources.filingUnitHistory!, vintage = sources.vintages![0];
  vintage.contributionYear = 2020; vintage.filingUnitOrigin!.returnSourceId = 'joint-2020';
  const unit = (sourceId: string, taxYear: number, primaryPersonId: string, spousePersonId?: string) => ({
    sourceId, taxYear, primaryPersonId, spousePersonId, filingStatus: spousePersonId ? 'married_filing_jointly' as const : 'single' as const,
    sourceReference: `Synthetic filed ${sourceId}`,
  });
  timeline.returns = [unit('joint-2020', 2020, 'jane', 'alex'), unit('joint-2021', 2021, 'jane', 'alex'),
    unit('jane-2022', 2022, 'jane'), unit('alex-2022', 2022, 'alex'), unit('joint-2023', 2023, 'jane', 'alex'),
    unit('joint-2024', 2024, 'jane', 'alex'), unit('jane-2025', 2025, 'jane')];
  const use = (returnSourceId: string, treatedAsPaid: string) => ({ returnSourceId, treatedAsPaid, nolReduction: '0', sourceReference: `Synthetic ${returnSourceId} use` });
  vintage.history = [
    { taxYear: 2021, treatedAsPaid: '10000', nolReduction: '0', sourceReference: 'Synthetic joint use', filingUnitUses: [use('joint-2021', '10000')] },
    { taxYear: 2022, treatedAsPaid: '3000', nolReduction: '0', sourceReference: 'Synthetic separate use', filingUnitUses: [use('jane-2022', '2000'), use('alex-2022', '1000')] },
    { taxYear: 2023, treatedAsPaid: jointUse, nolReduction: '0', sourceReference: 'Synthetic renewed joint use', filingUnitUses: [use('joint-2023', jointUse)] },
    { taxYear: 2024, treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic joint zero', filingUnitUses: [use('joint-2024', '0')] },
  ];
  vintage.openingCarryforward = undefined;
  return input;
}

export function remarriedCharitableFilingUnitFixture(): TaxYearInput {
  const input = charitableFilingUnitFixture(), sources = input.charitableCarryoverSources!, timeline = sources.filingUnitHistory!;
  input.taxpayer.filingStatus = 'married_filing_jointly';
  input.taxpayer.spouse = { firstName: 'Casey', lastName: 'New', ssn: '234-56-7890', dateOfBirth: '1979-01-01' };
  sources.spouseName = 'Casey New'; sources.spouseTaxpayerIdLast4 = '7890';
  timeline.persons!.push({ sourceId: 'casey', name: 'Casey New', taxpayerIdLast4: '7890', deathStatus: 'alive_through_return_year' });
  timeline.returns!.at(-1)!.filingStatus = 'married_filing_jointly'; timeline.returns!.at(-1)!.spousePersonId = 'casey';
  for (const taxYear of [2022, 2023, 2024]) timeline.returns!.push({ sourceId: `casey-${taxYear}`, taxYear, filingStatus: 'single', primaryPersonId: 'casey', sourceReference: `Synthetic Casey ${taxYear}` });
  const other = structuredClone(sources.vintages![0]);
  other.sourceId = 'casey-property'; other.originalExcess = '2000'; other.openingCarryforward = '2000';
  other.filingUnitOrigin = { returnSourceId: 'casey-2022' };
  other.history = [2023, 2024].map(taxYear => ({ taxYear, treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic zero use',
    filingUnitUses: [{ returnSourceId: `casey-${taxYear}`, treatedAsPaid: '0', nolReduction: '0', sourceReference: 'Synthetic actual zero' }] }));
  sources.vintages!.push(other);
  return input;
}

/** Two actual separately owned originals, later one joint pool and another split. */
export function separateOriginalPoolFixture(use = '0'): TaxYearInput {
  const input = remarriedCharitableFilingUnitFixture(), sources = input.charitableCarryoverSources!, timeline = sources.filingUnitHistory!;
  // The first source was a separate original; no original joint ratio is involved.
  timeline.returns = timeline.returns!.filter(row => !row.sourceId!.startsWith('joint-') && row.sourceId !== 'casey-2024');
  for (const year of [2022, 2023]) timeline.returns!.push({ sourceId: `jane-${year}`, taxYear: year, filingStatus: 'single', primaryPersonId: 'jane', sourceReference: 'Synthetic separate return' });
  timeline.returns!.push({ sourceId: 'new-joint-2024', taxYear: 2024, filingStatus: 'married_filing_jointly', primaryPersonId: 'jane', spousePersonId: 'casey', sourceReference: 'Synthetic later joint return' });
  input.taxpayer.filingStatus = 'single'; input.taxpayer.spouse = undefined;
  sources.spouseName = undefined; sources.spouseTaxpayerIdLast4 = undefined;
  timeline.returns!.find(row => row.sourceId === 'jane-2025')!.filingStatus = 'single';
  timeline.returns!.find(row => row.sourceId === 'jane-2025')!.spousePersonId = undefined;
  sources.vintages!.forEach((row, index) => {
    row.filingUnitOrigin = { returnSourceId: index === 0 ? 'jane-2022' : 'casey-2022' };
    row.originalExcess = index === 0 ? '6000' : '2000'; row.openingCarryforward = undefined;
    row.history = [2023, 2024].map(taxYear => ({ taxYear, treatedAsPaid: taxYear === 2024 && index === 0 ? use : '0', nolReduction: '0', sourceReference: 'Synthetic complete history',
      filingUnitUses: [{ returnSourceId: taxYear === 2024 ? 'new-joint-2024' : `${index === 0 ? 'jane' : 'casey'}-2023`,
        treatedAsPaid: taxYear === 2024 && index === 0 ? use : '0', nolReduction: '0', sourceReference: 'Synthetic actual unit use' }] }));
  });
  return input;
}
