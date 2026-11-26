/** Standalone A34. Spec: spec/state/oh-2026-qualifying-capital-gain-draft.yaml. */
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';

// Input bounds keep every sum/product exact at this precision, independently
// of the caller's Decimal configuration. No division by a repeating units ratio.
const Exact = Decimal.clone({ precision: 80 });
// These are stable documentary IDs, not proof of an independently verified
// person. The source must reconcile aliases before confirming the annual row set.
const canonical = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();
const same = (left: string, right: string): boolean => canonical(left) === canonical(right);
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const units = z.string().regex(/^[1-9]\d{0,14}$/u);
const reference = z.string().min(1).max(200).refine(value => value.trim() === value && canonical(value).length > 0);
const confirmed = z.literal(true);
const date = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const identity = { ownerReference: reference, entityReference: reference, saleReference: reference };
const source = { sourceReference: reference };
const payrollFields = {
  entityReference: reference, ...source, withholdingBaseReconciliationConfirmed: confirmed, stableRecipientIdentitiesConfirmed: confirmed,
  recipients: z.array(z.strictObject({ recipientReference: reference, ...source, originalPayrollRowReference: reference,
    relationship: z.enum(['taxpayer', 'spouse', 'parent', 'grandparent', 'child', 'grandchild', 'not-enumerated']),
    relationshipConfirmed: confirmed, compensationPaid: money, compensationUsedFor5747_06A: money })).max(1000),
};
const salePacket = z.strictObject({
  taxYear: z.literal(2026), calendarYearConfirmed: confirmed, asOfDate: date, ownerReference: reference,
  sale: z.strictObject({ ...identity, ...source, date, capitalGain: money,
    directEquitySaleConfirmed: confirmed, onlySaleForOwnerConfirmed: confirmed, equalRightsSingleClassConfirmed: confirmed }),
  recognition: z.strictObject({ ...identity, ...source, taxYear: z.literal(2026), saleDate: date,
    reportedToIrsConfirmed: confirmed, currentGainInclusionAndExclusionsComplete: confirmed,
    noInstallmentOrDeferredRecognitionConfirmed: confirmed, noUnresolvedCapitalLossNettingConfirmed: confirmed,
    reportedCapitalGain: money, includedFederalAgi: money, otherwiseOhioDeductedOrExcluded: money }),
  entity: z.strictObject({ entityReference: reference, ...source,
    organizationMethod: z.enum(['incorporated', 'registered', 'organized']),
    ohioOrganizationFrom: date, ohioOrganizationThrough: date, ohioHeadquartersFrom: date, ohioHeadquartersThrough: date,
    continuousHistoryConfirmed: confirmed, ohioTradeOrBusinessAtSaleConfirmed: confirmed }),
  ownership: z.strictObject({ ...identity, ...source, totalEntityUnits: units, ownerUnitsBefore: units, unitsSold: units,
    percentageOfEntireEntitySold: z.string().regex(/^\d{1,3}(?:\.\d{1,8})?$/u), completeCapitalizationAndTransferConfirmed: confirmed }),
});
const materialParticipationPacket = salePacket.extend({
  // A completed documentary assessment is an input boundary, not a substitute
  // implementation of all federal participation, grouping and partner rules.
  participation: z.strictObject({ ownerReference: reference, entityReference: reference, ...source,
    method: z.literal('5747.79(A)(1)(a)(i)'), coveredFrom: date, coveredThrough: date,
    federalCriterion: z.enum(['a1', 'a2', 'a3', 'a4', 'a7']), completeApplicableFederalConditionsConfirmed: confirmed }),
  payroll: z.array(z.strictObject({ ...payrollFields, year: z.number().int().min(2021).max(2025),
    completeAnnualCompensationConfirmed: confirmed, annual5747_06ACompensation: money,
  })).length(5),
});
const investorAndCompany = { ownerReference: reference, entityReference: reference, ...source };
const ventureInvestmentPacket = salePacket.extend({
  ventureInvestment: z.strictObject({ ...investorAndCompany, fundedAndAcquiredOn: date, agreedCashAmount: money,
    acquiredUnits: units, continuousUnchangedHoldingConfirmed: confirmed,
    fundingOriginal: z.strictObject({ ...investorAndCompany, paidOn: date, amount: money }),
    companyAssessment: z.strictObject({ entityReference: reference, ...source, asOfDate: date,
      operatingCompanyConfirmed: confirmed, ventureCapitalOperatingCompany: z.literal(false) }),
    rightsOriginal: z.strictObject({ ...investorAndCompany, effectiveFrom: date, effectiveThrough: date,
      directContractConfirmed: confirmed, right: z.enum(['substantial-participation', 'substantial-influence']),
      continuouslyInEffectThroughSaleConfirmed: confirmed }),
  }),
  investmentPayroll: z.strictObject({ ...payrollFields, paidFrom: date, paidThrough: date, completePeriodCompensationConfirmed: confirmed,
    noCompensationPaidOnInvestmentOrSaleDatesConfirmed: confirmed, period5747_06ACompensation: money }),
});
const packet = z.union([materialParticipationPacket, ventureInvestmentPacket]);

