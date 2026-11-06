/**
 * Form 461 — Limitation on Business Losses
 * Spec: spec/federal/form-461.yaml
 *
 * IRC §461(l) limits aggregate business losses that non-corporate
 * taxpayers can use to offset nonbusiness income. Losses above the
 * threshold ($313,000 / $626,000 MFJ for 2025) are disallowed and
 * treated as an NOL carryforward. The disallowed excess is added
 * back as income on Schedule 1 Line 8p.
 */

import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { sum, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form461Input {
  /** Legacy source only; employee wages are excluded from Form461. */
  totalWages: Decimal;
  /** Schedule C net profit or loss (Line 2) */
  scheduleCNetProfit: Decimal;
  /** Schedule F net farm profit or loss (Line 6) */
  scheduleFNetProfit: Decimal;
  /** Form 4797 ordinary gain or loss (Line 4) */
  form4797OrdinaryGainOrLoss: Decimal;
  /** Nonpassive K-1 income (positive amounts only) */
  nonpassiveK1Income: Decimal;
  /** Nonpassive K-1 loss (negative amounts — entered as negative) */
  nonpassiveK1Loss: Decimal;
  /** Actual classified business income not already on other business schedules */
  otherBusinessIncome: Decimal;
  /** Deductible half of SE tax (Schedule SE Line 13) */
  deductibleSETax: Decimal;
  /** SE health insurance deduction (Schedule 1 Line 17) */
  seHealthInsurance: Decimal;
  /** SE retirement contributions (Schedule 1 Line 16) */
  seRetirementContributions: Decimal;
  /** Actual completed source classification; omitted values remain unverified. */
  sourceFactsConfirmed?: boolean;
  atRiskAndPassiveLimitationsApplied?: boolean;
  capitalGainOrLoss?: Decimal;
  tradeOrBusinessCapitalGainNetIncome?: Decimal;
  scheduleESupplementalIncome?: Decimal;
  noncapitalNonbusinessIncome?: Decimal;
  noncapitalNonbusinessLoss?: Decimal;
  /** Actual classified business net underlying noncapital Part I amounts. */
  noncapitalBusinessNet?: Decimal;
  otherBusinessDeductions?: Decimal;
  /** Prior-year NOL carryforward from excess business losses */
  priorYearEBLNol: Decimal;
}

export interface Form461Result {
  taxYear: number;
  sourceFactsVerified: boolean;
  requiresForm461: boolean;
  line2ScheduleC: Decimal;
  line3CapitalGainOrLoss: Decimal;
  line4Form4797: Decimal;
  line5ScheduleE: Decimal;
  line6ScheduleF: Decimal;
  line8OtherBusiness: Decimal;
  line9TotalIncomeLoss: Decimal;
  line10NonbusinessIncome: Decimal;
  line11NonbusinessLosses: Decimal;
  line12NonbusinessNet: Decimal;
  line13Adjustment: Decimal;
  line14NetBusinessAmount: Decimal;
  line15Threshold: Decimal;
  /** Actual signed printed line16; only its negative portion becomes an addback. */
  line16NetAfterThreshold: Decimal;
  line16ExcessBusinessLoss: Decimal;
  nolCarryforward: Decimal;
  applies: boolean;
  lines: CalculatedLine[];
  /** Legacy summary aliases below are not official printed line identities. */
  line1Wages: Decimal;
  line3ScheduleF: Decimal;
  line5NonpassiveK1: Decimal;
  line7OtherBusiness: Decimal;
  line8TotalBusinessIncome: Decimal;
  line9BusinessDeductionsFromLines: Decimal;
  line10DeductibleSETax: Decimal;
  line11SEHealthInsurance: Decimal;
  line12SERetirement: Decimal;
  line13TotalBusinessDeductions: Decimal;
}

export function calculateForm461(
  input: Form461Input,
  filingStatus: FilingStatus,
  constants: YearConstants
): Form461Result {
  const year = constants.taxYear;
  if (![2025, 2026].includes(year)) throw new Error("Unsupported Form461 tax year");
  const zero = new Decimal(0);
  const actualFields = ["capitalGainOrLoss", "tradeOrBusinessCapitalGainNetIncome", "scheduleESupplementalIncome",
    "noncapitalNonbusinessIncome", "noncapitalNonbusinessLoss", "noncapitalBusinessNet", "otherBusinessDeductions"] as const;
  const sourceFactsVerified = input.sourceFactsConfirmed === true;
  if (sourceFactsVerified) {
    if (actualFields.some(field => input[field] === undefined)) throw new Error("Form461 actual classification source values are required");
    if (input.atRiskAndPassiveLimitationsApplied !== true) throw new Error("Form461 requires completed at-risk and passive limitations");
  }
  for (const [name, value] of Object.entries(input)) {
    if (value instanceof Decimal && !value.isFinite()) throw new Error(`Form461 ${name} must be finite`);
  }
  for (const field of ["noncapitalNonbusinessIncome", "noncapitalNonbusinessLoss", "otherBusinessDeductions",
    "deductibleSETax", "seHealthInsurance", "seRetirementContributions", "priorYearEBLNol"] as const) {
    if (input[field]?.lt(0)) throw new Error(`Form461 ${field} must be nonnegative`);
  }
  const audit = new AuditTrail();
  // Official lines1 and7 are reserved. Wages never enter the business computation.
  const line2 = roundDollar(input.scheduleCNetProfit);
  const line3 = roundDollar(input.capitalGainOrLoss ?? zero);
  const line4 = roundDollar(input.form4797OrdinaryGainOrLoss);
  const line5 = roundDollar(input.scheduleESupplementalIncome ?? input.nonpassiveK1Income.plus(input.nonpassiveK1Loss));
  const line6 = roundDollar(input.scheduleFNetProfit);
  const deductions = sum(input.deductibleSETax, input.seHealthInsurance, input.seRetirementContributions, input.otherBusinessDeductions ?? zero);
  const line8 = roundDollar(input.otherBusinessIncome.minus(deductions));
  const line9 = sum(line2, line3, line4, line5, line6, line8);
  const allowedCapitalGain = Decimal.min(zeroFloor(line3), zeroFloor(roundDollar(input.tradeOrBusinessCapitalGainNetIncome ?? zero)));
  const noncapitalIncome = roundDollar(input.noncapitalNonbusinessIncome ?? zero);
  const noncapitalLoss = roundDollar(input.noncapitalNonbusinessLoss ?? zero);
  const noncapitalLines = [line2, line4, line5, line6, line8];
  // A printed net can contain larger opposite business/nonbusiness components.
  // Reconcile the actual classifications, never infer a gross bound from net signs.
  if (input.noncapitalBusinessNet === undefined && (noncapitalIncome.gt(0) || noncapitalLoss.gt(0))) {
    throw new Error("Form461 actual noncapital business net classification is required");
  }
  if (input.noncapitalBusinessNet !== undefined
    && !roundDollar(input.noncapitalBusinessNet).plus(noncapitalIncome).minus(noncapitalLoss).eq(sum(...noncapitalLines))) {
    throw new Error("Form461 nonbusiness income and losses must reconcile with reported PartI amounts");
  }
  const line10 = noncapitalIncome.plus(zeroFloor(line3.minus(allowedCapitalGain)));
  const line11 = noncapitalLoss.plus(zeroFloor(line3.negated()));
  const line12 = line10.minus(line11);
  const line13 = line12.negated();
  const line14 = line9.plus(line13);
  const line15 = constants.excessBusinessLoss.threshold[filingStatus];
  const line16 = line14.plus(line15);
  const addback = zeroFloor(line16.negated());
  const requiresForm461 = line14.lt(line15.negated()) || [line2,line3,line4,line5,line6,line8]
    .some(value => value.lt(constants.excessBusinessLoss.threshold.single.div(2).negated()));
  const legacyAmounts = [line2,line4,line5,line6,roundDollar(input.otherBusinessIncome)];
  const legacyDeductions = sum(...legacyAmounts.map(value=>zeroFloor(value.negated())),roundDollar(deductions));
  const entries: Array<[string,string,Decimal,string]> = [
    ["2","Business income or loss",line2,"Schedule 1 line 3"],
    ["3","Capital gain or loss",line3,"Form 1040 line 7a before Part II exclusions"],
    ["4","Other gains or losses",line4,"Schedule 1 line 4"],
    ["5","Supplemental income or loss",line5,"Schedule 1 line 5 after at-risk and passive limitations"],
    ["6","Farm income or loss",line6,"Schedule 1 line 6"],
    ["8","Other business income and deductions",line8,"Other actual business income less separately deducted business adjustments; no NOL or199A deduction"],
    ["9","Combined income or loss",line9,"Sum lines 2, 3, 4, 5, 6 and 8"],
    ["10","Income or gain not attributable to business",line10,"Actual noncapital nonbusiness income plus capital gain exceeding the business/total net-gain limit"],
    ["11","Losses or deductions not attributable to business",line11,"Actual noncapital nonbusiness losses plus all capital losses, positive"],
    ["12","Nonbusiness net",line12,"Line 10 minus line 11"],
    ["13","Nonbusiness adjustment",line13,"Negative of line 12"],
    ["14","Net business income or loss",line14,"Line 9 plus line 13; employee services excluded"],
    ["15","Indexed threshold",line15,`IRC461(l) indexed ${year} threshold for ${filingStatus}`],
    ["16","Net after business-loss threshold",line16,"Line 14 plus line 15; negative result becomes positive Schedule 1 line 8p"],
  ];
  for (const [line,description,value,formula] of entries) audit.record("Form 461",line,description,value,formula);
  const nolCarryforward = addback.plus(input.priorYearEBLNol);
  audit.record("Form 461","NOL","EBL NOL before current-year use of prior carry",nolCarryforward,"Current positive addback plus actual unused prior EBL NOL; current loss cannot offset current income twice");
  return {
    taxYear: year, sourceFactsVerified, requiresForm461,
    line2ScheduleC:line2,line3CapitalGainOrLoss:line3,line4Form4797:line4,line5ScheduleE:line5,line6ScheduleF:line6,
    line8OtherBusiness:line8,line9TotalIncomeLoss:line9,line10NonbusinessIncome:line10,line11NonbusinessLosses:line11,
    line12NonbusinessNet:line12,line13Adjustment:line13,line14NetBusinessAmount:line14,line15Threshold:line15,
    line16NetAfterThreshold:line16,line16ExcessBusinessLoss:addback,nolCarryforward,applies:addback.gt(0),lines:audit.getLines(),
    line1Wages:zero,line3ScheduleF:line6,line5NonpassiveK1:roundDollar(input.nonpassiveK1Income.plus(input.nonpassiveK1Loss)),
    line7OtherBusiness:roundDollar(input.otherBusinessIncome),line8TotalBusinessIncome:sum(...legacyAmounts.map(value=>zeroFloor(value))).plus(allowedCapitalGain),
    line9BusinessDeductionsFromLines:sum(...[line2,line4,line5,line6].map(value=>zeroFloor(value.negated()))),
    line10DeductibleSETax:roundDollar(input.deductibleSETax),line11SEHealthInsurance:roundDollar(input.seHealthInsurance),
    line12SERetirement:roundDollar(input.seRetirementContributions),
    line13TotalBusinessDeductions:legacyDeductions,
  };
}
