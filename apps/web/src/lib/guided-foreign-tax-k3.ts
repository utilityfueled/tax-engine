/** Actual portfolio-only qualified K3 originals; spec/federal/foreign-tax-direct-credit.yaml. */
import { ForeignTaxK3OrdinaryProofSchema, ScheduleK1Schema, type ScheduleK1 } from '@/models/inputs';
import { calculatePartnerBasisSchedule } from '@/engine/forms/partner-basis-schedule';
import { d } from '@/utils/decimal';
import { parseGuidedCurrency } from './guided-currency';
import type { GuidedFlowState } from './guided-interview-flow';
import type { ForeignTaxElectionData, ForeignTaxSourceData } from './guided-foreign-tax-election';

export interface GuidedForeignTaxK3StatementData {
  sourceTaxYear?: string; entityType?: 'partnership' | 's_corporation'; partnershipName?: string; partnershipEIN?: string;
  accountHolder?: 'primary' | 'spouse'; recipientName?: string; recipientTaxpayerIdLast4?: string;
  originalK1Reference?: string; qualifiedStatementKind?: 'schedule_k3_1065' | 'bare_k1'; qualifiedK3Reference?: string;
  foreignCountry?: string; foreignTaxCategory?: 'passive' | 'general';
  interestIncome?: string; ordinaryDividends?: string; qualifiedDividends?: string; foreignSourceIncome?: string;
  foreignTaxPaid?: string; beginningBasis?: string; beginningBasisSourceReference?: string;
  calendarYearPartnershipConfirmed?: boolean | null; usdReportedPaidTaxesConfirmed?: boolean | null; usdPaidTaxSourceReference?: string;
  entityPaidTaxPayments?: Array<{ date?: string; amountUsd?: string }>;
  foreignDeductions?: string; foreignInterestExpense?: string; otherExpenses?: string; taxReduction?: string; redeterminationAmount?: string;
  domesticContinuingNonPtpConfirmed?: boolean | null; portfolioIncomeOnlyConfirmed?: boolean | null;
  allOtherK1AmountsZeroConfirmed?: boolean | null; noOtherBasisChangesConfirmed?: boolean | null;
  priorBasisSuspensionsZeroConfirmed?: boolean | null; priorAtRiskSuspensionsZeroConfirmed?: boolean | null;
  priorPassiveSuspensionsZeroConfirmed?: boolean | null; sourceFactsConfirmed?: boolean | null;
}
const KEYS = new Set(['sourceTaxYear', 'entityType', 'partnershipName', 'partnershipEIN', 'accountHolder', 'recipientName', 'recipientTaxpayerIdLast4',
  'originalK1Reference', 'qualifiedStatementKind', 'qualifiedK3Reference', 'foreignCountry', 'foreignTaxCategory',
  'interestIncome', 'ordinaryDividends', 'qualifiedDividends', 'foreignSourceIncome', 'foreignTaxPaid', 'beginningBasis', 'beginningBasisSourceReference',
  'calendarYearPartnershipConfirmed', 'usdReportedPaidTaxesConfirmed', 'usdPaidTaxSourceReference', 'entityPaidTaxPayments',
  'foreignDeductions', 'foreignInterestExpense', 'otherExpenses', 'taxReduction', 'redeterminationAmount',
  'domesticContinuingNonPtpConfirmed', 'portfolioIncomeOnlyConfirmed', 'allOtherK1AmountsZeroConfirmed', 'noOtherBasisChangesConfirmed',
  'priorBasisSuspensionsZeroConfirmed', 'priorAtRiskSuspensionsZeroConfirmed', 'priorPassiveSuspensionsZeroConfirmed', 'sourceFactsConfirmed']);
const ORDINARY_ONLY_KEYS = new Set(['foreignDeductions', 'foreignInterestExpense', 'otherExpenses', 'taxReduction', 'redeterminationAmount',
  'calendarYearPartnershipConfirmed', 'usdReportedPaidTaxesConfirmed', 'usdPaidTaxSourceReference', 'entityPaidTaxPayments']);
const CONFIRMATIONS = ['domesticContinuingNonPtpConfirmed', 'portfolioIncomeOnlyConfirmed', 'allOtherK1AmountsZeroConfirmed', 'noOtherBasisChangesConfirmed',
  'priorBasisSuspensionsZeroConfirmed', 'priorAtRiskSuspensionsZeroConfirmed', 'priorPassiveSuspensionsZeroConfirmed', 'sourceFactsConfirmed'] as const;
