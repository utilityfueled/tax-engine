import { describe, expect, it } from 'vitest';
import { calculateEicDisallowanceHistory, type EicDisallowanceInput } from '@/engine/forms/eic-disallowance-history.js';
import { EicDisallowanceSourcesSchema, type EicDisallowanceSources } from '@/models/eic-disallowance-sources.js';

// Original dates within the published months are fictional. Tax years, duration,
// required-form outcomes and the filing-order distinction are published controls.
const primary = { firstName: 'Avery', lastName: 'Example', ssn: '900-12-3456' };
const spouse = { firstName: 'Jordan', lastName: 'Example', ssn: '900-23-4567' };
type Owner = NonNullable<EicDisallowanceSources['filers']>[number];
type Denial = NonNullable<Owner['denials']>[number];
function actual<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Incomplete fictional test fixture');
  return value;
}
function packet(data: EicDisallowanceInput): EicDisallowanceSources { return actual(data.sources); }
function filer(data: EicDisallowanceInput): Owner { return actual(actual(packet(data).filers)[0]); }
function denials(data: EicDisallowanceInput): Denial[] { return actual(filer(data).denials); }
function firstDenial(data: EicDisallowanceInput): Denial { return actual(denials(data)[0]); }
function owner(who: 'primary' | 'spouse' = 'primary'): Owner {
  return { owner: who, originalTaxpayer: { ...(who === 'primary' ? primary : spouse) }, sourceReference: 'Actual history record',
    sourceFactsConfirmed: true, allHistoryIncluded: true, denials: [], laterAllowances: [] };
}
function denial(patch: Partial<Denial> = {}): Denial {
  return { sourceId: 'denial-2024', sourceReference: 'Actual assessment transcript', taxYear: 2024,
    originalReturnFiledDate: '2025-03-15', noticeDate: '2025-09-01', assessmentDate: '2025-12-01',
    finalDeterminationDate: null, reason: 'qualifying_child_only', procedure: 'deficiency', conduct: 'none',
    appealPending: false, interveningReturnHistoryCompleteConfirmed: true, interveningOriginalReturns: [], ...patch };
}
function input(year = 2025, claimDate = '2026-03-01'): EicDisallowanceInput {
  return { taxpayer: { taxYear: year, filingStatus: 'single', primary }, qualifyingChildPresent: true,
    sources: { sourceTaxYear: year, sourceReference: 'Actual filing and IRS records', sourceFactsConfirmed: true,
      reviewedThroughDate: claimDate, claimStatus: 'filed', claimFilingDate: claimDate, filers: [owner()] } };
}
function withDenial(d: Denial, year = 2025, claimDate = '2026-03-01'): EicDisallowanceInput {
  const data = input(year, claimDate); filer(data).denials = [d]; return data;
}
describe('EIC actual disallowance history — spec/federal/eic-disallowance-history.yaml', () => {
  it('distinguishes an actual preparation review from a previously filed claim', () => {
    const prepared = withDenial(denial());
    Object.assign(packet(prepared), { claimStatus: 'preparing', preparationAsOfDate: '2026-03-01' });
    delete packet(prepared).claimFilingDate;
    expect(calculateEicDisallowanceHistory(prepared).form8862Required).toBe(true);
    const filed = withDenial(denial({ noticeDate: '2026-02-01', assessmentDate: '2026-05-02' }));
    Object.assign(packet(filed), { claimStatus: 'filed', reviewedThroughDate: '2026-06-01' });
    expect(calculateEicDisallowanceHistory(filed).form8862Required).toBe(false);
    for (const patch of [
      { claimStatus: undefined },
      { claimStatus: 'filed' },
      { claimFilingDate: '2026-03-01' },
      { reviewedThroughDate: '2026-02-28' },
      { preparationAsOfDate: '2026-02-28' },
    ]) {
      const unknown = structuredClone(prepared); Object.assign(packet(unknown), patch);
      expect(() => calculateEicDisallowanceHistory(unknown)).toThrow(/claim|filing|preparation|review/i);
    }
  });
  it('keeps absent history unknown and binds actual empty histories to each filer', () => {
    expect(EicDisallowanceSourcesSchema.parse({})).toEqual({});
    const data = input();
    expect(calculateEicDisallowanceHistory({ ...data, sources: undefined })).toMatchObject({ sourceFactsComplete: false, form8862Required: undefined, barred: undefined });
    expect(calculateEicDisallowanceHistory(data)).toMatchObject({ sourceFactsComplete: true, form8862Required: false, barred: false });
    delete filer(data).denials;
    expect(() => calculateEicDisallowanceHistory(data)).toThrow(/complete.*history|denial.*unknown/i);
    const joint = input(); joint.taxpayer = { ...joint.taxpayer, filingStatus: 'married_filing_jointly', spouse };
    expect(() => calculateEicDisallowanceHistory(joint)).toThrow(/spouse|each.*filer/i);
    actual(packet(joint).filers).push(owner('spouse'));
    expect(calculateEicDisallowanceHistory(joint).barred).toBe(false);
  });
  it('matches the published assessment timing and child-only exception examples', () => {
    const first = withDenial(denial());
    expect(calculateEicDisallowanceHistory(first)).toMatchObject({ form8862Required: true, barred: false, incomeOnlyRecertification: false });
    expect(calculateEicDisallowanceHistory({ ...first, qualifyingChildPresent: false }).form8862Required).toBe(false);
    const pending = withDenial(denial({ noticeDate: '2026-02-01', assessmentDate: null }), 2025, '2026-03-01');
    expect(calculateEicDisallowanceHistory(pending).form8862Required).toBe(false);
    const nextYear = withDenial(denial({ noticeDate: '2026-02-01', assessmentDate: '2026-05-02' }), 2026, '2027-03-01');
    expect(calculateEicDisallowanceHistory(nextYear).form8862Required).toBe(true);
    expect(calculateEicDisallowanceHistory(withDenial(denial({ reason: 'income_only' }))).incomeOnlyRecertification).toBe(true);
  });
  it('matches published two-year and ten-year bans including the later-filed example', () => {
    const reckless = denial({ conduct: 'reckless', finalDeterminationDate: '2025-12-01' });
    for (const year of [2025, 2026]) expect(calculateEicDisallowanceHistory(withDenial(reckless, year, `${year + 1}-03-01`)))
      .toMatchObject({ barred: true, form8862Required: false });
    expect(calculateEicDisallowanceHistory(withDenial(reckless, 2027, '2028-03-01'))).toMatchObject({ barred: false, form8862Required: true });
    const later = denial({ noticeDate: '2026-02-01', assessmentDate: '2026-05-02', finalDeterminationDate: '2026-05-02', conduct: 'reckless',
      interveningOriginalReturns: [{ taxYear: 2025, filedDate: '2026-03-01', sourceReference: 'Actual 2025 filed return' }] });
    for (const year of [2026, 2027]) expect(calculateEicDisallowanceHistory(withDenial(later, year, `${year + 1}-03-01`)).barred).toBe(true);
    expect(calculateEicDisallowanceHistory(withDenial(later, 2028, '2029-03-01'))).toMatchObject({ barred: false, form8862Required: true });
    const fraud = { ...reckless, conduct: 'fraud' as const, originalReturnFiledDate: '2025-02-15' };
    for (const year of [2025, 2034]) expect(calculateEicDisallowanceHistory(withDenial(fraud, year, `${year + 1}-03-01`)).barred).toBe(true);
    expect(calculateEicDisallowanceHistory(withDenial(fraud, 2035, '2036-03-01'))).toMatchObject({ barred: false, form8862Required: true });
  });
  it('requires actual linked later allowance and preserves the omitted-form requirement', () => {
    const data = withDenial(denial(), 2026, '2027-03-01');
    filer(data).laterAllowances = [{ sourceId: 'allowed-2025', sourceReference: 'Actual IRS allowance', taxYear: 2025,
      returnFiledDate: '2026-03-01', allowanceDate: '2026-05-01', demonstration: 'form8862', resolvedDenialSourceIds: ['denial-2024'] }];
    expect(calculateEicDisallowanceHistory(data).form8862Required).toBe(false);
    actual(actual(filer(data).laterAllowances)[0]).demonstration = undefined;
    expect(() => calculateEicDisallowanceHistory(data)).toThrow(/documents|demonstration|8862/i);
    const omitted = withDenial(denial(), 2026, '2027-03-01');
    denials(omitted).push(denial({ sourceId: 'missing-form-2025', taxYear: 2025,
      originalReturnFiledDate: '2026-03-01', noticeDate: '2026-04-01', assessmentDate: '2026-04-01',
      reason: 'omitted_required_8862', procedure: 'math_or_clerical', underlyingDenialSourceId: 'denial-2024' }));
    expect(calculateEicDisallowanceHistory(omitted).form8862Required).toBe(true);
    expect(calculateEicDisallowanceHistory(withDenial(denial({ reason: 'math_or_clerical', procedure: 'math_or_clerical' }))).form8862Required).toBe(false);
  });
  it('rejects missing chronology and conflicting original notice or owner records without mutation', () => {
    const base = withDenial(denial({ conduct: 'reckless', finalDeterminationDate: '2025-12-01',
      banNotice: { sourceReference: 'Actual CP79A', noticeDate: '2026-01-15', firstEligibleTaxYear: 2027 } }));
    const before = structuredClone(base);
    expect(calculateEicDisallowanceHistory(base).barred).toBe(true); expect(base).toEqual(before);
    const conflict = structuredClone(base); actual(firstDenial(conflict).banNotice).firstEligibleTaxYear = 2028;
    expect(() => calculateEicDisallowanceHistory(conflict)).toThrow(/notice.*chronology|chronology.*notice/i);
    const missing = structuredClone(base); delete firstDenial(missing).interveningOriginalReturns;
    expect(() => calculateEicDisallowanceHistory(missing)).toThrow(/intervening|chronology/i);
    const replaced = structuredClone(base); actual(filer(replaced).originalTaxpayer).ssn = spouse.ssn;
    expect(() => calculateEicDisallowanceHistory(replaced)).toThrow(/identity/i);
    const duplicate = structuredClone(base); denials(duplicate).push(structuredClone(firstDenial(duplicate)));
    expect(() => calculateEicDisallowanceHistory(duplicate)).toThrow(/duplicate/i);
    const appeal = structuredClone(base); firstDenial(appeal).appealPending = true;
    expect(() => calculateEicDisallowanceHistory(appeal)).toThrow(/appeal.*method/i);
  });
  it('retains a spouses unresolved denial independently of the other filers allowance', () => {
    const data = input(2026, '2027-03-01'); data.taxpayer = { ...data.taxpayer, filingStatus: 'married_filing_jointly', spouse };
    const spouseHistory = owner('spouse'); spouseHistory.denials = [denial()]; actual(packet(data).filers).push(spouseHistory);
    expect(calculateEicDisallowanceHistory(data).form8862Required).toBe(true);
    // The primary's own allowance cannot clear the spouse's separately bound denial.
    filer(data).laterAllowances = [{ sourceId: 'primary-allowed', sourceReference: 'Primary IRS allowance', taxYear: 2025,
      returnFiledDate: '2026-03-01', allowanceDate: '2026-05-01', demonstration: 'form8862', resolvedDenialSourceIds: ['denial-2024'] }];
    expect(() => calculateEicDisallowanceHistory(data)).toThrow(/linked.*denial|denial.*link/i);
  });
  it('requires actual finality and a later resolution of contradictory omitted-form records', () => {
    const finality = withDenial(denial({ conduct: 'reckless', finalDeterminationDate: null,
      banNotice: { sourceReference: 'Actual CP79A', noticeDate: '2026-01-15', firstEligibleTaxYear: 2027 } }));
    expect(() => calculateEicDisallowanceHistory(finality)).toThrow(/ban notice.*final determination/i);
    const data = withDenial(denial(), 2027, '2028-03-01');
    denials(data).push(denial({ sourceId: 'omitted-2025', taxYear: 2025,
      originalReturnFiledDate: '2026-03-01', noticeDate: '2026-09-01', assessmentDate: '2026-09-01',
      reason: 'omitted_required_8862', procedure: 'math_or_clerical', underlyingDenialSourceId: 'denial-2024' }));
    filer(data).laterAllowances = [{ sourceId: 'allowed-2025', sourceReference: 'Actual earlier allowance', taxYear: 2025,
      returnFiledDate: '2026-03-01', allowanceDate: '2026-05-01', demonstration: 'form8862', resolvedDenialSourceIds: ['denial-2024'] }];
    expect(() => calculateEicDisallowanceHistory(data)).toThrow(/omitted8862.*allowance|allowance.*omitted8862/i);
    actual(filer(data).laterAllowances).push({ sourceId: 'allowed-2026', sourceReference: 'Actual later resolved allowance', taxYear: 2026,
      returnFiledDate: '2027-03-01', allowanceDate: '2027-05-01', demonstration: 'other_irs_required_documents', resolvedDenialSourceIds: ['denial-2024'] });
    expect(calculateEicDisallowanceHistory(data).form8862Required).toBe(false);
  });
  it('applies either actual ban without inventing irrelevant current child facts', () => {
    const input = withDenial(denial({ conduct: 'reckless', finalDeterminationDate: '2025-12-01' }));
    delete input.qualifyingChildPresent;
    expect(calculateEicDisallowanceHistory(input)).toMatchObject({ barred: true, form8862Required: false });
    input.taxpayer = { ...input.taxpayer, filingStatus: 'married_filing_jointly', spouse };
    firstDenial(input).conduct = 'none';
    const spouseHistory = owner('spouse'); spouseHistory.denials = [denial({ conduct: 'reckless', finalDeterminationDate: '2025-12-01' })];
    actual(packet(input).filers).push(spouseHistory);
    const before = structuredClone(input);
    expect(calculateEicDisallowanceHistory(input)).toMatchObject({ barred: true, form8862Required: false });
    expect(input).toEqual(before);
    spouseHistory.denials = [];
    expect(() => calculateEicDisallowanceHistory(input)).toThrow(/actual qualifying.child presence/i);
  });
});
