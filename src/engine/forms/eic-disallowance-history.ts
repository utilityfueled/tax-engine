/** Actual history prerequisite; spec/federal/eic-disallowance-history.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { EicDisallowanceSources } from '@/models/eic-disallowance-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';

type Identity = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
export interface EicDisallowanceInput {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & { primary: Identity; spouse?: Identity };
  /** Actual child presence, including a qualifying child not counted under32(b). */
  qualifyingChildPresent?: boolean;
  sources?: EicDisallowanceSources;
}
export interface EicDisallowanceHistoryResult {
  sourceFactsComplete: boolean;
  barred: boolean | undefined;
  form8862Required: boolean | undefined;
  incomeOnlyRecertification?: boolean;
  recertificationNeededAfterBan?: boolean;
  /** These are source-derived restrictions, not completed8862 or credit eligibility. */
  filers: Array<{ owner: 'primary' | 'spouse'; barred: boolean; unresolvedDeficiencyCount: number; childOnlyException: boolean }>;
  lines: CalculatedLine[];
}
type Filer = NonNullable<EicDisallowanceSources['filers']>[number];
type Denial = NonNullable<Filer['denials']>[number];
type ValidDenial = { source: Denial; id: string; taxYear: number; originalFiled: string; assessment: string | null; final: string | null; ban?: { first: number; last: number } };

