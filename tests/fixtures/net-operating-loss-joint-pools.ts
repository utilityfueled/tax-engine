import { actualNolInput } from './net-operating-loss';
import { recurrentNolSourceFixture } from './net-operating-loss-filing-unit';

/** Fictional filed sources. No current deduction, absorption or owner closing share. */
export function jointNolSourceFixture(taxYear = 2025) {
  const original = actualNolInput('100000', { priorYear: {} });
  original.w2s[0]!.accountHolder = 'primary';
  const taxpayer = { ...original.taxpayer, taxYear, filingStatus: 'married_filing_jointly' as const,
    spouse: { ...original.taxpayer.primary, firstName: 'Alex', lastName: 'Rowe', ssn: '987-65-4321' } };
  const persons = [{ sourceId: 'jane', name: 'Jane Doe', taxpayerIdLast4: '6789', deathStatus: 'alive_through_return_year' as const },
    { sourceId: 'alex', name: 'Alex Rowe', taxpayerIdLast4: '4321', deathStatus: 'alive_through_return_year' as const }];
  const returns = Array.from({ length: taxYear - 2020 }, (_, i) => 2021 + i).flatMap(year => year === 2021 || year === 2023
    ? ['jane', 'alex'].map(person => ({ sourceId: `${person}${year}`, taxYear: year, filingStatus: 'married_filing_separately' as const,
      primaryPersonId: person, sourceReference: `Filed separate ${person} ${year}` }))
    : [{ sourceId: `joint${year}`, taxYear: year, filingStatus: 'married_filing_jointly' as const,
      primaryPersonId: 'jane', spousePersonId: 'alex', sourceReference: `Filed joint ${year}` }]);
  const timeline = { sourceReference: 'Filed same-couple returns', sourceFactsConfirmed: true, allRelevantReturnsIncluded: true,
    allRelevantCarryoversIncluded: true, currentReturnSourceId: `joint${taxYear}`, persons, returns };
  const sameCoupleJointHistory = { sourceReference: 'Actual same-couple marital-year records', sourceFactsConfirmed: true,
    allRelevantYearsIncluded: true, years: Array.from({ length: taxYear - 2020 }, (_, i) => ({ taxYear: 2021 + i,
      firstPersonId: 'jane', secondPersonId: 'alex', marriedToEachOther: true, sourceReference: `Actual married filing status ${2021 + i}` })) };
  const row = (person: string, amount: string, used: string, sourceId = `${person}-loss2021`) => ({
    ...original.netOperatingLoss!.vintages![0]!, sourceId, originalLoss: amount,
    openingCarryforward: person === 'jane' ? '50000' : '35000', adjustedThroughTaxYear: taxYear - 1,
    filingUnitOrigin: { ownerPersonId: person, returnSourceId: `${person}2021`, originalReturnLoss: amount,
      separateComputations: [{ personId: person, netOperatingLoss: amount, sourceReference: `Filed original ${person}` }] },
    history: Array.from({ length: taxYear - 2022 }, (_, i) => {
      const year = 2022 + i, value = year === 2022 ? used : '0';
      return { taxYear: year, nolUsed: value, attributeReduction: '0', sourceReference: `Filed ${person} carry ${year}`,
        filingUnitUses: [{ returnSourceId: year === 2023 ? `${person}${year}` : `joint${year}`,
          sourceReference: `Filed ${person} use ${year}`, sourceFactsConfirmed: true, allOriginOwnersIncluded: true, allOtherNolSourcesIncluded: true,
          claimedDeduction: value, modifiedAbsorption: value, attributeReduction: '0',
          owners: [{ personId: person, claimedDeduction: value, modifiedAbsorption: value, attributeReduction: '0' }] }] };
    }),
  });
  const vintages = [row('jane', '60000', '10000'), row('alex', '40000', '5000')];
  const amt = row('alex', '20000', '0', 'amt-alex-loss2021'); amt.openingCarryforward = '20000';
  return { ...original, taxpayer, netOperatingLoss: { ...original.netOperatingLoss!, sourceTaxYear: taxYear,
    returnMembership: 'changed_membership' as const, membershipUnchangedConfirmed: false,
    spouseName: 'Alex Rowe', spouseTaxpayerIdLast4: '4321', filingUnitHistory: timeline, sameCoupleJointHistory, vintages,
    alternativeTax: { ...original.netOperatingLoss!.alternativeTax!, filingUnitHistory: structuredClone(timeline),
      sameCoupleJointHistory: structuredClone(sameCoupleJointHistory), vintages: [amt] } } };
}

export function recurrentJointNolSourceFixture() {
  const input = jointNolSourceFixture(), previous = recurrentNolSourceFixture();
  const timeline = structuredClone(previous.netOperatingLoss.filingUnitHistory);
  timeline.persons = timeline.persons.filter(row => row.sourceId !== 'riley');
  timeline.returns = timeline.returns.map(row => row.sourceId === 'jane-riley2024'
    ? { sourceId: 'jane2024', taxYear: 2024, filingStatus: 'married_filing_separately', primaryPersonId: 'jane', sourceReference: 'Filed Jane2024' }
    : row.sourceId === 'jane2025' ? { ...row, filingStatus: 'married_filing_jointly', spousePersonId: 'alex' }
      : row.filingStatus === 'single' ? { ...row, filingStatus: 'married_filing_separately' } : row) as typeof timeline.returns;
  const jane = { ...structuredClone(previous.netOperatingLoss.vintages[0]!), sourceId: 'jane-joint2021',
    filingUnitOrigin: { ...structuredClone(previous.netOperatingLoss.vintages[0]!.filingUnitOrigin), ownerPersonId: 'jane' } };
  jane.history[2]!.filingUnitUses[0]!.returnSourceId = 'jane2024';
  const alex = { ...structuredClone(jane), sourceId: 'alex-joint2021', originalLoss: '40000', openingCarryforward: '25000',
    filingUnitOrigin: { ...structuredClone(jane.filingUnitOrigin), ownerPersonId: 'alex' } };
  alex.history[0]!.nolUsed = '10000'; alex.history[1]!.nolUsed = '3000'; alex.history[2]!.nolUsed = '2000';
  return { ...input, netOperatingLoss: { ...input.netOperatingLoss, filingUnitHistory: timeline, vintages: [jane, alex],
    alternativeTax: { ...input.netOperatingLoss.alternativeTax, filingUnitHistory: structuredClone(timeline), vintages: [] } } };
}
