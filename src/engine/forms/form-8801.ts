/** Form8801. Source lines and year-specific rules: spec/federal/form-8801.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

interface PriorYearTable {
  exemption: Record<FilingStatus, string>;
  phaseout: Record<FilingStatus, string>;
  zeroRate: Record<FilingStatus, string>;
  fifteenRate: Record<FilingStatus, string>;
  breakpoint: string;
  mfsBreakpoint: string;
  mfsAdditionThreshold: string;
}
function statuses(single: string, joint: string, separate: string, head = single): Record<FilingStatus, string> {
  return { single, married_filing_jointly: joint, married_filing_separately: separate, head_of_household: head, qualifying_surviving_spouse: joint };
}
const PRIOR_YEAR_TABLES: Record<2024 | 2025, PriorYearTable> = {
  2024: {
    exemption: statuses("85700", "133300", "66650"), phaseout: statuses("609350", "1218700", "609350"),
    zeroRate: statuses("47025", "94050", "47025", "63000"), fifteenRate: statuses("518900", "583750", "291850", "551350"),
    breakpoint: "232600", mfsBreakpoint: "116300", mfsAdditionThreshold: "875950",
  },
  2025: {
    exemption: statuses("88100", "137000", "68500"), phaseout: statuses("626350", "1252700", "626350"),
    zeroRate: statuses("48350", "96700", "48350", "64750"), fifteenRate: statuses("533400", "600050", "300000", "566700"),
    breakpoint: "239100", mfsBreakpoint: "119550", mfsAdditionThreshold: "900350",
  },
};

export interface Form8801CapitalGainsWorksheet {
  method: "qualified_dividends" | "schedule_d";
  /** Prior QD/CG Tax Worksheet line4 or ScheduleD Tax Worksheet line13, as adjusted for AMT. */
  preferentialIncome: Decimal;
  /** Actual prior QD/CG line5 or ScheduleD Tax Worksheet line14. */
  ordinaryIncomeForZeroRate: Decimal;
  /** Actual prior QD/CG line5 or ScheduleD Tax Worksheet line21. */
  ordinaryIncomeForFifteenRate: Decimal;
  /** Actual prior ScheduleD line19. Required for ScheduleD method, including known0. */
  section1250Gain?: Decimal;
  scheduleDTaxWorksheetLine10?: Decimal;
}
export interface Form8801Input {
  taxYear?: number;
  priorYear?: number;
  sourceFactsConfirmed?: boolean;
  /** Raw-input completeness marker, computed before legacy schema defaults. */
  sourceFactsComplete?: boolean;
  priorYearFilingStatus: FilingStatus;
  /** Legacy2025 alias; source-backed calculations use actual6251 line1+2e. */
  priorYearTaxableIncome: Decimal;
  priorYearExclusionItemAdjustments: Decimal;
  priorYearAMT: Decimal;
  /** Legacy2025 alias; source-backed calculations use actual6251 line10. */
  priorYearRegularTax: Decimal;
  unusedMinimumTaxCreditCarryforward?: Decimal;
  /** Legacy2025 name; caller must already subtract the line22 allowable credits. */
  currentYearRegularTaxBeforeCredits?: Decimal;
  currentYearRegularTaxAfterCredits?: Decimal;
  /** Actual current Form6251 line9. */
  currentYearTMT: Decimal;
  priorYearForm6251Line1And2e?: Decimal;
  priorYearMinimumTaxCreditNOLDeduction?: Decimal;
  priorYearMinimumTaxForeignTaxCredit?: Decimal;
  priorYearForm6251Line10?: Decimal;
  priorYearUnallowedQualifiedElectricVehicleCredit?: Decimal;
  priorYearFiledForm2555?: boolean;
  priorYearFiledForm1040NR?: boolean;
  priorYearNetUSRealPropertyGain?: Decimal;
  priorYearCapitalGainsRequired?: boolean;
  priorYearCapitalGainsWorksheet?: Form8801CapitalGainsWorksheet;
  priorYearForeignEarnedIncome?: {
    form2555Lines45And50: Decimal;
    disallowedDeductions: Decimal;
    /** Confirms actual worksheet modifications for regular/AMT capital gain excess. */
    capitalGainAdjustmentsConfirmed?: boolean;
  };
  /** Legacy source amounts do not establish the required tax worksheet. */
  priorYearQualifiedDividends?: Decimal;
  priorYearNetLTCG?: Decimal;
  priorYearUnrecapturedSection1250Gain?: Decimal;
  priorYearCollectiblesGain?: Decimal;
}
export interface Form8801Result {
  taxYear: number;
  priorYear: number;
  sourceFactsVerified: boolean;
  exclusionOnlyAMTI: Decimal; //4
  exemption: Decimal; //9
  amtBaseOnExclusions: Decimal; //10
  exclusionOnlyTMT: Decimal; //11, before MTFTCE
  tentativeMinimumTaxOnExclusionItems: Decimal; //13, after MTFTCE
  netMinTaxOnExclusionItems: Decimal; //15
  minTaxCreditFromPriorYear: Decimal; //18, SIGNED
  totalAvailableCredit: Decimal; //positive portion of21
  currentYearLimitation: Decimal; //24
  creditAllowed: Decimal; //25 -> Schedule3 line6b
  carryforwardToNextYear: Decimal; //26
  lines: CalculatedLine[];
}