interface QualifyingCapitalGainDraft {
  sourceStatus: 'admitted-draft' | 'incomplete';
  calculationStatus: 'incomplete';
  filingQualified: false;
  exportAllowed: false;
  incompleteReason: 'missing-or-invalid-sources' | 'conflicting-sources' | null;
  qualifyingGain: Decimal | null;
  qualifyingPayroll: Decimal | null;
  excludedFamilyPayroll: Decimal | null;
  deductiblePayroll: Decimal | null;
  deduction: Decimal | null;
  lines: CalculatedLine[];
}

function incomplete(reason: 'missing-or-invalid-sources' | 'conflicting-sources'): QualifyingCapitalGainDraft {
  return { sourceStatus: 'incomplete', calculationStatus: 'incomplete', filingQualified: false, exportAllowed: false,
    incompleteReason: reason, qualifyingGain: null, qualifyingPayroll: null, excludedFamilyPayroll: null,
    deductiblePayroll: null, deduction: null, lines: [] };
}

/**
 * Compute one documentary sale under either supported A34 method. Missing/conflicting facts
 * return unknown amounts; source references are never returned or interpreted
 * as authenticated documents. Caller must separately complete return integration.
 */
export function calculateOhio2026QualifyingCapitalGainDraft(raw: unknown): QualifyingCapitalGainDraft {
  const parsed = packet.safeParse(raw);
  if (!parsed.success) return incomplete('missing-or-invalid-sources');
  const p = parsed.data, { sale, recognition, entity, ownership } = p;
  const fiveYearsBefore = `2021${sale.date.slice(4)}`;
  const conflicts = () => incomplete('conflicting-sources');
  if (!sale.date.startsWith('2026-') || p.asOfDate <= '2026-12-31' || sale.date > p.asOfDate
    || recognition.saleDate !== sale.date || !same(sale.ownerReference, p.ownerReference)
    || !same(recognition.ownerReference, p.ownerReference) || !same(ownership.ownerReference, p.ownerReference)
    || !same(recognition.entityReference, sale.entityReference) || !same(ownership.entityReference, sale.entityReference)
    || !same(entity.entityReference, sale.entityReference)
    || !same(recognition.saleReference, sale.saleReference) || !same(ownership.saleReference, sale.saleReference)
    || entity.ohioOrganizationFrom > fiveYearsBefore || entity.ohioHeadquartersFrom > fiveYearsBefore
    || entity.ohioOrganizationThrough < sale.date || entity.ohioHeadquartersThrough < sale.date
    || entity.ohioOrganizationThrough > p.asOfDate || entity.ohioHeadquartersThrough > p.asOfDate) return conflicts();

  const reported = new Exact(recognition.reportedCapitalGain), included = new Exact(recognition.includedFederalAgi);
  const otherExclusions = new Exact(recognition.otherwiseOhioDeductedOrExcluded);
  const totalUnits = new Exact(ownership.totalEntityUnits), soldUnits = new Exact(ownership.unitsSold);
  const ownUnits = new Exact(ownership.ownerUnitsBefore), percentage = new Exact(ownership.percentageOfEntireEntitySold);
  if (!reported.gt(0) || !reported.eq(sale.capitalGain) || included.gt(reported) || otherExclusions.gt(included)
    || soldUnits.gt(ownUnits) || ownUnits.gt(totalUnits) || !percentage.gt(0) || percentage.gt(100)
    || !totalUnits.times(percentage).eq(soldUnits.times(100))) return conflicts();

  const audit = new AuditTrail();
  let payrollPeriods: { entityReference: string; withholdingBase: string; recipients: z.infer<typeof payrollFields.recipients> }[];
  let familyPayrollPeriod = '2021–2025';
  let qualifyingPayrollDescription = 'Sum of2021–2025 source-reconciled5747.06(A) compensation excluding enumerated family';
  if ('participation' in p) {
    const { participation, payroll } = p;
    if (!same(participation.ownerReference, p.ownerReference) || !same(participation.entityReference, sale.entityReference)
      || participation.coveredFrom !== fiveYearsBefore || participation.coveredThrough !== sale.date
      || new Set(payroll.map(record => record.year)).size !== payroll.length) return conflicts();
    payrollPeriods = payroll.map(({ entityReference, recipients, annual5747_06ACompensation }) => ({
      entityReference, recipients, withholdingBase: annual5747_06ACompensation,
    }));
  } else {
    const { ventureInvestment, investmentPayroll } = p;
    const { fundingOriginal, companyAssessment, rightsOriginal, fundedAndAcquiredOn } = ventureInvestment;
    const investment = new Exact(fundingOriginal.amount);
    const lastPayrollDate = new Date(`${sale.date}T00:00:00Z`);
    lastPayrollDate.setUTCDate(lastPayrollDate.getUTCDate() - 1);
    // This cohort touches at most five calendar years and requires both
    // closing dates to have no compensation payments.
    if (fundedAndAcquiredOn < '2022-01-01' || fundedAndAcquiredOn >= sale.date
      || fundingOriginal.paidOn !== fundedAndAcquiredOn || companyAssessment.asOfDate !== fundedAndAcquiredOn
      || rightsOriginal.effectiveFrom > fundedAndAcquiredOn || rightsOriginal.effectiveThrough < sale.date
      || investmentPayroll.paidFrom !== fundedAndAcquiredOn || investmentPayroll.paidThrough !== lastPayrollDate.toISOString().slice(0, 10)
      || !investment.eq(ventureInvestment.agreedCashAmount) || investment.lt('1000000')
      || !ownUnits.eq(ventureInvestment.acquiredUnits)
      || ![ventureInvestment, fundingOriginal, rightsOriginal].every(record => same(record.ownerReference, p.ownerReference))
      || ![ventureInvestment, fundingOriginal, rightsOriginal, companyAssessment].every(record => same(record.entityReference, sale.entityReference))) return conflicts();
    payrollPeriods = [{ entityReference: investmentPayroll.entityReference, recipients: investmentPayroll.recipients,
      withholdingBase: investmentPayroll.period5747_06ACompensation }];
    familyPayrollPeriod = 'Investment-period';
    qualifyingPayrollDescription = 'Investment-period source-reconciled R.C. 5747.06(A) compensation excluding enumerated family';
    audit.record('OH2026 qualifying capital gain draft', 'A34-venture-investment', 'Documented direct venture capital investment', investment,
      'Reconciled cash funding of at least $1,000,000 with a qualifying direct contractual management right');
  }

  let qualifyingPayroll = new Exact(0), excludedFamilyPayroll = new Exact(0);
  for (const period of payrollPeriods) {
    if (!same(period.entityReference, sale.entityReference)) return conflicts();
    const recipients = new Set<string>();
    const originalRows = new Set<string>();
    let periodBase = new Exact(0);
    for (const row of period.recipients) {
      const recipient = canonical(row.recipientReference), originalRow = canonical(row.originalPayrollRowReference);
      if (recipients.has(recipient) || originalRows.has(originalRow)
        || (row.relationship === 'taxpayer') !== same(row.recipientReference, p.ownerReference)) return conflicts();
      recipients.add(recipient);
      originalRows.add(originalRow);
      const base = new Exact(row.compensationUsedFor5747_06A);
      if (base.gt(row.compensationPaid)) return conflicts();
      periodBase = periodBase.plus(base);
      if (row.relationship === 'not-enumerated') qualifyingPayroll = qualifyingPayroll.plus(base);
      else excludedFamilyPayroll = excludedFamilyPayroll.plus(base);
    }
    if (!periodBase.eq(period.withholdingBase)) return conflicts();
  }
  const qualifyingGain = included.minus(otherExclusions);
  const deductiblePayroll = qualifyingPayroll.times(percentage).div(100);
  const deduction = qualifyingGain.lt(deductiblePayroll) ? qualifyingGain : deductiblePayroll;
  audit.record('OH2026 qualifying capital gain draft', 'qualifying-gain', 'Previously unexcluded reported gain', qualifyingGain,
    'Federal AGI gain less other Ohio deductions or exclusions', { 'Included federal gain': included, 'Other Ohio exclusions': otherExclusions });
  audit.record('OH2026 qualifying capital gain draft', 'family-payroll', 'Excluded enumerated family compensation', excludedFamilyPayroll,
    `${familyPayrollPeriod} qualified withholding compensation paid to taxpayer, spouse, parents, grandparents, children and grandchildren`);
  audit.record('OH2026 qualifying capital gain draft', 'qualifying-payroll', 'Entity qualifying payroll', qualifyingPayroll,
    qualifyingPayrollDescription);
  audit.record('OH2026 qualifying capital gain draft', 'deductible-payroll', 'Payroll attributable to whole-entity percentage sold', deductiblePayroll,
    'Qualifying payroll × percentage of entire entity sold /100', { 'Qualifying payroll': qualifyingPayroll, 'Entire entity percentage sold': percentage });
  audit.record('OH2026 qualifying capital gain draft', 'A34', 'Single-sale qualifying capital gain deduction', deduction,
    'Lesser of qualifying gain and deductible payroll; before A28 BID, no A35 calculation', { 'Qualifying gain': qualifyingGain, 'Deductible payroll': deductiblePayroll });
  return { sourceStatus: 'admitted-draft', calculationStatus: 'incomplete', filingQualified: false, exportAllowed: false,
    incompleteReason: null, qualifyingGain, qualifyingPayroll, excludedFamilyPayroll, deductiblePayroll, deduction, lines: audit.getLines() };
}
