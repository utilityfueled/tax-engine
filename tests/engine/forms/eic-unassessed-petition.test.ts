// Spec: spec/federal/eic-unassessed-petition.yaml. All original records are fictional.
import { expect, it, vi } from 'vitest';
import { calculateEicDisallowanceHistory, type EicDisallowanceInput } from '@/engine/forms/eic-disallowance-history.js';
import { EicDisallowanceSourcesSchema, type EicDisallowanceSources } from '@/models/eic-disallowance-sources.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { assertPdfExportAllowed } from '@/pdf/export-policy.js';

vi.mock('server-only', () => ({}));
function actual<T,>(v: T | undefined): T { if (v === undefined) throw new Error('Incomplete fictional source'); return v; }
type Filer = NonNullable<EicDisallowanceSources['filers']>[number];
type Denial = NonNullable<Filer['denials']>[number];
function packet(v: EicDisallowanceInput) { return actual(v.sources); }
function filer(v: EicDisallowanceInput) { return actual(actual(packet(v).filers)[0]); }
function denial(v: EicDisallowanceInput) { return actual(actual(filer(v).denials)[0]); }
function proof(v: EicDisallowanceInput): Record<string, unknown> { return actual(Reflect.get(denial(v), 'unassessedTaxCourtPetition')); }
const primary = { firstName: 'Avery', lastName: 'Example', ssn: '900-12-3456' };
function fixture(year = 2025): EicDisallowanceInput {
  const prior = year - 1, current = year + 1, through = `${current}-03-01`;
  const pending = {
    sourceTaxYear: year, owner: 'primary', originalTaxpayerSsn: primary.ssn,
    sourceReference: 'Private complete petition evidence', sourceFactsConfirmed: true,
    denialSourceId: 'fictional-deficiency', denialSourceReference: 'Private original statutory notice',
    deniedTaxYear: prior, originalReturnFiledDate: `${year}-03-15`,
    deficiencyNoticeReference: 'Private original statutory notice', noticeDate: `${year}-09-01`,
    noticeLastPetitionDate: year === 2025 ? '2025-12-01' : '2026-11-30', noticeDeadlineConfirmed: true,
    docketReference: 'Private Tax Court docket', docketNumber: 'Fictional-12345',
    petitionReference: 'Private filed petition', petitionFiledDate: `${year}-11-20`,
    actualTaxCourtDeficiencyPetitionConfirmed: true, actualTimelyPetitionConfirmed: true,
    reviewedThroughDate: through, claimDate: through,
    accountTranscriptReference: 'Private original account transcript',
    courtEventHistoryReference: 'Private complete docket events',
    completeCourtAndAccountHistoryConfirmed: true,
    assessmentDate: null, finalDeterminationDate: null,
    decisionDate: null, dismissalDate: null, settlementDate: null, assessmentWaiverDate: null,
    terminationOrJeopardyAssessmentDate: null, bankruptcyCaseDate: null,
    paymentAssessmentDate: null, otherAssessmentExceptionDate: null,
  };
  const original: Denial = { sourceId: 'fictional-deficiency', sourceReference: 'Private original statutory notice',
    taxYear: prior, originalReturnFiledDate: `${year}-03-15`, noticeDate: `${year}-09-01`,
    assessmentDate: null, finalDeterminationDate: null, procedure: 'deficiency', reason: 'income_only',
    conduct: 'none', appealPending: true };
  Object.assign(original, { unassessedTaxCourtPetition: pending });
  return { taxpayer: { taxYear: year, filingStatus: 'single', primary: { ...primary } }, qualifyingChildPresent: false,
    sources: { sourceTaxYear: year, sourceReference: 'Private all original records', sourceFactsConfirmed: true,
      reviewedThroughDate: through, claimStatus: 'preparing', preparationAsOfDate: through,
      filers: [{ owner: 'primary', originalTaxpayer: { ...primary }, sourceReference: 'Private primary history',
        sourceFactsConfirmed: true, allHistoryIncluded: true, denials: [original], laterAllowances: [] }] } };
}
function fullReturn(year = 2025) {
  const input = structuredClone(simpleW2Fixture), history = fixture(year);
  input.taxpayer.taxYear = year;
  history.taxpayer.primary = { ...input.taxpayer.primary };
  actual(filer(history).originalTaxpayer).firstName = input.taxpayer.primary.firstName;
  actual(filer(history).originalTaxpayer).lastName = input.taxpayer.primary.lastName;
  actual(filer(history).originalTaxpayer).ssn = input.taxpayer.primary.ssn;
  proof(history).originalTaxpayerSsn = input.taxpayer.primary.ssn;
  input.taxpayer.primary.employmentValidSsnIssuedByDueDate = true; input.taxpayer.primary.tinIssuedByDueDate = true;
  input.w2s[0] = { ...actual(input.w2s[0]), wages: '10000', federalWithheld: '0', socialSecurityWages: '10000',
    socialSecurityWithheld: '620', medicareWages: '10000', medicareWithheld: '145' };
  input.eic = { primaryIsFullTimeStudent: false, disallowanceSources: packet(history), claimantEligibility: {
    sourceTaxYear: year, sourceReference: 'Private actual claimant facts', sourceFactsConfirmed: true,
    primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false,
    primaryChildless: { mainHomeInUnitedStatesMoreThanHalfYear: true, countedMilitaryDutyOutsideUnitedStates: false } } };
  return input;
}
it('admits actual unassessed petitions without completing recertification or inventing a claim', () => {
  for (const year of [2025, 2026]) {
    const original = fixture(year), before = structuredClone(original);
    expect(calculateEicDisallowanceHistory(original)).toMatchObject({ sourceFactsComplete: true, barred: false,
      form8862Required: false, filers: [{ owner: 'primary', barred: false, unresolvedDeficiencyCount: 0 }] });
    expect(original).toEqual(before);
    const filed = structuredClone(original); packet(filed).claimStatus = 'filed';
    packet(filed).claimFilingDate = packet(filed).preparationAsOfDate; delete packet(filed).preparationAsOfDate;
    expect(calculateEicDisallowanceHistory(filed).form8862Required).toBe(false);
  }
  const complete = fullReturn();
  expect(actual(calculateFederalTax(TaxYearInputSchema.parse(complete)).allLines.find(l => l.form === '1040' && l.line === '27a')).value.toFixed()).toBe('649');
});
it('rejects missing false substituted or stale original petition facts', () => {
  const original = fixture();
  for (const key of Object.keys(proof(original))) {
    const missing = fixture(); Reflect.deleteProperty(proof(missing), key);
    expect(() => calculateEicDisallowanceHistory(missing), `missing ${key}`).toThrow();
    if (proof(original)[key] === true) {
      const unconfirmed = fixture(); proof(unconfirmed)[key] = false;
      expect(() => calculateEicDisallowanceHistory(unconfirmed), `false ${key}`).toThrow();
    }
  }
  for (const changed of [
    { sourceTaxYear: 2024 }, { owner: 'spouse' }, { originalTaxpayerSsn: '900-98-7654' },
    { deniedTaxYear: 2023 }, { deniedTaxYear: 2025 }, { originalReturnFiledDate: '2025-03-16' },
    { denialSourceId: 'another-denial' }, { denialSourceReference: 'Another notice' },
    { deficiencyNoticeReference: 'Another notice' }, { noticeDate: '2025-09-02' },
    { claimDate: '2026-02-28' }, { reviewedThroughDate: '2026-02-28' },
    { docketNumber: '' }, { petitionReference: '' }, { accountTranscriptReference: '' }, { courtEventHistoryReference: '' },
  ]) {
    const input = fixture(); Object.assign(proof(input), changed);
    expect(() => calculateEicDisallowanceHistory(input), JSON.stringify(changed)).toThrow();
  }
  for (const mutate of [
    (input: EicDisallowanceInput) => { filer(input).allHistoryIncluded = false; },
    (input: EicDisallowanceInput) => { actual(filer(input).originalTaxpayer).ssn = '900-98-7654'; },
    (input: EicDisallowanceInput) => { delete filer(input).laterAllowances; },
  ]) { const input = fixture(); mutate(input); expect(() => calculateEicDisallowanceHistory(input)).toThrow(); }
});
it('enforces actual notice deadline and explicit unassessed nonfinal chronology', () => {
  const onDeadline = fixture(); proof(onDeadline).petitionFiledDate = proof(onDeadline).noticeLastPetitionDate;
  expect(calculateEicDisallowanceHistory(onDeadline).form8862Required).toBe(false);
  for (const changed of [
    { petitionFiledDate: '2025-12-02' }, { petitionFiledDate: '2025-08-31' },
    { petitionFiledDate: '2026-03-02', noticeLastPetitionDate: '2026-03-03' },
    { noticeLastPetitionDate: '2025-08-31' }, { noticeLastPetitionDate: '2025-02-30' },
  ]) { const input = fixture(); Object.assign(proof(input), changed); expect(() => calculateEicDisallowanceHistory(input)).toThrow(); }
  for (const key of ['assessmentDate', 'finalDeterminationDate', 'decisionDate', 'dismissalDate', 'settlementDate',
    'assessmentWaiverDate', 'terminationOrJeopardyAssessmentDate', 'bankruptcyCaseDate', 'paymentAssessmentDate', 'otherAssessmentExceptionDate']) {
    for (const unknown of [undefined, '', false, '2026-02-01']) {
      const input = fixture(); proof(input)[key] = unknown;
      expect(() => calculateEicDisallowanceHistory(input), `${key}:${unknown}`).toThrow();
    }
  }
  for (const key of ['assessmentDate', 'finalDeterminationDate'] as const) {
    const input = fixture(); denial(input)[key] = '2026-02-01'; expect(() => calculateEicDisallowanceHistory(input)).toThrow();
  }
  const afterClaim = fixture(); packet(afterClaim).reviewedThroughDate = '2026-04-01';
  packet(afterClaim).claimStatus = 'filed'; packet(afterClaim).claimFilingDate = '2026-03-01'; delete packet(afterClaim).preparationAsOfDate;
  proof(afterClaim).reviewedThroughDate = '2026-04-01';
  expect(calculateEicDisallowanceHistory(afterClaim).form8862Required).toBe(false);
});
it('retains other assessed deficiencies and separate final bans', () => {
  const assessed = fixture(); actual(filer(assessed).denials).push({ sourceId: 'other-assessed', sourceReference: 'Separate actual assessment',
    taxYear: 2023, originalReturnFiledDate: '2024-03-01', noticeDate: '2024-09-01', assessmentDate: '2024-12-01',
    finalDeterminationDate: null, procedure: 'deficiency', reason: 'income_only', conduct: 'none', appealPending: false });
  expect(calculateEicDisallowanceHistory(assessed)).toMatchObject({ barred: false, form8862Required: true });
  const joint = fixture(); joint.taxpayer.filingStatus = 'married_filing_jointly';
  joint.taxpayer.spouse = { firstName: 'Jordan', lastName: 'Example', ssn: '900-23-4567' };
  actual(packet(joint).filers).push({ owner: 'spouse', originalTaxpayer: { ...joint.taxpayer.spouse }, sourceReference: 'Spouse private all history',
    sourceFactsConfirmed: true, allHistoryIncluded: true, laterAllowances: [], denials: [{ sourceId: 'spouse-final',
      sourceReference: 'Private actual final conduct ban', taxYear: 2024, originalReturnFiledDate: '2025-03-01',
      noticeDate: '2025-09-01', assessmentDate: '2025-12-01', finalDeterminationDate: '2025-12-01',
      procedure: 'deficiency', reason: 'income_only', conduct: 'reckless', appealPending: false,
      interveningReturnHistoryCompleteConfirmed: true, interveningOriginalReturns: [] }] });
  expect(calculateEicDisallowanceHistory(joint)).toMatchObject({ barred: true, form8862Required: false });
  const contestedFinal = fixture(); denial(contestedFinal).assessmentDate = denial(contestedFinal).finalDeterminationDate = '2025-12-01';
  denial(contestedFinal).conduct = 'reckless'; expect(() => calculateEicDisallowanceHistory(contestedFinal)).toThrow();
  const bareAppeal = fixture(); Reflect.deleteProperty(denial(bareAppeal), 'unassessedTaxCourtPetition');
  expect(() => calculateEicDisallowanceHistory(bareAppeal)).toThrow(/appeal.*method/i);
});
it('preserves source proof on replay and rejects detached or duplicate petitions', () => {
  const input = fixture(), parsed = EicDisallowanceSourcesSchema.parse(JSON.parse(JSON.stringify(packet(input))));
  expect(parsed).toEqual(packet(input));
  expect(calculateEicDisallowanceHistory({ ...input, sources: parsed }).form8862Required).toBe(false);
  const detached = fixture(); denial(detached).appealPending = false;
  expect(() => calculateEicDisallowanceHistory(detached)).toThrow();
  const extra = fixture(); proof(extra).inventedJurisdictionOutcome = true;
  expect(() => calculateEicDisallowanceHistory(extra)).toThrow();
  expect(() => EicDisallowanceSourcesSchema.parse(packet(extra))).toThrow();
  const duplicate = fixture(), second = structuredClone(denial(duplicate));
  second.sourceId = 'other-denial'; Object.assign(Reflect.get(second, 'unassessedTaxCourtPetition'), { denialSourceId: 'other-denial' });
  actual(filer(duplicate).denials).push(second);
  expect(() => calculateEicDisallowanceHistory(duplicate)).toThrow(/duplicate|docket/i);
});
it('preserves actual canonical privacy and annual readiness boundaries', () => {
  const input = TaxYearInputSchema.parse(fullReturn()), before = JSON.stringify(input);
  const scope = { ownerScope: 'synthetic-petition-owner', workspaceId: 'synthetic-petition-return', workspaceRevision: 'synthetic-petition-revision' };
  const audit = calculateVerifiedAiAudit(scope, input), context = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit });
  expect(context.status).toBe('available');
  const workspace = Object.assign(createWorkspaceRecord(scope.workspaceId, { now: '2026-11-14T00:00:00.000Z' }), { eic: input.eic });
  for (const payload of [audit, context, sanitizeWorkspaceForHostedStorage(workspace), buildProviderWorkspaceRequest(workspace, { now: '2026-11-14T00:00:00.000Z' })])
    for (const marker of ['unassessedTaxCourtPetition', input.taxpayer.primary.ssn, 'Private Tax Court docket', 'Fictional-12345',
      'Private original statutory notice', 'Private filed petition', 'Private original account transcript', 'Private complete docket events'])
      expect(JSON.stringify(payload)).not.toContain(marker);
  expect(JSON.stringify(input)).toBe(before);
  const next = fullReturn(2026);
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(next))).toThrow(/2026.*incomplete/i);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified/u);
});
