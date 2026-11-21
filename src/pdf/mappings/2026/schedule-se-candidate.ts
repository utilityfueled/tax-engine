/**
 * Final 2026 Schedule SE physical mapping candidate, Created 4/27/26.
 * Spec: spec/federal/schedule-se-2026-template.yaml.
 * The bounded projection is internal and excluded from both export registries.
 */
import Decimal from 'decimal.js';
import { calculateScheduleSE } from '@/engine/schedules/schedule-se.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { d, roundDollar, zeroFloor } from '@/utils/decimal.js';
import { SCHEDULE_C_2026_CANDIDATE } from './schedule-c-candidate.js';
import { projectScheduleC2026WageringFields } from './schedule-c-wagering-projection.js';

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";

export const SCHEDULE_SE_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sse--2026.pdf",
  sourceRevision: "Created 4/27/26",
  retrievedAt: "2026-11-06T00:18:55.962869Z",
  sha256: "a42f5a19c0e84a966a49b5f4ca021d3f49c4fda2e087da0b00bf2003525f8655",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  // The printed constants are source text, not calculated or writable amounts.
  printedConstants: Object.freeze({ line7: "$184,500", line14: "$7,560" }),
  emptyPrintedAmountAnchors: Object.freeze([
    "line7PrintedAmountAnchor", "line14PrintedAmountAnchor",
  ] as const),
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    ssn: `${page1}f1_2[0]`,
    ministerForm4361: `${page1}c1_1[0]`,
    line1a: `${page1}f1_3[0]`,
    line1b: `${page1}f1_4[0]`,
    line2: `${page1}f1_5[0]`,
    line3: `${page1}f1_6[0]`,
    line4a: `${page1}f1_7[0]`,
    line4b: `${page1}f1_8[0]`,
    line4c: `${page1}f1_9[0]`,
    line5a: `${page1}f1_10[0]`,
    line5b: `${page1}f1_11[0]`,
    line6: `${page1}f1_12[0]`,
    line7PrintedAmountAnchor: `${page1}f1_13[0]`,
    line8a: `${page1}f1_14[0]`,
    line8b: `${page1}f1_15[0]`,
    line8c: `${page1}f1_16[0]`,
    line8d: `${page1}f1_17[0]`,
    line9: `${page1}f1_18[0]`,
    line10: `${page1}f1_19[0]`,
    line11: `${page1}f1_20[0]`,
    line12: `${page1}f1_21[0]`,
    line13: `${page1}f1_22[0]`,
    line14PrintedAmountAnchor: `${page2}f2_1[0]`,
    line15: `${page2}f2_2[0]`,
    line16: `${page2}f2_3[0]`,
    line17: `${page2}f2_4[0]`,
  }),
});

interface ScheduleSEWageringConfirmations {
  allSelfEmploymentAndCoveredPayrollSourcesReviewed?: boolean;
  noExemptionChurchIncomeOrOptionalMethodConfirmed?: boolean;
  completePrimaryW2OriginalsAndNoOtherCoveredPayrollConfirmed?: boolean;
}

const allowedInput = new Set<keyof TaxYearInput>([
  'taxpayer', 'scheduleC', 'standardDeductionFacts', 'deductionElection', 'w2s', 'formW2G', 'scheduleBPartThree',
]);
const emptyDocumentCollections = new Set<keyof TaxYearInput>([
  'form1099Int', 'form1099Div', 'form1099B', 'form1099DA',
  'form1099Nec', 'form1099Misc', 'form1099G', 'form1099OID', 'form1099K',
  'form1099C', 'form1099Q', 'scheduleK1', 'scheduleK1Form1041', 'form1098',
  'form1098E', 'form1095A', 'donations', 'rentalProperties', 'savingsBondRedemptions',
  'form6252', 'form8814', 'homeSales', 'form8824',
]);
const dollarsAndCents = /^\d{1,12}(?:\.\d{1,2})?$/;