function text(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter the actual qualified K3 ${label}.`);
  return value.trim();
}
function amount(value: string | undefined, label: string): string {
  const raw = text(value, `${label}, including zero when known`);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) throw new Error(`Enter an actual nonnegative qualified K3 ${label}.`);
  const parsed = parseGuidedCurrency(raw);
  if (!parsed.isFinite() || parsed.lt(0)) throw new Error(`Enter a finite nonnegative qualified K3 ${label}.`);
  return parsed.toFixed();
}
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();
export function snapshotGuidedK3Source(row: GuidedForeignTaxK3StatementData, index: number): ForeignTaxSourceData {
  return { sourceId: `scheduleK1:${index}`, payerName: row.partnershipName, payerTin: row.partnershipEIN,
    owner: row.accountHolder, foreignCountry: row.foreignCountry, reportedTaxAmount: row.foreignTaxPaid,
    ...(row.qualifiedStatementKind === 'schedule_k3_1065' ? { qualifiedPayeeStatement: 'schedule_k3' as const } : {}), sourceReference: row.qualifiedK3Reference };
}
const ORDINARY_AMOUNTS = ['foreignDeductions','foreignInterestExpense','otherExpenses','taxReduction','redeterminationAmount'] as const;
export function normalizeGuidedK3OrdinaryProof(proof: NonNullable<NonNullable<NonNullable<NonNullable<import('@/models/inputs').TaxYearInput['foreignTaxElection']>['creditWithForm1116']>['incomeSources']>[number]['qualifiedPartnership']>) {
  return { ...proof, ...Object.fromEntries(ORDINARY_AMOUNTS.map(key => [key, amount(proof[key], `original ${key}`)])), entityPaidTaxPayments: proof.entityPaidTaxPayments?.map(row => ({ ...row, amountUsd: amount(row.amountUsd, 'entity-paid USD tax') })) };
}
/** Snapshot actual originals only; blank amounts and confirmations remain unknown. */
export function snapshotGuidedK3OrdinaryIncome(row: GuidedForeignTaxK3StatementData, index: number) {
  const proof = { sourceTaxYear: /^\d{4}$/.test(row.sourceTaxYear ?? '') ? Number(row.sourceTaxYear) : undefined,
    originalK1Reference: row.originalK1Reference, qualifiedK3Reference: row.qualifiedK3Reference, beginningBasisSourceReference: row.beginningBasisSourceReference,
    usdPaidTaxSourceReference: row.usdPaidTaxSourceReference, entityPaidTaxPayments: row.entityPaidTaxPayments?.map(item => ({ ...item })),
    calendarYearPartnershipConfirmed: typeof row.calendarYearPartnershipConfirmed === 'boolean' ? row.calendarYearPartnershipConfirmed : undefined, usdReportedPaidTaxesConfirmed: typeof row.usdReportedPaidTaxesConfirmed === 'boolean' ? row.usdReportedPaidTaxesConfirmed : undefined,
    ...Object.fromEntries(ORDINARY_AMOUNTS.map(key => [key, row[key]])),
    ...Object.fromEntries(CONFIRMATIONS.map(key => [key, typeof row[key] === 'boolean' ? row[key] : undefined])) };
  return { sourceId: `scheduleK1:${index}`, payerName: row.partnershipName, payerTin: row.partnershipEIN, owner: row.accountHolder,
    foreignCountry: row.foreignCountry, reportedIncome: row.interestIncome, foreignIncome: row.foreignSourceIncome,
    sourceReference: row.qualifiedK3Reference, qualifiedPartnership: proof };
}
/** No annual election or source row is inferred from a small tax or a bare K1. */
export function buildGuidedForeignTaxK3Sources(state: GuidedFlowState, election: ForeignTaxElectionData | undefined = state.sectionData['other-taxes']?.foreignTaxElection): ScheduleK1[] {
  if (!election || election.qualifiedK3Statements === undefined) return [];
  const rows = election.qualifiedK3Statements;
  if (!Array.isArray(rows)) throw new Error('Record the actual qualified K3 original statement list.');
  if (!rows.length) return [];
  const { taxYear, segmentation, sectionData } = state;
  const personal = sectionData['personal-info'];
  if ((taxYear !== 2025 && taxYear !== 2026) || !segmentation.filingStatus || !personal) throw new Error('Qualified K3 originals need the actual supported return year and household.');
  if (sectionData.adjustments?.k1LossSources !== undefined || sectionData.deductions?.k1CharitableSources !== undefined) throw new Error('Qualified portfolio K3 sources cannot combine with separate qualified-loss or charitable K1 packets.');
  const ordinary = election.creditWithForm1116 !== undefined && election.creditWithoutForm1116 === undefined;
  if (election.election !== 'credit' || (!ordinary && (!election.creditWithoutForm1116 || election.creditWithForm1116 !== undefined))) throw new Error('Qualified K3 originals require one actual supported credit election.');
  if (ordinary && (taxYear !== 2025 || segmentation.filingStatus !== 'single' || rows.length !== 1)) throw new Error('Ordinary K3 originals require one primary2025 single-return partnership.');
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !KEYS.has(key) || (!ordinary && ORDINARY_ONLY_KEYS.has(key)))) throw new Error('Qualified K3 original has an unsupported source field; retain its separate method.');
    if (row.sourceTaxYear !== String(taxYear) || row.entityType !== 'partnership' || row.qualifiedStatementKind !== 'schedule_k3_1065'
      || row.foreignTaxCategory !== 'passive' || CONFIRMATIONS.some(key => row[key] !== true)) throw new Error('Confirm the actual year, qualified Schedule K3, passive portfolio-only partnership and complete zero-history source facts after the last edit.');
    const owner = row.accountHolder === 'primary' ? personal : row.accountHolder === 'spouse' && segmentation.filingStatus === 'mfj' ? personal.spouse : undefined;
    if (!owner || normalize(text(row.recipientName, 'original recipient name')) !== normalize([owner.firstName, 'middleName' in owner ? owner.middleName : undefined, owner.lastName].filter(Boolean).join(' '))
      || !/^\d{9}$/.test(owner.ssn.replaceAll('-', '')) || !/^\d{4}$/.test(row.recipientTaxpayerIdLast4 ?? '')
      || row.recipientTaxpayerIdLast4 !== owner.ssn.replaceAll('-', '').slice(-4)) throw new Error('Qualified K3 original owner and recipient identity must match the actual return taxpayer.');
    const name = text(row.partnershipName, 'partnership name'), ein = text(row.partnershipEIN, 'partnership EIN').replaceAll('-', '');
    if (!/^\d{9}$/.test(ein)) throw new Error('Enter the actual qualified K3 partnership EIN.');
    for (const [value, label] of [[row.originalK1Reference, 'original K1 reference'], [row.qualifiedK3Reference, 'qualified K3 reference'], [row.beginningBasisSourceReference, 'opening outside basis reference']] as const) text(value, label);
    const key = `${row.accountHolder}:${ein}`;
    if (seen.has(key)) throw new Error('Duplicate qualified K3 entity and owner requires its separate source method.');
    seen.add(key);
    const country = text(row.foreignCountry, 'foreign country');
    const source = election.sources?.find(item => item.sourceId === `scheduleK1:${index}`);
    if (!source || normalize(text(source.foreignCountry, 'annual source country')) !== normalize(country) || text(source.sourceReference, 'annual K3 source reference') !== row.qualifiedK3Reference?.trim()) throw new Error('Every actual qualified K3 foreign income source needs its matching annual country record, including zero-tax income.');
    const interest = amount(row.interestIncome, 'original interest'), dividends = amount(row.ordinaryDividends, 'original ordinary dividends'), qualified = amount(row.qualifiedDividends, 'original qualified-dividend subset');
    const foreignIncome = amount(row.foreignSourceIncome, 'original foreign gross income'), tax = amount(row.foreignTaxPaid, 'original foreign tax');
    if (d(qualified).gt(dividends) || !d(foreignIncome).eq(d(interest).plus(dividends))) throw new Error('Qualified K3 portfolio income must reconcile to actual interest plus ordinary dividends, with qualified dividends only a subset; mixed source allocation needs a separate method.');
    if (ordinary) {
      const actual = election.creditWithForm1116?.incomeSources?.find(item => item.sourceId === `scheduleK1:${index}`);
      const expected = snapshotGuidedK3OrdinaryIncome(row, index);
      const expectedProof = ForeignTaxK3OrdinaryProofSchema.parse(normalizeGuidedK3OrdinaryProof(expected.qualifiedPartnership));
      const actualProof = actual?.qualifiedPartnership && ForeignTaxK3OrdinaryProofSchema.parse(normalizeGuidedK3OrdinaryProof(actual.qualifiedPartnership));
      if (!d(dividends).isZero() || !d(qualified).isZero() || !actualProof || JSON.stringify(actualProof) !== JSON.stringify(expectedProof)) throw new Error('Reselect the actual ordinary K3 original after its facts changed; interest-only zero allocations must be known.');
    }
    const original = ScheduleK1Schema.parse({ taxYear, entityType: 'partnership', partnershipName: name, partnershipEIN: ein, accountHolder: row.accountHolder,
      interestIncome: interest, ordinaryDividends: dividends, qualifiedDividends: qualified, foreignSourceIncome: foreignIncome, foreignTaxPaid: tax, foreignTaxCategory: 'passive',
      beginningBasis: amount(row.beginningBasis, 'opening outside basis'), priorSuspendedLosses: {},
      // Portfolio income is outside section469 passive-activity income; FTC passive category is distinct.
      isPassiveActivity: false,
      // Actual portfolio-only and zero-other-box answers establish no ordinary business/SE/QBI source.
      ordinaryIncome: '0', selfEmploymentEarnings: '0', selfEmploymentNetEarningsAfterAdjustments: '0',
    });
    const basis = calculatePartnerBasisSchedule(original), category = basis.lossCategories.find(item => item.key === 'foreignTax');
    if (!category || !category.allowed.eq(tax) || !category.suspended.isZero() || !basis.totalSuspendedLosses.isZero()) throw new Error('Qualified K3 current foreign tax must be fully basis-allowed with no suspension; a basis shortfall needs separate treatment.');
    return original;
  });
}
