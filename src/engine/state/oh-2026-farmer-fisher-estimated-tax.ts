import { z } from 'zod';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

const grossAmount = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/u);
const sources = z.strictObject({
  taxYear: z.literal(2026),
  calendarYearIndividualConfirmed: z.literal(true),
  classifiedCurrentYearGrossEstimatesConfirmed: z.literal(true),
  ordinaryOhioDeclarationRequiredConfirmed: z.literal(true),
  noExtensionOrOtherReliefConfirmed: z.literal(true),
  schoolDistrictTaxApplicability: z.enum(['tax-applies', 'no-tax-applies']),
  estimatedGrossFarmIncome: grossAmount,
  estimatedGrossFishingIncome: grossAmount,
  estimatedTotalGrossIncome: grossAmount,
  federalMethod: z.strictObject({
    taxYear: z.literal(2026),
    usedBySameIndividualConfirmed: z.literal(true),
    method: z.enum(['full-estimate', 'early-return-and-full-tax']),
  }),
});

type OhioTax = 'ohio-individual' | 'ohio-school-district';
type Timetable = {
  method: 'full-estimate';
  requirements: { tax: OhioTax; fullEstimatedTaxDueBy: '2027-01-15'; annualReturnAndRemainingBalanceDueBy: '2027-04-15' }[];
} | {
  method: 'early-return-and-full-tax';
  requirements: { tax: OhioTax; annualReturnAndFullTaxDueBy: '2027-03-01' }[];
};

interface OhioFarmerFisherTaxTiming {
  kind: 'oh-2026-farmer-fisher-estimated-tax-timing-only';
  timetable: Timetable | null;
  lines: CalculatedLine[];
}

/** Return the dates for the confirmed matching Ohio alternative without calculating tax or assessing compliance. */
export function estimateOhio2026FarmerFisherTaxTiming(input: z.input<typeof sources>): OhioFarmerFisherTaxTiming {
  const source = sources.parse(input);
  const farming = d(source.estimatedGrossFarmIncome);
  const fishing = d(source.estimatedGrossFishingIncome);
  const total = d(source.estimatedTotalGrossIncome);
  if (farming.gt(total) || fishing.gt(total)) {
    throw new RangeError('Estimated category gross income cannot exceed total estimated gross income.');
  }
  if (farming.gt(0) && fishing.gt(0)) {
    throw new RangeError('This timetable requires a single positive farm or fishing category.');
  }

  const category = farming.plus(fishing);
  const qualifies = total.gt(0) && category.times(3).gte(total.times(2));
  const audit = new AuditTrail();
  audit.record('Ohio Adm.Code 5703-7-04', 'B(1)', '2026 Ohio estimated gross income test', d(qualifies ? 1 : 0),
    'Positive total gross and three times the single category is at least twice the total', {
      'Estimated gross farm income': farming,
      'Estimated gross fishing income': fishing,
      'Estimated total gross income': total,
    });
  const result: OhioFarmerFisherTaxTiming = {
    kind: 'oh-2026-farmer-fisher-estimated-tax-timing-only', timetable: null, lines: audit.getLines(),
  };
  if (!qualifies) return result;

  const taxes: OhioTax[] = ['ohio-individual'];
  if (source.schoolDistrictTaxApplicability === 'tax-applies') taxes.push('ohio-school-district');
  const { method } = source.federalMethod;
  const timetable: Timetable = method === 'full-estimate'
    ? { method, requirements: taxes.map(tax => ({
      tax, fullEstimatedTaxDueBy: '2027-01-15', annualReturnAndRemainingBalanceDueBy: '2027-04-15',
    })) }
    : { method, requirements: taxes.map(tax => ({ tax, annualReturnAndFullTaxDueBy: '2027-03-01' })) };
  return { ...result, timetable };
}
