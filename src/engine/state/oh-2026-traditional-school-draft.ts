/** Spec: state/oh-2026-traditional-school-draft.yaml. No return or payment qualification. */
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { OHIO_2026_BASELINE } from '@/models/ohio-2026-baseline.js';
import { Ohio2026SchoolSourcesSchema } from '@/models/ohio-2026-school-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
import { readOhio2026TraditionalSchoolOriginals } from './oh-2026-school-source.js';

const traditionalSchoolSources = z.strictObject({
  methodId: z.literal('oh-2026-traditional-school-employee-levy-draft-v1'),
  schoolSources: Ohio2026SchoolSourcesSchema,
  levyCoverageSourceReference: z.string().trim().min(1),
  levyInEffectAllYearConfirmed: z.literal(true),
  roundingElection: z.literal('whole_dollars'),
  roundingElectionConfirmed: z.literal(true),
});

export interface Ohio2026TraditionalSchoolDraftResult {
  taxYear: 2026;
  ruleVersion: 'oh-2026-traditional-school-employee-levy-draft-v1';
  calculationStatus: 'incomplete';
  reviewStatus: 'independent-review-pending';
  filingQualified: false;
  districtCode: string;
  taxBase: 'traditional';
  rate: Decimal;
  roundingElection: 'whole_dollars';
  modifiedAdjustedGrossIncome: Decimal;
  exemptions: Decimal;
  taxableIncome: Decimal;
  rawTaxBeforeCredits: Decimal;
  reportedTaxBeforeCredits: Decimal;
  lines: CalculatedLine[];
}

export function calculateOhio2026TraditionalSchoolDraft(input: TaxYearInput, raw: unknown): Ohio2026TraditionalSchoolDraftResult {
  const parsed = traditionalSchoolSources.safeParse(raw);
  if (!parsed.success) throw new Error('Ohio 2026 traditional school draft requires complete actual levy and election facts.');
  const sources = parsed.data;
  const actual = readOhio2026TraditionalSchoolOriginals(input, sources.schoolSources);
  // The verified full-year wage-only sources establish both A28 and A34 at zero.
  const magi = actual.residentCompensation;
  if (!magi.isInteger()) throw new Error('Ohio 2026 traditional school draft requires whole-dollar aggregate wages.');

  const { exemptionTiers, exemptionMagiLimit } = OHIO_2026_BASELINE;
  const tier = exemptionTiers.find(({ maximumMagi }) => maximumMagi === null || magi.lte(maximumMagi));
  if (!tier) throw new Error('Ohio 2026 traditional school exemption rule data is incomplete.');
  const exemptions = magi.lt(exemptionMagiLimit) ? tier.amount : new Decimal(0);
  const taxableIncome = Decimal.max(0, magi.minus(exemptions));
  const rate = new Decimal(actual.rate);
  const rawTaxBeforeCredits = taxableIncome.times(rate);
  const reportedTaxBeforeCredits = roundDollar(rawTaxBeforeCredits);

  const audit = new AuditTrail();
  const form = 'Ohio 2026 traditional school draft';
  audit.record(form, 'school-base', 'Traditional school taxable income', taxableIncome,
    'R.C. 5748.01(E)(1) and 5747.025: maximum of zero and statutory MAGI minus the actual exemption.',
    { modifiedAdjustedGrossIncome: magi, exemptions });
  audit.record(form, 'school-levy', 'Traditional school levy before credits', reportedTaxBeforeCredits,
    'R.C. 5747.021 and 5703.055: actual school taxable income times the certified rate, rounded under the whole-dollar election.',
    { taxableIncome, rate, rawTaxBeforeCredits });

  return { taxYear: 2026, ruleVersion: sources.methodId, calculationStatus: 'incomplete', reviewStatus: 'independent-review-pending',
    filingQualified: false, districtCode: actual.districtCode, taxBase: 'traditional', rate, roundingElection: sources.roundingElection,
    modifiedAdjustedGrossIncome: magi, exemptions, taxableIncome, rawTaxBeforeCredits, reportedTaxBeforeCredits, lines: audit.getLines() };
}
