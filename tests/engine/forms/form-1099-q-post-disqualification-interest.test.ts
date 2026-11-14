// Spec: spec/federal/form-1099-q-post-disqualification-interest.yaml.
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { calculateFederalTax } from '@/index.js';
import { educationPostDisqualificationInterestInput as source } from '../../fixtures/education-post-disqualification-interest.js';

function calculate(input = source()) {
  return calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses, {
    taxYear: input.taxpayer.taxYear, taxpayer: input.taxpayer, originalInterestStatements: input.form1099Int,
  });
}
it('admits source-proven January1 cash conversion without changing deemed earnings', () => {
  for (const year of [2025, 2026] as const) {
    const input=source(year), before=JSON.stringify(input), result=calculate(input);
    expect(result.taxableEarnings.toFixed()).toBe('300');
    expect(result.netPenalty.toFixed()).toBe('30');
    expect(result.totalEarnings.toFixed()).toBe('300');
    expect(result.coverdellAccounts).toEqual([]);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('requires actual canonical originals and reports ordinary interest exactly once', () => {
  const input=source(), before=JSON.stringify(input), result=calculateFederalTax(input);
  expect(result.totalInterest.toFixed()).toBe('100');
  expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('300');
  expect(result.agi.toFixed()).toBe('400');
  expect(result.form1099Q?.netPenalty.toFixed()).toBe('30');
  expect(JSON.stringify(input)).toBe(before);
});

const first = <T>(rows: T[]): T => { const value=rows[0]; if (!value) throw Error('Required explicit synthetic source'); return value; };
function proof(input: ReturnType<typeof source>) {
  const value=first(input.form1099Q).postDisqualificationInterestSources;
  if (!value) throw Error('Required explicit synthetic conversion packet');
  return value;
}
const raw = (value: object): Record<string, unknown> => value as Record<string, unknown>;
it('rejects incomplete changed or unsupported conversion sources', () => {
  for (const key of Object.keys(proof(source()))) {
    const input=source(); delete raw(proof(input))[key];
    expect(()=>calculate(input),`missing ${key}`).toThrow();
  }
  const cases: Array<[string,(input: ReturnType<typeof source>)=>void]> = [
    ['missing packet', input=>{first(input.form1099Q).postDisqualificationInterestSources=undefined;}],
    ['no-activity conflict', input=>{first(input.form1099Q).prohibitedTransactionNoPostDisqualificationActivityConfirmed=true;}],
    ['unknown no-activity answer', input=>{first(input.form1099Q).prohibitedTransactionNoPostDisqualificationActivityConfirmed=undefined;}],
    ['late actual event', input=>{first(input.form1099Q).prohibitedTransactionDate='2025-06-01';}],
    ['late actual conversion', input=>{proof(input).custodianConversionDate='2025-01-02';}],
    ['foreign source year', input=>{proof(input).sourceTaxYear=2026;}],
    ['stale source identity', input=>{proof(input).sourceId='different original';}],
    ['stale account', input=>{proof(input).accountId='different account';}],
    ['stale beneficiary', input=>{proof(input).beneficiaryId='different beneficiary';}],
    ['other recipient', input=>{first(input.form1099Q).recipientOwner='other';}],
    ['unknown ownership', input=>{delete raw(proof(input)).primaryBeneficiaryOwnsDepositConfirmed;}],
    ['retained trust', input=>{raw(proof(input)).noRetainedTrustConfirmed=false;}],
    ['not all cash', input=>{raw(proof(input)).cashOnlyAtJanuary1Confirmed=false;}],
    ['unknown all activity', input=>{raw(proof(input)).allPostJanuary1ActivityIncludedConfirmed=false;}],
    ['unknown source reference', input=>{proof(input).sourceReference=' ';}],
    ['wrong beneficiary taxpayer identity', input=>{const b=first(input.qualifiedEducationExpenses?.sourceFacts?.beneficiaries??[]);b.studentTaxId='222-33-4444';}],
    ['missing beneficiary identity', input=>{const b=first(input.qualifiedEducationExpenses?.sourceFacts?.beneficiaries??[]);b.studentTaxId=undefined;}],
    ['wrong original owner', input=>{first(input.form1099Int).accountHolder='spouse';}],
    ['wrong original year', input=>{first(input.form1099Int).taxYear=2026;}],
    ['changed original payer', input=>{first(input.form1099Int).payer='Changed original bank';}],
    ['missing original account', input=>{first(input.form1099Int).accountReference=undefined;}],
    ['wrong original snapshot', input=>{proof(input).originalInterestSnapshot.payerTin='98-7654321';}],
    ['missing original record', input=>{input.form1099Int=[];}],
    ['foreign original', input=>{first(input.form1099Int).foreignCountry='CA';}],
    ['unknown Box9 original', input=>{first(input.form1099Int).privateActivityBondInterest=undefined;}],
    ['nonzero Treasury interest', input=>{first(input.form1099Int).usSavingsBondInterest='1';}],
    ['nonzero other snapshot box', input=>{proof(input).originalInterestSnapshot.earlyWithdrawalPenalty='1';}],
    ['changed original interest', input=>{first(input.form1099Int).interestIncome='99';}],
    ['changed cash closing', input=>{proof(input).closingCash='1099.99';}],
    ['changed cash opening', input=>{proof(input).openingCash='999';}],
    ['zero positive-interest packet', input=>{proof(input).taxableBankInterest='0';proof(input).closingCash='1000';}],
    ['unknown source amount', input=>{proof(input).taxableBankInterest='';}],
    ['unknown extra packet property', input=>{raw(proof(input)).unreviewedInterestAdjustment='1';}],
    ['unknown extra snapshot property', input=>{raw(proof(input).originalInterestSnapshot).unreviewedAmount='1';}],
    ['education expenses', input=>{first(input.form1099Q).prohibitedTransactionQualifiedEducationExpenses='1';}],
    ['pledged account', input=>{first(input.form1099Q).prohibitedTransactionKind='pledged_portion';}],
    ['basis loss', input=>{first(input.form1099Q).prohibitedTransactionBasis='1001';}],
    ['wrong account type', input=>{first(input.form1099Q).accountType='529';}],
    ['wrong distribution code', input=>{first(input.form1099Q).distributionCode='1';}],
  ];
  for (const [label,mutate] of cases) { const input=source();mutate(input);expect(()=>calculate(input),label).toThrow(); }
  for (const field of ['otherIncome','realizedGains','realizedLosses','contributions','withdrawals','transfers','fees'] as const) {
    const input=source();proof(input)[field]='0.001';expect(()=>calculate(input),field).toThrow();
  }
  const noOriginalContext=source();
  expect(()=>calculateForm1099Q(noOriginalContext.form1099Q,noOriginalContext.qualifiedEducationExpenses,{
    taxYear:2025,taxpayer:noOriginalContext.taxpayer,
  })).toThrow(/original/);
});
it('rejects duplicate original assignment and partial original allocations', () => {
  const duplicate=source();duplicate.form1099Int.push(structuredClone(first(duplicate.form1099Int)));
  expect(()=>calculate(duplicate)).toThrow(/unique original/);
  const reused=source(), second=structuredClone(first(reused.form1099Q));
  second.sourceId='other terminated source';second.accountId='other terminated account';
  if (!second.postDisqualificationInterestSources) throw Error('Required second actual packet');
  second.postDisqualificationInterestSources.sourceId=second.sourceId;
  second.postDisqualificationInterestSources.accountId=second.accountId;
  reused.form1099Q.push(second);
  expect(()=>calculate(reused)).toThrow(/another terminated account/);
  const partial=source();first(partial.form1099Int).interestIncome='200';
  proof(partial).originalInterestSnapshot.interestIncome='200';
  expect(()=>calculate(partial)).toThrow(/original/);
});

import { calculateCoverdellPostDisqualificationInterest } from '@/engine/forms/coverdell-post-disqualification-interest.js';
it('validates exact source cash conservation before form rounding', () => {
  const input=source(), form=first(input.form1099Q), facts=proof(input), amount='0.00000000000000000001';
  form.prohibitedTransactionJanuary1Value='1000.00000000000000000001';
  facts.openingCash=form.prohibitedTransactionJanuary1Value;facts.taxableBankInterest=amount;
  facts.closingCash='1000.00000000000000000002';facts.originalInterestSnapshot.interestIncome=amount;
  first(input.form1099Int).interestIncome=amount;
  const options={taxYear:2025,taxpayer:input.taxpayer,beneficiaryTaxId:input.taxpayer.primary.ssn,
    originalInterestStatements:input.form1099Int,allDistributionStatements:input.form1099Q};
  expect(calculateCoverdellPostDisqualificationInterest(form,options).interest.toFixed()).toBe(amount);
  facts.closingCash='1000';expect(()=>calculateCoverdellPostDisqualificationInterest(form,options)).toThrow(/cash conservation/);
});

import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
it('keeps nested custodian and bank originals outside hosted and provider metadata', () => {
  const input=source(), workspace=Object.assign(createWorkspaceRecord('opaque-converted-esa',{now:'2026-11-14T00:00:00.000Z'}),
    { form1099Q:input.form1099Q,form1099Int:input.form1099Int,qualifiedEducationExpenses:input.qualifiedEducationExpenses });
  for (const payload of [sanitizeWorkspaceForHostedStorage(workspace),buildProviderWorkspaceRequest(workspace,{now:'2026-11-14T00:00:00.000Z'})])
    for (const marker of [proof(input).sourceReference,proof(input).custodianConversionReference,
      first(input.form1099Int).accountReference,first(input.form1099Int).payerTin,input.taxpayer.primary.ssn,'postDisqualificationInterestSources'])
      if (marker) expect(JSON.stringify(payload)).not.toContain(marker);
});

it('preserves two independently sourced cash accounts without merging their originals', () => {
  const input=source(), second=structuredClone(first(input.form1099Q)), secondOriginal=structuredClone(first(input.form1099Int));
  second.sourceId='second terminated cash account';second.accountId='second actual ESA account';
  const secondProof=second.postDisqualificationInterestSources;
  if (!secondProof) throw Error('Required separate actual account packet');
  secondProof.sourceId=second.sourceId;secondProof.accountId=second.accountId;secondProof.originalIntIndex=1;
  secondProof.taxableBankInterest='200';secondProof.closingCash='1200';
  secondOriginal.accountReference='Second actual converted deposit';secondOriginal.interestIncome='200';
  secondProof.originalInterestSnapshot={...secondProof.originalInterestSnapshot,accountReference:secondOriginal.accountReference,interestIncome:'200'};
  input.form1099Q.push(second);input.form1099Int.push(secondOriginal);
  const result=calculateFederalTax(input);
  expect(result.totalInterest.toFixed()).toBe('300');expect(result.form1099Q?.taxableEarnings.toFixed()).toBe('600');
  expect(result.agi.toFixed()).toBe('900');expect(result.form1099Q?.netPenalty.toFixed()).toBe('60');
});
it('retains known-zero no-activity history without using the new positive-interest method', () => {
  const input=source(), form=first(input.form1099Q);
  form.postDisqualificationInterestSources=undefined;form.prohibitedTransactionNoPostDisqualificationActivityConfirmed=true;
  form.prohibitedTransactionPostDisqualificationSourceReference='Actual complete zero subsequent income and flows';
  input.form1099Int=[];
  expect(calculate(input).taxableEarnings.toFixed()).toBe('300');expect(calculate(input).netPenalty.toFixed()).toBe('30');
  form.prohibitedTransactionNoPostDisqualificationActivityConfirmed=undefined;
  expect(()=>calculate(input)).toThrow(/subsequent income/);
});

it('describes actual later bank interest accurately in both distribution audit trails', () => {
  const input=source(), result=calculate(input);
  const sourceAudit=result.lines.find(line=>line.form==='Form1099-Q'&&line.line==='terminated-esa:taxable-earnings');
  const deemedAudit=result.lines.find(line=>line.form==='Coverdell disqualification'&&line.line==='terminated-esa:taxable-earnings');
  for (const line of [sourceAudit,deemedAudit]) {
    expect(line?.formula).toContain('original bank interest reported separately on ScheduleB');
    expect(line?.formula).not.toMatch(/no (?:later|subsequent) income\/gain\/loss/);
  }
  const legacy=source();first(legacy.form1099Q).postDisqualificationInterestSources=undefined;
  first(legacy.form1099Q).prohibitedTransactionNoPostDisqualificationActivityConfirmed=true;legacy.form1099Int=[];
  const legacyAudit=calculate(legacy).lines.find(line=>line.form==='Form1099-Q'&&line.line==='terminated-esa:taxable-earnings');
  expect(legacyAudit?.formula).toContain('no later income/gain/loss');
});
it('rejects unknown actual domestic deposit classification', () => {
  const input=source();delete raw(proof(input)).domesticBankDepositConfirmed;
  expect(()=>calculate(input)).toThrow(/complete actual|domestic/);
});
it('rejects false actual domestic deposit classification', () => {
  const input=source();raw(proof(input)).domesticBankDepositConfirmed=false;
  expect(()=>calculate(input)).toThrow(/complete actual|domestic/);
});
it('rejects bank-account duplicates with missing optional original identity', () => {
  for (const field of ['taxYear','accountHolder','payerTin','accountReference'] as const) {
    const input=source(), duplicate=structuredClone(first(input.form1099Int));
    raw(duplicate)[field]=undefined;input.form1099Int.push(duplicate);
    expect(()=>calculateFederalTax(input),field).toThrow(/unique original|ambiguous/);
  }
});
