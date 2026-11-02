import type { NolNewMarriageCurrentSources } from '@/models/net-operating-loss-filing-unit';
import { jointNolSourceFixture } from './net-operating-loss-joint-pools';
/** Fictional actual sources, written before candidate output. No allowance inputs. */
export function newMarriageNolSourceFixture(primaryWages = '40000', spouseWages = '60000', regularOpening = '10000', amtOpening = '20000', taxYear = 2025) {
  const old = jointNolSourceFixture(taxYear);
  const timeline = structuredClone(old.netOperatingLoss.filingUnitHistory);
  timeline.returns = timeline.returns.flatMap(row => row.taxYear === taxYear ? [{ ...row, sourceId: `joint${taxYear}`, filingStatus: 'married_filing_jointly' as const, primaryPersonId: 'jane', spousePersonId: 'alex' }]
    : ['jane', 'alex'].map(person => ({ sourceId: `${person}${row.taxYear}`, taxYear: row.taxYear, filingStatus: 'single' as never, primaryPersonId: person, sourceReference: `Actual single return ${person} ${row.taxYear}` }))).filter((row, i, rows) => rows.findIndex(other => other.sourceId === row.sourceId) === i);
  const marriage = { ...old.netOperatingLoss.sameCoupleJointHistory, years: old.netOperatingLoss.sameCoupleJointHistory.years.map(row => ({ ...row, marriedToEachOther: row.taxYear === taxYear })) };
  const vintage = (amount: string, sourceId: string) => ({ ...structuredClone(old.netOperatingLoss.vintages[0]!), sourceId, originalLoss: amount, openingCarryforward: amount,
    filingUnitOrigin: { ownerPersonId: 'jane', returnSourceId: 'jane2021', originalReturnLoss: amount, separateComputations: [{ personId: 'jane', netOperatingLoss: amount, sourceReference: 'Actual original individual loss' }] },
    history: Array.from({ length: taxYear - 2022 }, (_, i) => ({ taxYear: 2022 + i, nolUsed: '0', attributeReduction: '0', sourceReference: `Actual filed carry ${2022 + i}`,
      filingUnitUses: [{ returnSourceId: `jane${2022 + i}`, sourceReference: 'Actual owner filed use', sourceFactsConfirmed: true, allOriginOwnersIncluded: true, allOtherNolSourcesIncluded: true, claimedDeduction: '0', modifiedAbsorption: '0', attributeReduction: '0', owners: [{ personId: 'jane', claimedDeduction: '0', modifiedAbsorption: '0', attributeReduction: '0' }] }] })) });
  return { ...old, taxpayer: { ...old.taxpayer, address: { ...old.taxpayer.address, state: 'PA', city: 'Pittsburgh', zip: '15201' } }, standardDeductionFacts: { primaryBlind: false, spouseBlind: false, primaryCanBeClaimedAsDependent: false, spouseCanBeClaimedAsDependent: false, primaryDeathDate: null, spouseDeathDate: null, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false }, w2s: [{ ...old.w2s[0]!, wages: primaryWages, accountHolder: 'primary' as const }, { ...old.w2s[0]!, wages: spouseWages, accountHolder: 'spouse' as const, employer: { ...old.w2s[0]!.employer, name: 'Actual spouse employer', ein: '98-7654321' } }],
    netOperatingLoss: { ...old.netOperatingLoss, sameCoupleJointHistory: undefined, filingUnitHistory: timeline, newMarriageHistory: marriage,
      currentOwnerSources: { sourceReference: 'Actual complete current owner income and expense records', sourceFactsConfirmed: true, allIncomeAndDeductionsIncluded: true,
        communityPropertyApplies: false, livedWithSpouseAtAnyTimeDuringYear: true, primaryDeductionElection: 'standard' as const, spouseDeductionElection: 'standard' as const, expenseAllocations: [] as NonNullable<NolNewMarriageCurrentSources['expenseAllocations']>, sourceOwners: [] as NonNullable<NolNewMarriageCurrentSources['sourceOwners']> },
      vintages: regularOpening === '0' ? [] : [vintage(regularOpening, 'premarital-regular2021')],
      alternativeTax: { ...old.netOperatingLoss.alternativeTax, filingUnitHistory: structuredClone(timeline), sameCoupleJointHistory: undefined, newMarriageHistory: structuredClone(marriage),
        vintages: amtOpening === '0' ? [] : [vintage(amtOpening, 'premarital-amt2021')] } } };
}

export function newMarriagePre2018SourceFixture() {
  const input = newMarriageNolSourceFixture('40000', '60000', '30000', '10000');
  for (const ledger of [input.netOperatingLoss, input.netOperatingLoss.alternativeTax]) {
    const original = ledger.vintages[0]!;
    original.sourceId = original.sourceId.replace('2021', '2017');
    original.lossTaxYear = 2017; original.carrybackTreatment = 'waived'; original.carrybackSourceReference = 'Actual filed2017 carryback waiver';
    original.filingUnitOrigin.returnSourceId = 'jane2017';
    original.history = Array.from({ length: 7 }, (_, i) => ({ ...structuredClone(original.history[0]!), taxYear: 2018 + i,
      filingUnitUses: [{ ...structuredClone(original.history[0]!.filingUnitUses[0]!), returnSourceId: `jane${2018 + i}` }] }));
    ledger.newMarriageHistory.years = Array.from({ length: 9 }, (_, i) => ({ ...structuredClone(ledger.newMarriageHistory.years[0]!), taxYear: 2017 + i, marriedToEachOther: i === 8 }));
    const timeline = ledger.filingUnitHistory;
    timeline.returns = [...Array.from({ length: 8 }, (_, i) => ['jane', 'alex'].map(person => ({ sourceId: `${person}${2017 + i}`, taxYear: 2017 + i,
      filingStatus: 'single' as never, primaryPersonId: person, sourceReference: 'Actual historical individual return' }))).flat(), timeline.returns.find(row => row.taxYear === 2025)!];
  }
  return input;
}
