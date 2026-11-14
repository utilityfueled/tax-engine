import type Decimal from 'decimal.js';
import { z } from 'zod';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

interface OrdinaryEstimateInput {
  taxYear: number;
  determinedOn: string;
  originalSingleCalendarYearFullYearResidentConfirmed: boolean;
  subjectToOhioTaxAtYearStartConfirmed: boolean;
  noFarmerOrFisherSpecialRuleConfirmed: boolean;
  completeOhioIndividualTaxEstimateUnder2026LawConfirmed: boolean;
  noOhioTaxCreditsConfirmed: boolean;
  noOhioSchoolDistrictTaxLiabilityConfirmed: boolean;
  noOhioCompensationWithholdingConfirmed: boolean;
  noPrecedingOhioReturnConfirmed: boolean;
  noPriorRefundAppliedConfirmed: boolean;
  noEstimatedPaymentsAlreadyMadeConfirmed: boolean;
  estimatedOhioIndividualTax: string;
}

const completeSources = z.strictObject({
  taxYear: z.literal(2026),
  determinedOn: z.iso.date().refine(date => date >= '2026-01-01' && date <= '2026-04-15'),
  originalSingleCalendarYearFullYearResidentConfirmed: z.literal(true),
  subjectToOhioTaxAtYearStartConfirmed: z.literal(true),
  noFarmerOrFisherSpecialRuleConfirmed: z.literal(true),
  completeOhioIndividualTaxEstimateUnder2026LawConfirmed: z.literal(true),
  noOhioTaxCreditsConfirmed: z.literal(true),
  noOhioSchoolDistrictTaxLiabilityConfirmed: z.literal(true),
  noOhioCompensationWithholdingConfirmed: z.literal(true),
  noPrecedingOhioReturnConfirmed: z.literal(true),
  noPriorRefundAppliedConfirmed: z.literal(true),
  noEstimatedPaymentsAlreadyMadeConfirmed: z.literal(true),
  estimatedOhioIndividualTax: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/u),
});

const targetSchedule = [
  { dueBy: '2026-04-15', fraction: '0.225', line: 'C(1)' },
  { dueBy: '2026-06-15', fraction: '0.45', line: 'C(2)' },
  { dueBy: '2026-09-15', fraction: '0.675', line: 'C(3)' },
  { dueBy: '2027-01-15', fraction: '0.90', line: 'C(4)' },
] as const;

interface EstimateInstallment {
  dueBy: (typeof targetSchedule)[number]['dueBy'];
  amount: Decimal;
  cumulativeAmount: Decimal;
}

type OrdinaryEstimate = {
  kind: 'oh-2026-ordinary-estimated-tax-planning-only';
  estimatedOhioCombinedTax: Decimal;
  lines: CalculatedLine[];
} & ({ declarationRequired: false } | {
  declarationRequired: true;
  firstDeclarationDueBy: typeof targetSchedule[0]['dueBy'];
  installments: EstimateInstallment[];
});

/** Calculate only ordinary 2026 Ohio planning targets from a separately established tax estimate. */
export function estimateOhio2026OrdinaryTax(input: OrdinaryEstimateInput): OrdinaryEstimate {
  const source = completeSources.parse(input);
  const estimatedOhioCombinedTax = d(source.estimatedOhioIndividualTax);
  const kind = 'oh-2026-ordinary-estimated-tax-planning-only' as const;
  const zero = d(0);
  const threshold = d('500');
  const declarationRequired = estimatedOhioCombinedTax.gt(threshold);
  const audit = new AuditTrail();
  const form = 'Ohio IT 1040 ES';
  const statute = 'Ohio Revised Code 5747.09';

  audit.record(form, '8', 'Estimated Ohio individual income tax liability', estimatedOhioCombinedTax,
    'Separately established 2026 tax with no Ohio credits', { 'Determination date': source.determinedOn });
  audit.record(statute, 'B', 'Estimated combined tax after Ohio compensation withholding', estimatedOhioCombinedTax,
    'Require an original declaration only when the amount exceeds $500',
    { 'Estimated school district tax': zero, 'Estimated Ohio withholding': zero, 'Threshold': threshold });

  if (!declarationRequired) {
    return { kind, estimatedOhioCombinedTax, declarationRequired, lines: audit.getLines() };
  }

  const estimatedRequiredPayment = estimatedOhioCombinedTax.times('0.90');
  const amount = estimatedRequiredPayment.times('0.25');
  audit.record(form, '10', 'Ninety percent of estimated 2026 income tax', estimatedRequiredPayment, 'Line 8 × 0.90');
  audit.record(form, '11', 'Current-year method', estimatedRequiredPayment, 'Use line 10 when no 2025 return was filed');
  audit.record(form, '12', '2025 credit carryforward and expected 2026 withholding', zero, 'Confirmed none');
  audit.record(form, '13', 'Estimated required annual payment', estimatedRequiredPayment, 'Line 11 − line 12');
  audit.record(form, '14', 'Quarterly estimated payment target', amount, 'Line 13 × 0.25');

  const installments = targetSchedule.map(({ dueBy, fraction, line }) => {
    const cumulativeAmount = estimatedOhioCombinedTax.times(fraction);
    audit.record(statute, line, 'Cumulative current-year target', cumulativeAmount,
      'Estimated Ohio tax liability × cumulative fraction', { dueBy, fraction });
    return { dueBy, amount, cumulativeAmount };
  });

  return { kind, estimatedOhioCombinedTax, declarationRequired, firstDeclarationDueBy: targetSchedule[0].dueBy,
    installments, lines: audit.getLines() };
}