function coveredPayroll(input: TaxYearInput, confirmations: ScheduleSEWageringConfirmations): Decimal {
  if (input.w2s.length && confirmations.completePrimaryW2OriginalsAndNoOtherCoveredPayrollConfirmed !== true) {
    throw new Error('Confirm the complete original W-2 payroll sources and the absence of other covered payroll');
  }
  const employers = new Set<string>();
  let total = d(0);
  for (const w2 of input.w2s) {
    if (w2.taxYear !== input.taxpayer.taxYear || w2.accountHolder !== 'primary'
      || !dollarsAndCents.test(w2.socialSecurityWages ?? '') || !dollarsAndCents.test(w2.socialSecurityTips ?? '')
      || !d(w2.allocatedTips).isZero()) {
      throw new Error('Schedule SE payroll requires current primary original W-2 Boxes 3 and 7 and separate treatment for allocated tips');
    }
    const ein = w2.employer.ein.trim();
    const employer = ein.replace('-', '');
    if (!/^\d{2}-?\d{7}$/.test(ein) || employers.has(employer)) {
      throw new Error('Schedule SE payroll requires one original W-2 per distinct employer EIN');
    }
    employers.add(employer);
    const wagesAndTips = d(w2.socialSecurityWages).plus(d(w2.socialSecurityTips));
    if (wagesAndTips.gt(FEDERAL_2026_CONSTANTS.selfEmploymentTax.socialSecurityWageBase)) {
      throw new Error('Schedule SE payroll Boxes 3 and 7 on one W-2 exceed the Social Security wage base');
    }
    total = total.plus(wagesAndTips);
  }
  return total;
}

/** Populate the disabled regular-method candidate from one confirmed wagering business. */
export function projectScheduleSE2026WageringFields(
  input: TaxYearInput, confirmations: ScheduleSEWageringConfirmations,
): Record<string, string> {
  if (confirmations.allSelfEmploymentAndCoveredPayrollSourcesReviewed !== true
    || confirmations.noExemptionChurchIncomeOrOptionalMethodConfirmed !== true) {
    throw new Error('Confirm the complete Schedule SE source inventory and regular-method eligibility');
  }
  if (Object.keys(input).some(key => {
    const field = key as keyof TaxYearInput;
    const value = input[field];
    return value !== undefined && !allowedInput.has(field)
      && !(emptyDocumentCollections.has(field) && Array.isArray(value) && value.length === 0);
  })) throw new Error('This Schedule SE candidate requires wagering and ordinary W-2 sources without other returns');

  const exactCoveredPayroll = coveredPayroll(input, confirmations);
  const scheduleC = projectScheduleC2026WageringFields(input);
  const profit = new Decimal(scheduleC[SCHEDULE_C_2026_CANDIDATE.fields.line31]);
  const result = calculateScheduleSE(input, FEDERAL_2026_CONSTANTS);
  const [owner] = result.perTaxpayer;
  if (!result.sourceFactsVerified || result.perTaxpayer.length !== 1 || owner?.accountHolder !== 'primary'
    || owner.earningsSubjectToSETax.lt('400')) {
    throw new Error('This Schedule SE candidate requires verified primary earnings at the exact $400 threshold or higher');
  }

  const { earningsMultiplier, socialSecurityWageBase, socialSecurityRate, medicareRate, deductiblePortion } =
    FEDERAL_2026_CONSTANTS.selfEmploymentTax;
  const displayedEarnings = profit.times(earningsMultiplier);
  const earnings = roundDollar(displayedEarnings);
  const wagesAndTips = roundDollar(exactCoveredPayroll);
  const skipSocialSecurity = exactCoveredPayroll.gte(socialSecurityWageBase);
  if (skipSocialSecurity !== wagesAndTips.gte(socialSecurityWageBase)) {
    throw new Error('The exact W-2 payroll cannot reconcile the printed Schedule SE wage-base branch');
  }
  const remainingWageBase = zeroFloor(socialSecurityWageBase.minus(wagesAndTips));
  const socialSecurity = roundDollar(Decimal.min(earnings, remainingWageBase).times(socialSecurityRate));
  const medicare = roundDollar(earnings.times(medicareRate));
  const tax = socialSecurity.plus(medicare);
  const deduction = roundDollar(tax.times(deductiblePortion));
  if (displayedEarnings.lt('400') || !earnings.eq(owner.earningsSubjectToSETax)
    || !socialSecurity.eq(owner.socialSecurityPortion) || !medicare.eq(owner.medicarePortion)
    || !tax.eq(owner.totalSETax) || !deduction.eq(owner.deductibleHalf)) {
    throw new Error('The rounded Schedule C transfer cannot reconcile the printed Schedule SE calculation');
  }

  const fields = SCHEDULE_SE_2026_CANDIDATE.fields;
  return {
    [fields.line2]: profit.toFixed(0), [fields.line3]: profit.toFixed(0),
    [fields.line4a]: earnings.toFixed(0), [fields.line4c]: earnings.toFixed(0), [fields.line6]: earnings.toFixed(0),
    [fields.line8a]: wagesAndTips.toFixed(0),
    ...(!skipSocialSecurity ? {
      [fields.line8d]: wagesAndTips.toFixed(0), [fields.line9]: remainingWageBase.toFixed(0), [fields.line10]: socialSecurity.toFixed(0),
    } : {}),
    [fields.line11]: medicare.toFixed(0),
    [fields.line12]: tax.toFixed(0), [fields.line13]: deduction.toFixed(0),
  };
}