function text(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`EIC history ${label} requires an actual source value`);
  return value.trim();
}
function date(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`EIC history ${label} requires an actual calendar date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`EIC history ${label} requires an actual calendar date`);
  return value;
}
function knownDate(value: string | null | undefined, label: string, through: string): string | null {
  if (value === undefined) throw new Error(`EIC history ${label} is unknown; supply its actual date or confirm it has not occurred`);
  if (value === null) return null;
  const actual = date(value, label);
  if (actual > through) throw new Error(`EIC history ${label} occurs after the actual reviewed-through date`);
  return actual;
}
function year(value: number | undefined, label: string): number {
  if (!Number.isInteger(value) || value === undefined || value < 1997 || value > 9999) throw new Error(`EIC history ${label} requires an actual tax year after1996`);
  return value;
}
function identity(actual: Identity, saved: Filer['originalTaxpayer']): void {
  const id = (value: string | undefined) => text(value, 'taxpayer identifier').replaceAll('-', '');
  if (!saved || text(actual.firstName, 'taxpayer first name') !== text(saved.firstName, 'original first name')
    || text(actual.lastName, 'taxpayer last name') !== text(saved.lastName, 'original last name')
    || id(actual.ssn) !== id(saved.ssn) || !/^\d{9}$/.test(id(actual.ssn))) throw new Error('EIC history original taxpayer identity does not match the actual filer');
}
function banRange(source: Denial, taxYear: number, originalFiled: string, final: string, through: string): { first: number; last: number } {
  if (source.interveningReturnHistoryCompleteConfirmed !== true || source.interveningOriginalReturns === undefined) throw new Error('EIC history needs complete actual intervening original-return chronology, including known empty records');
  const filings = new Map<number, string>();
  for (const item of source.interveningOriginalReturns) {
    const filingYear = year(item.taxYear, 'intervening return year');
    const filed = date(item.filedDate, 'intervening original filing'); text(item.sourceReference, 'intervening return reference');
    if (filingYear <= taxYear || filed <= originalFiled || filed >= final || filed <= `${filingYear}-12-31`) throw new Error('EIC intervening original-return chronology conflicts with the actual original or final determination');
    if (filings.has(filingYear)) throw new Error('EIC duplicate intervening return tax year');
    filings.set(filingYear, filed);
  }
  let first = taxYear + 1;
  const sorted = [...filings].sort(([a], [b]) => a - b);
  let lastFiled = originalFiled;
  let consecutive = true;
  for (const [filingYear, filed] of sorted) {
    if (filingYear !== first || filed <= lastFiled) consecutive = false;
    first = filingYear + 1; lastFiled = filed;
  }
  const ordinary = Number(originalFiled.slice(0, 4)) === taxYear + 1
    && Number(final.slice(0, 4)) >= taxYear + 1 && Number(final.slice(0, 4)) <= taxYear + 2 && consecutive;
  const duration = source.conduct === 'reckless' ? 2 : 10;
  const notice = source.banNotice;
  if (notice !== undefined) {
    text(notice.sourceReference, 'actual ban notice reference');
    const issued = date(notice.noticeDate, 'ban notice date');
    if (issued < final || issued > through) throw new Error('EIC actual ban notice date conflicts with final determination or reviewed-through date');
    const firstEligible = year(notice.firstEligibleTaxYear, 'notice first eligible year');
    const orderedFirst = firstEligible - duration;
    if (orderedFirst <= taxYear) throw new Error('EIC actual ban notice years conflict with the denied return year');
    if (ordinary && orderedFirst !== first) throw new Error('EIC actual ban notice years conflict with supported original-return chronology');
    return { first: orderedFirst, last: firstEligible - 1 };
  }
  if (!ordinary) throw new Error('EIC late or out-of-order ban chronology requires its actual controlling notice; no ban start is inferred');
  return { first, last: first + duration - 1 };
}
function denialRecords(filer: Filer, through: string): Map<string, ValidDenial> {
  if (filer.denials === undefined || filer.laterAllowances === undefined || filer.allHistoryIncluded !== true) throw new Error('EIC complete actual denial and allowance history is required, including known empty lists');
  const records = new Map<string, ValidDenial>();
  for (const source of filer.denials) {
    const id = text(source.sourceId, 'denial ID'); text(source.sourceReference, 'denial reference');
    if (records.has(id)) throw new Error('EIC duplicate denial source ID');
    const taxYear = year(source.taxYear, 'denied return year');
    const originalFiled = date(source.originalReturnFiledDate, 'original return filing');
    const notice = date(source.noticeDate, 'denial notice');
    if (originalFiled <= `${taxYear}-12-31` || notice < originalFiled || notice > through) throw new Error('EIC original return/notice chronology conflicts with the actual tax year or review date');
    const assessment = knownDate(source.assessmentDate, 'assessment', through);
    const final = knownDate(source.finalDeterminationDate, 'final determination', through);
    if ((assessment !== null && assessment < notice) || (final !== null && final < notice)) throw new Error('EIC assessment or final determination precedes its original notice');
    if (!['math_or_clerical', 'deficiency'].includes(source.procedure ?? '') || !['math_or_clerical', 'qualifying_child_only', 'income_only', 'other', 'omitted_required_8862'].includes(source.reason ?? '')) throw new Error('EIC actual denial procedure or reason is unknown');
    const math = source.reason === 'math_or_clerical' || source.reason === 'omitted_required_8862';
    if (math !== (source.procedure === 'math_or_clerical')) throw new Error('EIC denial procedure conflicts with the actual reason');
    if (!['none', 'reckless', 'fraud'].includes(source.conduct ?? '')) throw new Error('EIC actual final conduct determination is unknown');
    if (typeof source.appealPending !== 'boolean') throw new Error('EIC actual pending appeal answer is unknown');
    if (source.appealPending) throw new Error('EIC active appeal method requires separate actual contested-determination sources');
    if (math && source.conduct !== 'none') throw new Error('EIC math correction cannot establish a statutory conduct ban');
    if (source.conduct === 'none' && source.banNotice !== undefined) throw new Error('EIC actual ban notice conflicts with the no-conduct-ban determination');
    if (source.banNotice !== undefined && final === null) throw new Error('EIC actual ban notice requires its actual final determination date');
    const ban = source.conduct !== 'none' && final !== null ? banRange(source, taxYear, originalFiled, final, through) : undefined;
    records.set(id, { source, id, taxYear, originalFiled, assessment, final, ban });
  }
  for (const record of records.values()) {
    if (record.source.reason !== 'omitted_required_8862') {
      if (record.source.underlyingDenialSourceId !== undefined) throw new Error('EIC underlying denial link belongs to an actual omitted8862 record');
      continue;
    }
    const original = records.get(text(record.source.underlyingDenialSourceId, 'omitted8862 underlying denial ID'));
    if (!original || original.source.procedure !== 'deficiency' || original.assessment === null
      || original.assessment >= record.originalFiled || original.taxYear >= record.taxYear) throw new Error('EIC omitted8862 record needs its actual linked earlier deficiency denial');
  }
  return records;
}

export function calculateEicDisallowanceHistory(input: EicDisallowanceInput): EicDisallowanceHistoryResult {
  const sources = input.sources;
  if (sources === undefined) return { sourceFactsComplete: false, barred: undefined, form8862Required: undefined, filers: [], lines: [] };
  if (sources.sourceTaxYear !== input.taxpayer.taxYear) throw new Error('EIC history source year must match the actual current return year');
  text(sources.sourceReference, 'packet reference');
  if (sources.sourceFactsConfirmed !== true) throw new Error('EIC history actual source confirmation is required');
  const through = date(sources.reviewedThroughDate, 'reviewed-through date');
  let claim: string;
  if (sources.claimStatus === 'preparing') {
    if (sources.claimFilingDate !== undefined) throw new Error('EIC unfiled preparation cannot also assert an actual claim filing date');
    claim = date(sources.preparationAsOfDate, 'preparation-as-of date');
    if (claim !== through) throw new Error('EIC preparation requires actual history reviewed through that same preparation date');
  } else if (sources.claimStatus === 'filed') {
    if (sources.preparationAsOfDate !== undefined) throw new Error('EIC filed claim uses its actual filing date, not a preparation date');
    claim = date(sources.claimFilingDate, 'current claim filing date');
  } else {
    throw new Error('EIC current claim filing or preparation status is unknown');
  }
  if (claim > through) throw new Error('EIC future claim date needs history through that actual date; intervening determinations are not inferred');
  const joint = input.taxpayer.filingStatus === 'married_filing_jointly';
  if (joint && input.taxpayer.spouse === undefined) throw new Error('EIC joint history needs the actual spouse identity');
  if (sources.filers === undefined || sources.filers.length !== (joint ? 2 : 1)) throw new Error('EIC history requires each actual filer, including the spouse on a joint return');
  const owners = new Set<string>();
  const identities = new Set<string>();
  const filers: EicDisallowanceHistoryResult['filers'] = [];
  const unresolved: ValidDenial[] = [];
  const ownerRequirements: Array<{ active: ValidDenial[]; result: EicDisallowanceHistoryResult['filers'][number] }> = [];
  let barred = false;
  for (const filer of sources.filers) {
    if (filer.owner !== 'primary' && filer.owner !== 'spouse') throw new Error('EIC history filer owner is unknown');
    if (owners.has(filer.owner)) throw new Error('EIC duplicate history owner'); owners.add(filer.owner);
    const actual = filer.owner === 'primary' ? input.taxpayer.primary : joint ? input.taxpayer.spouse : undefined;
    if (actual === undefined) throw new Error('EIC spouse history requires the actual joint filer');
    identity(actual, filer.originalTaxpayer);
    const actualId = actual.ssn.replaceAll('-', '');
    if (identities.has(actualId)) throw new Error('EIC duplicate actual filer identity'); identities.add(actualId);
    text(filer.sourceReference, 'filer history reference');
    if (filer.sourceFactsConfirmed !== true) throw new Error('EIC each filer history requires actual source confirmation');
    const records = denialRecords(filer, through);
    const cleared = new Map<string, string>();
    const allowanceIds = new Set<string>();
    for (const allowance of filer.laterAllowances ?? []) {
      const id = text(allowance.sourceId, 'allowance ID'); text(allowance.sourceReference, 'allowance reference');
      if (allowanceIds.has(id) || records.has(id)) throw new Error('EIC duplicate allowance source ID'); allowanceIds.add(id);
      const allowedYear = year(allowance.taxYear, 'allowed return year');
      const filed = date(allowance.returnFiledDate, 'later return filing');
      const allowed = date(allowance.allowanceDate, 'actual IRS allowance');
      if (filed <= `${allowedYear}-12-31` || allowed < filed || allowed > through) throw new Error('EIC actual later filing/allowance chronology conflicts');
      if (!['form8862', 'other_irs_required_documents'].includes(allowance.demonstration ?? '')) throw new Error('EIC later allowance requires actual8862 or other IRS-required documents');
      if (!allowance.resolvedDenialSourceIds?.length) throw new Error('EIC later allowance needs actual linked earlier denial records');
      const links = new Set<string>();
      for (const value of allowance.resolvedDenialSourceIds) {
        const linkedId = text(value, 'resolved denial ID');
        if (links.has(linkedId)) throw new Error('EIC duplicate linked allowance denial'); links.add(linkedId);
        const linked = records.get(linkedId);
        if (!linked || linked.source.procedure !== 'deficiency' || linked.assessment === null
          || linked.assessment >= filed || linked.taxYear >= allowedYear) throw new Error('EIC allowance requires its actual linked earlier deficiency denial');
        if (linked.ban && allowedYear >= linked.ban.first && allowedYear <= linked.ban.last) throw new Error('EIC claimed allowance during an active ordered ban requires separate resolved-appeal sources');
        if (allowed <= claim && allowedYear < input.taxpayer.taxYear && allowed > (cleared.get(linkedId) ?? '')) cleared.set(linkedId, allowed);
      }
    }
    for (const record of records.values()) {
      if (record.source.reason !== 'omitted_required_8862' || record.assessment === null || record.assessment > claim) continue;
      const resolved = cleared.get(text(record.source.underlyingDenialSourceId, 'omitted8862 underlying denial ID'));
      if (resolved !== undefined && resolved <= record.assessment) throw new Error('EIC later omitted8862 record conflicts with an earlier allowance; actual subsequent resolution is required');
    }
    const active = [...records.values()].filter(record => record.source.procedure === 'deficiency'
      && record.assessment !== null && record.assessment <= claim && !cleared.has(record.id));
    const ownerBarred = [...records.values()].some(record => record.ban !== undefined && record.final !== null && record.final <= claim
      && input.taxpayer.taxYear >= record.ban.first && input.taxpayer.taxYear <= record.ban.last);
    barred ||= ownerBarred;
    const result = { owner: filer.owner, barred: ownerBarred, unresolvedDeficiencyCount: active.length, childOnlyException: false };
    filers.push(result); ownerRequirements.push({ active, result });
  }
  // Validate both histories first. Either actual ban settles the joint claim;
  // the current no-child recertification exception cannot lift that ban.
  if (!barred) for (const { active, result } of ownerRequirements) {
    const allChildOnly = active.length > 0 && active.every(record => record.source.reason === 'qualifying_child_only');
    if (allChildOnly && typeof input.qualifyingChildPresent !== 'boolean') throw new Error('EIC child-only recertification exception needs actual qualifying-child presence, not an SSN-counted amount');
    result.childOnlyException = allChildOnly && input.qualifyingChildPresent === false;
    if (!result.childOnlyException) unresolved.push(...active);
  }
  const required = !barred && unresolved.length > 0;
  const audit = new AuditTrail();
  audit.record('EIC', 'disallowanceHistory', 'Actual separate-filer EIC history', new Decimal(barred ? 0 : 1),
    barred ? 'An actual final determination bars this return year; no EIC claim or ordinary8862 clearance is inferred'
      : required ? 'Actual unresolved deficiency denial requires source-complete Form8862; this history does not complete that form'
        : 'Actual history establishes no current recertification requirement; other EIC requirements remain separate', {
          'Required filer histories': String(filers.length), 'Current statutory ban': barred ? 'Yes' : 'No',
          'Current Form8862 required': required ? 'Yes' : 'No',
        });
  return { sourceFactsComplete: true, barred, form8862Required: required,
    incomeOnlyRecertification: required && unresolved.every(record => record.source.reason === 'income_only'),
    recertificationNeededAfterBan: barred, filers, lines: audit.getLines() };
}