function amount(value: Decimal | undefined, name: string, signed = false): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error(`Form 8801 ${name} requires an actual finite amount`);
  if (!signed && value.isNegative()) throw new Error(`Form 8801 ${name} must be nonnegative`);
  return roundDollar(value);
}
function computeAMTTax(base: Decimal, breakpoint: Decimal): Decimal {
  return roundDollar(min(base, breakpoint).times(d("0.26")).plus(zeroFloor(base.minus(breakpoint)).times(d("0.28"))));
}

export function calculateForm8801(input: Form8801Input): Form8801Result {
  const taxYear = input.taxYear ?? 2025;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Form 8801 supports tax years2025 and2026 only");
  const priorYear = taxYear === 2026 ? 2025 : 2024;
  if (input.priorYear !== undefined && input.priorYear !== priorYear) throw new Error("Form 8801 prior year must immediately precede the tax year");
  const sourceFactsVerified = input.sourceFactsConfirmed === true;
  const strict = taxYear === 2026 || input.sourceFactsConfirmed !== undefined || input.priorYearForm6251Line1And2e !== undefined;
  if (strict) {
    if (!sourceFactsVerified || input.sourceFactsComplete === false) throw new Error("Form 8801 requires confirmed complete original source facts");
    if (input.priorYear !== priorYear) throw new Error("Form 8801 requires the actual prior source year");
    for (const key of ["priorYearFiledForm2555", "priorYearFiledForm1040NR", "priorYearCapitalGainsRequired"] as const) {
      if (typeof input[key] !== "boolean") throw new Error(`Form 8801 requires known ${key}`);
    }
  }
  const table = PRIOR_YEAR_TABLES[priorYear];
  const status = input.priorYearFilingStatus;
  if (!(status in table.exemption)) throw new Error("Form 8801 requires an individual filing status");
  const line1 = amount(strict ? input.priorYearForm6251Line1And2e : input.priorYearTaxableIncome, "prior Form6251 line1 and2e", true);
  const exclusions = amount(input.priorYearExclusionItemAdjustments, "exclusion adjustments", true);
  const nol = amount(input.priorYearMinimumTaxCreditNOLDeduction ?? (strict ? undefined : d(0)), "minimum tax credit NOL deduction");
  const mtftce = amount(input.priorYearMinimumTaxForeignTaxCredit ?? (strict ? undefined : d(0)), "minimum tax foreign credit");
  const priorRegularTax = amount(strict ? input.priorYearForm6251Line10 : input.priorYearRegularTax, "prior Form6251 line10");
  const priorAMT = amount(input.priorYearAMT, "prior AMT");
  const carry = amount(input.unusedMinimumTaxCreditCarryforward ?? (strict ? undefined : d(0)), "prior credit carryforward");
  const legacyVehicle = amount(input.priorYearUnallowedQualifiedElectricVehicleCredit ?? (strict ? undefined : d(0)), "legacy qualified electric vehicle credit");
  const regularAfterCredits = amount(input.currentYearRegularTaxAfterCredits ?? (strict ? undefined : input.currentYearRegularTaxBeforeCredits), "current regular tax after allowable credits");
  const currentTMT = amount(input.currentYearTMT, "current tentative minimum tax");
  const legacyCapitalAmounts = [input.priorYearQualifiedDividends, input.priorYearNetLTCG, input.priorYearUnrecapturedSection1250Gain, input.priorYearCollectiblesGain];
  const hasLegacyCapital = legacyCapitalAmounts.map(value => value === undefined ? d(0) : amount(value, "prior capital income")).some(value => value.gt(0));
  const capitalRequired = input.priorYearCapitalGainsRequired ?? (hasLegacyCapital || input.priorYearCapitalGainsWorksheet !== undefined);
  if (!capitalRequired && (hasLegacyCapital || input.priorYearCapitalGainsWorksheet !== undefined)) throw new Error("Form 8801 capital-gain facts contradict stated applicability");
  if (capitalRequired && input.priorYearCapitalGainsWorksheet === undefined) throw new Error("Form 8801 requires actual prior capital-gains worksheet sources");
  const foreign = input.priorYearForeignEarnedIncome;
  if (input.priorYearFiledForm2555 === true && foreign === undefined) throw new Error("Form 8801 requires actual foreign earned income worksheet facts");
  if (foreign !== undefined && input.priorYearFiledForm2555 !== true) throw new Error("Form 8801 foreign earned income facts require known Form2555 applicability");
  let foreignStack = d(0);
  if (foreign !== undefined) {
    foreignStack = zeroFloor(amount(foreign.form2555Lines45And50, "Form2555 exclusions").minus(amount(foreign.disallowedDeductions, "foreign income disallowed deductions")));
    if (capitalRequired && foreign.capitalGainAdjustmentsConfirmed !== true) throw new Error("Form 8801 requires confirmed capital gain excess adjustments for Form2555 worksheets");
  }
  const realPropertyGain = input.priorYearFiledForm1040NR === true ? amount(input.priorYearNetUSRealPropertyGain, "nonresident net U.S. real-property gain") : d(0);
  if (input.priorYearNetUSRealPropertyGain !== undefined && input.priorYearFiledForm1040NR !== true && amount(input.priorYearNetUSRealPropertyGain, "net U.S. real-property gain").gt(0)) throw new Error("Form 8801 real-property floor requires known Form1040-NR applicability");

  const audit = new AuditTrail();
  const record = (line: string, description: string, value: Decimal, formula: string) => audit.record("Form 8801", line, description, value, formula);
  record("1", "Prior-year Form6251 income and NOL-source sum", line1, `Actual ${priorYear} Form6251 line${priorYear === 2025 ? "1b" : "1"} plus2e`);
  record("2", "Exclusion-item adjustments", exclusions, "Actual prior-year exclusion items only");
  record("3", "Minimum tax credit NOL deduction", nol, "Actual exclusion-only section172 worksheet deduction");
  const preliminaryAMTI = zeroFloor(line1.plus(exclusions).minus(nol));
  const baseExemption = d(table.exemption[status]);
  const mfsAddition = status === "married_filing_separately" ? roundDollar(min(baseExemption, zeroFloor(preliminaryAMTI.minus(d(table.mfsAdditionThreshold))).times(d("0.25")))) : d(0);
  const exclusionOnlyAMTI = record("4", "Exclusion-only AMTI", preliminaryAMTI.plus(mfsAddition), "max(0,line1 + line2 - line3) + applicable MFS addition");
  record("5", "Prior-year AMT exemption", baseExemption, `${priorYear} individual exemption`);
  const threshold = record("6", "Prior-year exemption phaseout threshold", d(table.phaseout[status]), `${priorYear} phaseout threshold`);
  const excess = record("7", "Excess over exemption phaseout threshold", zeroFloor(exclusionOnlyAMTI.minus(threshold)), "max(0,line4 - line6)");
  const reduction = record("8", "Exemption reduction", roundDollar(excess.times(d("0.25"))), "RoundDollar(line7 * 25%)");
  const exemption = record("9", "Allowed prior-year AMT exemption", zeroFloor(baseExemption.minus(reduction)), "max(0,line5 - line8)");
  const amtBaseOnExclusions = record("10", "AMT base on exclusion items", Decimal.max(zeroFloor(exclusionOnlyAMTI.minus(exemption)), min(realPropertyGain, exclusionOnlyAMTI)), "max(0,line4 - line9), subject to actual nonresident real-property floor");
  const breakpoint = d(status === "married_filing_separately" ? table.mfsBreakpoint : table.breakpoint);
  const taxBase = amtBaseOnExclusions.plus(foreignStack);
  let computedTax = computeAMTTax(taxBase, breakpoint);
  if (capitalRequired) {
    const worksheet = input.priorYearCapitalGainsWorksheet;
    if (!worksheet) throw new Error("Form 8801 requires a capital-gains worksheet");
    if (worksheet.method !== "qualified_dividends" && worksheet.method !== "schedule_d") throw new Error("Form 8801 capital-gain worksheet method is unsupported");
    const preferential = amount(worksheet.preferentialIncome, "capital-gain preferential income");
    const ordinaryZero = amount(worksheet.ordinaryIncomeForZeroRate, "zero-rate worksheet ordinary income");
    const ordinaryFifteen = amount(worksheet.ordinaryIncomeForFifteenRate, "fifteen-rate worksheet ordinary income");
    const section1250 = worksheet.method === "schedule_d" ? amount(worksheet.section1250Gain, "Schedule D section1250 gain") : d(0);
    const scheduleDCap = worksheet.method === "schedule_d" ? amount(worksheet.scheduleDTaxWorksheetLine10, "Schedule D Tax Worksheet line10") : preferential;
    if (worksheet.method === "schedule_d" && ordinaryFifteen.gt(ordinaryZero)) throw new Error("Form 8801 Schedule D line21 cannot exceed its line14 ordinary income");
    if (scheduleDCap.lt(preferential)) throw new Error("Form 8801 Schedule D worksheet gain cap cannot be below preferential income");
    if (worksheet.method === "qualified_dividends" && (!ordinaryZero.eq(ordinaryFifteen) || (worksheet.section1250Gain !== undefined && amount(worksheet.section1250Gain, "section1250 gain").gt(0)) || worksheet.scheduleDTaxWorksheetLine10 !== undefined)) throw new Error("Form 8801 qualified-dividends worksheet uses the same ordinary income source and excludes Schedule D special-gain inputs");
    record("27", "PartIII tax base", taxBase, "line10, or Foreign Earned Income Tax Worksheet line3");
    record("28", "Actual preferential-income worksheet source", preferential, "Prior QD/CG Tax Worksheet line4 or ScheduleD Tax Worksheet line13");
    record("29", "Actual section1250 gain", section1250, "Prior ScheduleD line19; zero for QD/CG method");
    const gainCap = record("30", "Preferential gain cap", min(preferential.plus(section1250), scheduleDCap), "QD method line28; otherwise min(line28+line29, ScheduleD Tax Worksheet line10)");
    const gain = record("31", "Gain limited by tax base", min(taxBase, gainCap), "min(line27,line30)");
    const ordinary = record("32", "Ordinary AMT portion", taxBase.minus(gain), "line27 - line31");
    const ordinaryTax = record("33", "Ordinary AMT tax", computeAMTTax(ordinary, breakpoint), "Prior-year26%/28% AMT tax on line32");
    const zeroThreshold = record("34", "Prior-year zero-rate threshold", d(table.zeroRate[status]), `${priorYear} capital-gain zero-rate threshold`);
    record("35", "Actual regular-tax ordinary income for zero rate", ordinaryZero, "Prior QD/CG worksheet line5 or ScheduleD Tax Worksheet line14");
    const zeroCapacity = record("36", "Zero-rate capacity", zeroFloor(zeroThreshold.minus(ordinaryZero)), "max(0,line34 - line35)");
    const taxablePreference = record("37", "Preferential income limited by tax base", min(taxBase, preferential), "min(line27,line28)");
    const zeroGain = record("38", "Zero-rate gain", min(zeroCapacity, taxablePreference), "min(line36,line37)");
    const remainingPreference = record("39", "Preferential income above zero rate", taxablePreference.minus(zeroGain), "line37 - line38");
    const fifteenThreshold = record("40", "Prior-year fifteen-percent threshold", d(table.fifteenRate[status]), `${priorYear} capital-gain15% threshold`);
    record("41", "Zero-rate capacity", zeroCapacity, "Copy line36");
    record("42", "Actual regular-tax ordinary income for fifteen percent", ordinaryFifteen, "Prior QD/CG worksheet line5 or ScheduleD Tax Worksheet line21");
    const consumed = record("43", "Income consuming fifteen-percent capacity", zeroCapacity.plus(ordinaryFifteen), "line41 + line42");
    const fifteenCapacity = record("44", "Fifteen-percent capacity", zeroFloor(fifteenThreshold.minus(consumed)), "max(0,line40 - line43)");
    const fifteenGain = record("45", "Fifteen-percent gain", min(remainingPreference, fifteenCapacity), "min(line39,line44)");
    const fifteenTax = record("46", "Fifteen-percent tax", roundDollar(fifteenGain.times(d("0.15"))), "RoundDollar(line45 * 15%)");
    const lowerRateGain = record("47", "Zero- and fifteen-percent gain", zeroGain.plus(fifteenGain), "line38 + line45");
    const twentyGain = record("48", "Twenty-percent gain", taxablePreference.minus(lowerRateGain), "line37 - line47");
    const twentyTax = record("49", "Twenty-percent tax", roundDollar(twentyGain.times(d("0.20"))), "RoundDollar(line48 * 20%)");
    const subtotal = record("50", "Ordinary and preferential income subtotal", ordinary.plus(lowerRateGain).plus(twentyGain), "line32 + line47 + line48");
    const specialGain = record("51", "Section1250 gain at maximum25%", taxBase.minus(subtotal), "line27 - line50");
    const specialTax = record("52", "Section1250 tax", roundDollar(specialGain.times(d("0.25"))), "RoundDollar(line51 * 25%)");
    const capitalTax = record("53", "Maximum capital-gain rate tax", ordinaryTax.plus(fifteenTax).plus(twentyTax).plus(specialTax), "line33 + line46 + line49 + line52");
    record("54", "All-income AMT comparison", computedTax, "Prior-year26%/28% tax on line27");
    computedTax = record("55", "Lower capital-gain or ordinary AMT tax", min(capitalTax, computedTax), "min(line53,line54)");
  }
  const exclusionOnlyTMT = record("11", "Tax on exclusion items before MTFTCE", zeroFloor(computedTax.minus(computeAMTTax(foreignStack, breakpoint))), foreign ? "Foreign Earned Income Tax Worksheet line4 - line5" : capitalRequired ? "PartIII line55" : "Prior-year26%/28% tax on line10");
  if (mtftce.gt(exclusionOnlyTMT)) throw new Error("Form 8801 minimum tax foreign credit cannot exceed tax on exclusion items");
  record("12", "Minimum tax foreign credit on exclusion items", mtftce, "Actual completed MTFTCE worksheet");
  const tentativeMinimumTaxOnExclusionItems = record("13", "Tentative minimum tax on exclusion items", exclusionOnlyTMT.minus(mtftce), "line11 - line12");
  record("14", "Prior-year comparison tax", priorRegularTax, `Actual ${priorYear} Form6251 line10`);
  const netMinTaxOnExclusionItems = record("15", "Net minimum tax on exclusion items", zeroFloor(tentativeMinimumTaxOnExclusionItems.minus(priorRegularTax)), "max(0,line13 - line14)");
  record("16", "Prior-year AMT", priorAMT, `Actual ${priorYear} Form6251 line11`);
  record("17", "Net minimum tax on exclusion items", netMinTaxOnExclusionItems, "Copy line15");
  const minTaxCreditFromPriorYear = record("18", "Signed prior-year credit adjustment", priorAMT.minus(netMinTaxOnExclusionItems), "line16 - line17; retain negative amounts");
  record("19", "Prior-year credit carryforward", carry, `Actual ${priorYear} Form8801 line26`);
  record("20", "Unallowed legacy qualified electric vehicle credit", legacyVehicle, "Actual pre-2009 section30 credit limitation carryforward");
  const combined = record("21", "Combined credit pool before zero floor", minTaxCreditFromPriorYear.plus(carry).plus(legacyVehicle), "line18 + line19 + line20; if nonpositive no credit or carryforward");
  const totalAvailableCredit = zeroFloor(combined);
  record("22", "Current regular income tax after allowable credits", regularAfterCredits, "1040line16 + Schedule2line1z - 1040line19 - Schedule3lines1..6z (excluding6b and6k)");
  record("23", "Current tentative minimum tax", currentTMT, "Current Form6251 line9");
  const currentYearLimitation = record("24", "Current-year limitation", zeroFloor(regularAfterCredits.minus(currentTMT)), "max(0,line22 - line23)");
  const creditAllowed = record("25", "Allowed minimum tax credit", min(totalAvailableCredit, currentYearLimitation), "min(max(0,line21),line24) -> Schedule 3 line 6b");
  const carryforwardToNextYear = record("26", "Credit carryforward to next year", totalAvailableCredit.minus(creditAllowed), "max(0,line21) - line25");
  return { taxYear, priorYear, sourceFactsVerified, exclusionOnlyAMTI, exemption, amtBaseOnExclusions, exclusionOnlyTMT, tentativeMinimumTaxOnExclusionItems, netMinTaxOnExclusionItems, minTaxCreditFromPriorYear, totalAvailableCredit, currentYearLimitation, creditAllowed, carryforwardToNextYear, lines: audit.getLines() };
}
