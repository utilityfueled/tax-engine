import { actualNolInput } from './net-operating-loss';

/** Fictional filed originals. Values are historical sources, never current allowances. */
export function changedNolSourceFixture() {
  const original = actualNolInput('50000', { priorYear: {} });
  const persons = [
    { sourceId: 'jane', name: 'Jane Doe', taxpayerIdLast4: '6789', deathStatus: 'alive_through_return_year' as const },
    { sourceId: 'alex', name: 'Alex Rowe', taxpayerIdLast4: '4321', deathStatus: 'alive_through_return_year' as const },
    { sourceId: 'riley', name: 'Riley Stone', taxpayerIdLast4: '9988', deathStatus: 'alive_through_return_year' as const },
  ];
  const unit = (sourceId: string, taxYear: number, primaryPersonId: string, spousePersonId?: string) => ({ sourceId, taxYear,
    filingStatus: spousePersonId ? 'married_filing_jointly' as const : 'single' as const,
    primaryPersonId, ...(spousePersonId ? { spousePersonId } : {}), sourceReference: `Actual filed ${sourceId}` });
  const timeline = {
    sourceReference: 'Actual complete filed membership records', sourceFactsConfirmed: true,
    allRelevantReturnsIncluded: true, allRelevantCarryoversIncluded: true, currentReturnSourceId: 'jane2025', persons,
    returns: [unit('joint2021', 2021, 'jane', 'alex'), unit('jane2022', 2022, 'jane'), unit('alex2022', 2022, 'alex'),
      unit('joint2023', 2023, 'alex', 'jane'), unit('jane-riley2024', 2024, 'jane', 'riley'), unit('alex2024', 2024, 'alex'),
      unit('jane2025', 2025, 'jane')],
  };
  const owner = (personId: string, claimedDeduction: string, modifiedAbsorption = claimedDeduction, attributeReduction = '0') => ({ personId, claimedDeduction, modifiedAbsorption, attributeReduction });
  const use = (returnSourceId: string, owners: ReturnType<typeof owner>[], claimedDeduction = '0', modifiedAbsorption = claimedDeduction, attributeReduction = '0') => ({
    returnSourceId, sourceReference: `Actual owner allocation ${returnSourceId}`, sourceFactsConfirmed: true,
    allOriginOwnersIncluded: true, allOtherNolSourcesIncluded: true,
    claimedDeduction, modifiedAbsorption, attributeReduction, owners,
  });
  const history = [
    { taxYear: 2022, nolUsed: '0', attributeReduction: '0', sourceReference: 'Filed owner carry 2022',
      filingUnitUses: [use('jane2022', [owner('jane', '0')]), use('alex2022', [owner('alex', '0')])] },
    { taxYear: 2023, nolUsed: '0', attributeReduction: '0', sourceReference: 'Filed owner carry 2023',
      filingUnitUses: [use('joint2023', [owner('alex', '0'), owner('jane', '0')])] },
    { taxYear: 2024, nolUsed: '0', attributeReduction: '0', sourceReference: 'Filed owner carry 2024',
      filingUnitUses: [use('jane-riley2024', [owner('jane', '0')]), use('alex2024', [owner('alex', '0')])] },
  ];
  const vintage = { ...original.netOperatingLoss!.vintages![0]!, originalLoss: '1875', openingCarryforward: '1875', history,
    filingUnitOrigin: { returnSourceId: 'joint2021', originalReturnLoss: '5000', separateComputations: [
      { personId: 'jane', netOperatingLoss: '1800', sourceReference: 'Filed original Jane separate NOL' },
      { personId: 'alex', netOperatingLoss: '3000', sourceReference: 'Filed original Alex separate NOL' },
    ] } };
  const facts = { ...original.netOperatingLoss!, returnMembership: 'changed_membership' as const,
    membershipUnchangedConfirmed: false, filingUnitHistory: timeline, vintages: [vintage],
    alternativeTax: { ...original.netOperatingLoss!.alternativeTax!, vintages: [], filingUnitHistory: structuredClone(timeline) } };
  return { ...original, netOperatingLoss: facts };
}

export function recurrentNolSourceFixture() {
  const input = changedNolSourceFixture();
  const row = input.netOperatingLoss.vintages[0]!;
  row.originalLoss = '60000'; row.openingCarryforward = '48000';
  row.filingUnitOrigin.originalReturnLoss = '100000';
  row.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = '60000';
  row.filingUnitOrigin.separateComputations[1]!.netOperatingLoss = '40000';
  const first = row.history[0]!;
  first.nolUsed = '5000';
  for (const [use, amount] of [[first.filingUnitUses[0]!, '5000'], [first.filingUnitUses[1]!, '10000']] as const) {
    use.claimedDeduction = amount; use.modifiedAbsorption = amount;
    use.owners[0]!.claimedDeduction = amount; use.owners[0]!.modifiedAbsorption = amount;
  }
  const second = row.history[1]!; second.nolUsed = '7000';
  const joint = second.filingUnitUses[0]!; joint.claimedDeduction = '10000'; joint.modifiedAbsorption = '10000';
  joint.owners[0]!.claimedDeduction = '3000'; joint.owners[0]!.modifiedAbsorption = '3000';
  joint.owners[1]!.claimedDeduction = '7000'; joint.owners[1]!.modifiedAbsorption = '7000';
  const former = row.history[2]!.filingUnitUses[1]!;
  former.claimedDeduction = '2000'; former.modifiedAbsorption = '2000';
  former.owners[0]!.claimedDeduction = '2000'; former.owners[0]!.modifiedAbsorption = '2000';
  return input;
}

export function changedNolReturnFixture() {
  const input = recurrentNolSourceFixture();
  const amt = changedNolSourceFixture().netOperatingLoss.vintages[0]!;
  amt.originalLoss = '20000'; amt.openingCarryforward = '20000';
  amt.filingUnitOrigin.originalReturnLoss = '50000';
  amt.filingUnitOrigin.separateComputations[0]!.netOperatingLoss = '20000';
  amt.filingUnitOrigin.separateComputations[1]!.netOperatingLoss = '30000';
  return { ...input, netOperatingLoss: { ...input.netOperatingLoss,
    alternativeTax: { ...input.netOperatingLoss.alternativeTax, vintages: [amt] } } };
}
