// Spec: spec/federal/cod-principal-residence-sources.yaml.
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculateFederalTax, parseInput } from '@/index.js';
import { calculateCodPrincipalResidenceReduction } from '@/engine/forms/cod-principal-residence.js';
import { principalResidenceCodInput as fixture } from '../../fixtures/cod-principal-residence.js';
import { partialPersonalLargeNolInput } from '../../fixtures/cod-partial-personal.js';

/** Deliberately invalid untrusted JSON mutations, not a production input cast. */
function changed(path: string[], value: unknown = undefined, year = 2025): unknown {
  const raw: unknown = fixture(year);
  let parent = raw as Record<string, unknown>;
  for (const key of path.slice(0,-1)) parent = parent[key] as Record<string,unknown>;
  if (value === undefined) delete parent[path[path.length-1]];
  else parent[path[path.length-1]] = value;
  return raw;
}
const factsPath = (key: string) => ['form982PrincipalResidenceSources',key];
it('derives the nonqualified-first retained-home exclusion from actual sources', () => {
  const raw = fixture(), before = JSON.stringify(raw), parsed = parseInput(raw);
  const parsedBefore = JSON.stringify(parsed), result = calculateFederalTax(parsed);
  expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe('50000');
  expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe('250000');
  expect(result.form982?.totalReduction.toFixed()).toBe('50000');
  expect(result.codNolReduction).toBeUndefined();
  expect(JSON.stringify(raw)).toBe(before);
  expect(JSON.stringify(parsed)).toBe(parsedBefore);
});
it('binds actual2026 discharge to a pre2026 written arrangement', () => {
  expect(calculateCodPrincipalResidenceReduction(parseInput(fixture(2026)))?.excluded.toFixed()).toBe('50000');
  expect(() => calculateFederalTax(parseInput(fixture(2026)))).toThrow(/rule pack.*incomplete/);
  const mutations: Array<[string[],unknown?]> = [[factsPath('arrangement')],
    [[...factsPath('arrangement'),'enteredDate'],'2026-01-01'],
    [[...factsPath('arrangement'),'evidencedInWritingDate'],'2026-01-01'],
    [[...factsPath('arrangement'),'sourceFactsConfirmed'],false],
    [[...factsPath('arrangement'),'dischargeSubjectToArrangementConfirmed'],false],
    [[...factsPath('arrangement'),'evidencedInWritingDate'],'2025-02-30']];
  for (const [path,value] of mutations) expect(() => calculateCodPrincipalResidenceReduction(parseInput(changed(path,value,2026)))).toThrow();
});
it('rejects missing or contradictory retained-home source facts', () => {
  const edits: Array<[string[],unknown?]> = [];
  for (const key of ['sourceReference','sourceTaxYear','sourceFactsConfirmed','allDischargesIncluded','allResidenceSecuredLoansIncluded',
    'regularAndAlternativeExclusionSameConfirmed','communityPropertyApplies','title11Case','electInsolvencyInstead','otherExclusionsOrExceptionsApply',
    'solelyPrimaryOwnedConfirmed','retainedResidenceConfirmed','noPropertyTransferConfirmed','neverBusinessOrRentalUseConfirmed','debt','acquisition','reason','basis']) edits.push([factsPath(key)]);
  const groups = fixture().form982PrincipalResidenceSources;
  for (const group of ['debt','acquisition','reason','basis'] as const) {
    for (const key of Object.keys(groups[group])) edits.push([[...factsPath(group),key]]);
  }
  edits.push([[...factsPath('debt'),'amountDischarged'],'99999'], [[...factsPath('debt'),'actualDischargedPrincipal'],'99999'],
    [[...factsPath('debt'),'actualDischargedInterest'],'1'], [[...factsPath('debt'),'debtorSsnLast4'],'0002'],
    [[...factsPath('debt'),'sourceTaxYear'],2026], [[...factsPath('debt'),'dischargeDate'],'2025-02-30'],
    [[...factsPath('acquisition'),'residenceAddress','zip'],'19102'], [[...factsPath('acquisition'),'originalLoanNotRefinancedConfirmed'],false],
    [[...factsPath('acquisition'),'originalAcquisitionPrincipal'],'700000'], [[...factsPath('acquisition'),'originalAcquisitionPrincipal'],'1000000'],
    [[...factsPath('acquisition'),'originationDate'],'2025-10-01'], [[...factsPath('reason'),'reason'],'other'],
    [factsPath('title11Case'),true], [factsPath('communityPropertyApplies'),true],
    [['taxpayer','primary','ssn'],'0001'], [['taxpayer','primary','ssn'],'1234567890001'],
    [['taxpayer','filingStatus'],'married_filing_jointly'], [['form1099C'],[...fixture().form1099C,...fixture().form1099C]],
    [['codExclusion'],{qualifiedPrincipalResidence:{dischargedAmount:'100000'}}]);
  for (const [path,value] of edits) expect(() => calculateFederalTax(parseInput(changed(path,value))), path.join('.')).toThrow();
});
it('preserves source precision at debt caps and the residence basis floor', () => {
  for (const [loan,canceled,basis,filingStatus,excluded] of [
    ['750000','100000','300000','single','100000'], ['750000.01','100000','300000','single','99999.99'],
    ['800000','50000','300000','single','0'], ['800000','50000.01','300000','single','0.01'],
    ['400000','100000','300000','married_filing_separately','75000'], ['100000','100000','0','single','100000'],
  ]) {
    const x = fixture(); x.taxpayer.filingStatus = filingStatus;
    x.form982PrincipalResidenceSources.acquisition.outstandingPrincipal = loan;
    x.form1099C[0].amountDischarged = canceled; x.form982PrincipalResidenceSources.debt.amountDischarged = canceled;
    x.form982PrincipalResidenceSources.debt.actualDischargedPrincipal = canceled;
    Object.assign(x.form982PrincipalResidenceSources.basis,{purchaseCost:'1000000',acquisitionCosts:'0',capitalImprovements:'0',previousBasisReductions:new Decimal('1000000').minus(basis).toFixed()});
    const result = calculateFederalTax(parseInput(x));
    expect(result.schedule1?.cancelledDebtIncome.toFixed()).toBe(new Decimal(canceled).minus(excluded).toFixed());
    if (excluded !== '0') expect(result.form982?.reducedAttributes.basisOfPrincipalResidence.toFixed()).toBe(Decimal.max(0,new Decimal(basis).minus(excluded)).toFixed());
  }
});
it('preserves independently calculated carries under the basis-only method', () => {
  const prior = partialPersonalLargeNolInput(), home = fixture();
  const x = {...home,taxpayer:prior.taxpayer,netOperatingLoss:prior.netOperatingLoss,
    priorYear:{capitalLossCarryforward:'6000',shortTermCapitalLoss:'-6000'}};
  x.form982PrincipalResidenceSources.acquisition.residenceAddress = {...prior.taxpayer.address};
  x.form982PrincipalResidenceSources.debt.debtorName = `${prior.taxpayer.primary.firstName} ${prior.taxpayer.primary.lastName}`;
  x.form982PrincipalResidenceSources.debt.debtorSsnLast4 = prior.taxpayer.primary.ssn.replace(/-/g,'').slice(-4);
  const result = calculateFederalTax(parseInput(x));
  const ordinary = {...fixture(),form982PrincipalResidenceSources:undefined,taxpayer:x.taxpayer,netOperatingLoss:x.netOperatingLoss,
    form1099C:[{...home.form1099C[0],amountDischarged:'50000'}],priorYear:x.priorYear};
  const control = calculateFederalTax(parseInput(ordinary));
  expect(result.carryforwards.capitalLoss.toFixed()).toBe('-3000');
  expect(result.carryforwards.nolCarryforward.gt(0)).toBe(true);
  expect(result.carryforwards.capitalLoss.toFixed()).toBe(control.carryforwards.capitalLoss.toFixed());
  expect(result.carryforwards.nolCarryforward.toFixed()).toBe(control.carryforwards.nolCarryforward.toFixed());
  expect(result.form982?.reducedAttributes.nolCarryforward.toFixed()).toBe(result.carryforwards.nolCarryforward.toFixed());
});
