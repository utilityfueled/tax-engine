/**
 * Social Security Benefits Worksheet (Form 1040 instructions).
 * Spec: spec/federal/social-security-benefits-worksheet.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, sum, zeroFloor } from "@/utils/decimal.js";

export interface SocialSecurityBenefitsWorksheetInput {
  filingStatus: FilingStatus;
  benefitsReceived: Decimal;
  otherIncome: Decimal;
  taxExemptInterest: Decimal;
  /** Actual Pub. 915 Worksheet 1 line 5 exclusions, before any lump-sum aggregate. */
  exclusionsAdjustments?: Decimal;
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
  adjustments?: {
    businessExpenseAdjustments?: Decimal;
    hsaDeduction?: Decimal;
    armedForcesMovingExpenses?: Decimal;
    seDeduction?: Decimal;
    seRetirementContributions?: Decimal;
    seHealthInsurance?: Decimal;
    earlyWithdrawalPenalty?: Decimal;
    alimonyPaid?: Decimal;
    iraDeduction?: Decimal;
    archerMSADeduction?: Decimal;
    educatorExpenses?: Decimal;
    otherAdjustmentsTotal?: Decimal;
    studentLoanInterest?: Decimal;
  };
  lumpSumElection?: {
    currentYearExclusionsAdjustments?: Decimal;
    earlierYears: Array<{
      taxYear: number;
      filingStatus: FilingStatus;
      livedWithSpouseAtAnyTimeDuringYear?: boolean;
      benefitsReceivedInEarlierYear: Decimal;
      delayedBenefitsReceivedInCurrentYear: Decimal;
      adjustedGrossIncome: Decimal;
      taxExemptInterest?: Decimal;
      exclusionsAdjustments?: Decimal;
      taxableBenefitsPreviouslyReported: Decimal;
    }>;
  };
}

export interface SocialSecurityLumpSumElectionYearResult {
  taxYear: number;
  refiguredTaxableBenefits: Decimal;
  additionalTaxableBenefits: Decimal;
}

export interface SocialSecurityBenefitsWorksheetResult {
  worksheetKind: "form1040" | "publication915";
  exclusionsAdjustments: Decimal;
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15: Decimal;
  line16: Decimal;
  line17: Decimal;
  line18: Decimal;
  standardTaxableBenefits: Decimal;
  lumpSumElectionTaxableBenefits?: Decimal;
  usedLumpSumElection: boolean;
  lumpSumElectionAdditionalBenefitsByYear: SocialSecurityLumpSumElectionYearResult[];
  taxableBenefits: Decimal;
  lines: CalculatedLine[];
}

const EIGHTY_FIVE_PERCENT = new Decimal(0.85);

function getBaseAmount(
  filingStatus: FilingStatus,
  livedWithSpouseAtAnyTimeDuringYear?: boolean
): Decimal {
  if (filingStatus === "married_filing_jointly") return new Decimal(32000);
  if (filingStatus === "married_filing_separately" && livedWithSpouseAtAnyTimeDuringYear) {
    return new Decimal(0);
  }
  return new Decimal(25000);
}

function getSecondTierWidth(filingStatus: FilingStatus): Decimal {
  return filingStatus === "married_filing_jointly" ? new Decimal(12000) : new Decimal(9000);
}

function getPub915SecondTierWidth(
  filingStatus: FilingStatus,
  livedWithSpouseAtAnyTimeDuringYear?: boolean
): Decimal {
  if (filingStatus === "married_filing_separately" && livedWithSpouseAtAnyTimeDuringYear) {
    return new Decimal(0);
  }

  return getSecondTierWidth(filingStatus);
}

function calculatePub915TaxableBenefits(input: {
  filingStatus: FilingStatus;
  benefitsReceived: Decimal;
  provisionalIncome: Decimal;
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
}): Decimal {
  const mfsLivedWithSpouse =
    input.filingStatus === "married_filing_separately" && input.livedWithSpouseAtAnyTimeDuringYear;

  const halfBenefits = d(input.benefitsReceived).dividedBy(2);
  const excessOverBase = zeroFloor(
    d(input.provisionalIncome).minus(
      getBaseAmount(input.filingStatus, input.livedWithSpouseAtAnyTimeDuringYear)
    )
  );

  if (mfsLivedWithSpouse) {
    return min(
      d(input.benefitsReceived).times(EIGHTY_FIVE_PERCENT),
      zeroFloor(d(input.provisionalIncome)).times(EIGHTY_FIVE_PERCENT)
    );
  }

  const secondTierWidth = getPub915SecondTierWidth(
    input.filingStatus,
    input.livedWithSpouseAtAnyTimeDuringYear
  );
  const lowerTierBand = min(excessOverBase, secondTierWidth);
  const upperTierExcess = zeroFloor(excessOverBase.minus(secondTierWidth));
  const lowerTierInclusion = min(halfBenefits, lowerTierBand.dividedBy(2));
  const fixedLowerTierCap = min(halfBenefits, secondTierWidth.dividedBy(2));
  const upperTierTaxableBenefits = upperTierExcess.times(EIGHTY_FIVE_PERCENT);

  return min(
    min(
      d(input.benefitsReceived).times(EIGHTY_FIVE_PERCENT),
      lowerTierInclusion.plus(upperTierTaxableBenefits)
    ),
    fixedLowerTierCap.plus(upperTierTaxableBenefits)
  );
}

function calculatePub915Worksheet2AdditionalTaxableBenefits(input: {
  taxYear: number;
  filingStatus: FilingStatus;
  livedWithSpouseAtAnyTimeDuringYear?: boolean;
  benefitsReceivedInEarlierYear: Decimal;
  delayedBenefitsReceivedInCurrentYear: Decimal;
  adjustedGrossIncome: Decimal;
  taxExemptInterest?: Decimal;
  exclusionsAdjustments?: Decimal;
  taxableBenefitsPreviouslyReported: Decimal;
}): SocialSecurityLumpSumElectionYearResult {
  const totalBenefits = d(input.benefitsReceivedInEarlierYear).plus(d(input.delayedBenefitsReceivedInCurrentYear));
  const provisionalIncome = totalBenefits
    .dividedBy(2)
    .plus(d(input.adjustedGrossIncome))
    .plus(d(input.exclusionsAdjustments))
    .plus(d(input.taxExemptInterest))
    .minus(d(input.taxableBenefitsPreviouslyReported));
  const refiguredTaxableBenefits = calculatePub915TaxableBenefits({
    filingStatus: input.filingStatus,
    benefitsReceived: totalBenefits,
    provisionalIncome,
    livedWithSpouseAtAnyTimeDuringYear: input.livedWithSpouseAtAnyTimeDuringYear,
  });
  const additionalTaxableBenefits = zeroFloor(
    refiguredTaxableBenefits.minus(d(input.taxableBenefitsPreviouslyReported))
  );

  return {
    taxYear: input.taxYear,
    refiguredTaxableBenefits,
    additionalTaxableBenefits,
  };
}

export function calculateSocialSecurityBenefitsWorksheet(
  input: SocialSecurityBenefitsWorksheetInput
): SocialSecurityBenefitsWorksheetResult {
  const audit = new AuditTrail();
  const mfsLivedWithSpouse =
    input.filingStatus === "married_filing_separately" && input.livedWithSpouseAtAnyTimeDuringYear;

  const knownExclusions = d(input.exclusionsAdjustments);
  const aggregateExclusions = input.lumpSumElection?.currentYearExclusionsAdjustments;
  for (const amount of [knownExclusions, aggregateExclusions]) {
    if (amount !== undefined && (!amount.isFinite() || amount.isNegative())) {
      throw new Error("Social Security exclusions must be finite and nonnegative");
    }
  }
  if (aggregateExclusions !== undefined && aggregateExclusions.lessThan(knownExclusions)) {
    throw new Error("Current-year aggregate exclusions cannot be below known actual exclusions");
  }
  const exclusionsAdjustments = aggregateExclusions ?? knownExclusions;
  const worksheetKind = exclusionsAdjustments.greaterThan(0) ? "publication915" : "form1040";

  const line1 = d(input.benefitsReceived);
  const line2 = line1.dividedBy(2);
  const line3 = d(input.otherIncome);
  const line4 = d(input.taxExemptInterest);
  const line5 = sum(line2, line3, line4, exclusionsAdjustments);
  const line6 = sum(
    d(input.adjustments?.businessExpenseAdjustments),
    d(input.adjustments?.hsaDeduction),
    d(input.adjustments?.armedForcesMovingExpenses),
    d(input.adjustments?.seDeduction),
    d(input.adjustments?.seRetirementContributions),
    d(input.adjustments?.seHealthInsurance),
    d(input.adjustments?.earlyWithdrawalPenalty),
    d(input.adjustments?.alimonyPaid),
    d(input.adjustments?.iraDeduction),
    d(input.adjustments?.archerMSADeduction),
    d(input.adjustments?.educatorExpenses),
    d(input.adjustments?.otherAdjustmentsTotal)
  );
  const line7 = line5.minus(line6);
  const line8 = getBaseAmount(input.filingStatus, input.livedWithSpouseAtAnyTimeDuringYear);
  const line9 = zeroFloor(line7.minus(line8));
  const line10 = getSecondTierWidth(input.filingStatus);
  const line11 = zeroFloor(line9.minus(line10));
  const line12 = min(line9, line10);
  const line13 = line12.dividedBy(2);
  const line14 = min(line2, line13);
  const line15 = line11.times(EIGHTY_FIVE_PERCENT);
  const line16 = mfsLivedWithSpouse
    ? zeroFloor(line7).times(EIGHTY_FIVE_PERCENT)
    : line14.plus(line15);
  const line17 = line1.times(EIGHTY_FIVE_PERCENT);
  const line18 = min(line16, line17);

  if (worksheetKind === "publication915") {
    const entries: Array<[string, string, Decimal, string]> = [
      ["1", "Total Social Security benefits", line1, "SSA-1099/RRB-1099 equivalent benefits"],
      ["2", "Half of benefits", line2, "Line 1 × 50%"],
      ["3", "Other taxable income before savings-bond exclusion", line3, "1040 income other than Social Security; pre-exclusion interest"],
      ["4", "Tax-exempt interest", line4, "Form 1040 line 2a"],
      ["5", "Actual income exclusions", exclusionsAdjustments, "Actual foreign income/housing, adoption, and supported other exclusions"],
      ["6", "Income and exclusions subtotal", line5, "Lines 2 + 3 + 4 + 5"],
      ["7", "Specified Schedule 1 adjustments", line6, "Schedule 1 lines 11–20, 23, and 25"],
      ["8", "Provisional income", line7, "Line 6 − line 7"],
      ["9", "Base amount", line8, "32,000 joint; 25,000 others; MFS lived-together exception"],
      ["10", "Excess over base", line9, "max(0, line 8 − line 9)"],
      ["11", "Second-tier width", line10, "12,000 joint; 9,000 others"],
      ["12", "Upper-tier excess", line11, "max(0, line 10 − line 11)"],
      ["13", "Lower-tier band", line12, "min(line 10, line 11)"],
      ["14", "Half lower-tier band", line13, "Line 13 × 50%"],
      ["15", "Lower-tier inclusion", line14, "min(line 2, line 14)"],
      ["16", "Upper-tier inclusion", line15, "Line 12 × 85%"],
      ["17", "Tentative taxable benefits", line16, mfsLivedWithSpouse ? "max(0, line 8) × 85% under MFS lived-together rule" : "Line 15 + line 16"],
      ["18", "85% benefit limit", line17, "Line 1 × 85%"],
      ["19", "Taxable Social Security benefits", line18, "min(line 17, line 18)"],
    ];
    for (const [line, description, value, formula] of entries) {
      if (mfsLivedWithSpouse && new Set(["9", "10", "11", "12", "13", "14", "15", "16"]).has(line)) continue;
      audit.record("Pub915 WS1", line, description, value, formula);
    }
  } else {
    audit.record("SS Worksheet", "1", "Total Social Security benefits", line1, "Sum SSA-1099 Box 5 benefits");
    audit.record("SS Worksheet", "2", "One-half of benefits", line2, "Line 1 / 2", { "Line 1": line1 });
    audit.record("SS Worksheet", "3", "Other taxable income", line3, "Form 1040 income excluding Social Security benefits");
    audit.record("SS Worksheet", "4", "Tax-exempt interest", line4, "Form 1040 Line 2a");
    audit.record("SS Worksheet", "5", "Subtotal before add-backs", line5, "Line 2 + Line 3 + Line 4", {
      "Line 2": line2,
      "Line 3": line3,
      "Line 4": line4,
    });
    audit.record("SS Worksheet", "6", "Specified Schedule 1 add-backs", line6,
      "Supported 2025 Schedule 1 adjustment categories added back for provisional income; student loan interest stays excluded while Line 12 business expenses and Line 14 Armed Forces moving expenses are supported through validated Schedule 1 amounts", {
        "Supported Schedule 1 business expense adjustments": d(input.adjustments?.businessExpenseAdjustments),
        "Supported Schedule 1 educator expenses": d(input.adjustments?.educatorExpenses),
        "Supported Schedule 1 HSA deduction": d(input.adjustments?.hsaDeduction),
        "Supported Schedule 1 Armed Forces moving expenses": d(input.adjustments?.armedForcesMovingExpenses),
        "Supported Schedule 1 deductible self-employment tax": d(input.adjustments?.seDeduction),
        "Supported Schedule 1 self-employed retirement contributions": d(input.adjustments?.seRetirementContributions),
        "Supported Schedule 1 self-employed health insurance deduction": d(input.adjustments?.seHealthInsurance),
        "Supported Schedule 1 early withdrawal penalty": d(input.adjustments?.earlyWithdrawalPenalty),
        "Supported Schedule 1 alimony paid": d(input.adjustments?.alimonyPaid),
        "Supported Schedule 1 IRA deduction": d(input.adjustments?.iraDeduction),
        "Supported Schedule 1 Archer MSA deduction": d(input.adjustments?.archerMSADeduction),
        "Supported Schedule 1 Line 25 total other adjustments": d(input.adjustments?.otherAdjustmentsTotal),
        "Excluded Schedule 1 student loan interest": d(input.adjustments?.studentLoanInterest),
      });
    audit.record("SS Worksheet", "7", "Provisional income", line7, "Line 5 - Line 6", {
      "Line 5": line5,
      "Line 6": line6,
    });
    audit.record("SS Worksheet", "8", "Base amount", line8,
      input.filingStatus === "married_filing_jointly"
        ? "$32,000 for married filing jointly"
        : mfsLivedWithSpouse
          ? "$0 because the married filing separately filer lived with a spouse during the year"
          : "$25,000 for single, head of household, qualifying surviving spouse, or MFS living apart all year");
    audit.record("SS Worksheet", "9", "Excess over base amount", line9, "max(0, Line 7 - Line 8)", {
      "Line 7": line7,
      "Line 8": line8,
    });
    audit.record("SS Worksheet", "10", "Second-tier width", line10,
      input.filingStatus === "married_filing_jointly" ? "$12,000" : "$9,000");
    audit.record("SS Worksheet", "11", "Excess over second-tier width", line11, "max(0, Line 9 - Line 10)", {
      "Line 9": line9,
      "Line 10": line10,
    });
    audit.record("SS Worksheet", "12", "Lower-tier band", line12, "min(Line 9, Line 10)", {
      "Line 9": line9,
      "Line 10": line10,
    });
    audit.record("SS Worksheet", "13", "Half of lower-tier band", line13, "Line 12 / 2", {
      "Line 12": line12,
    });
    audit.record("SS Worksheet", "14", "50% inclusion amount", line14, "min(Line 2, Line 13)", {
      "Line 2": line2,
      "Line 13": line13,
    });
    audit.record("SS Worksheet", "15", "85% upper-tier amount", line15, "Line 11 × 85%", {
      "Line 11": line11,
    });
    audit.record("SS Worksheet", "16", "Tentative taxable benefits", line16,
      mfsLivedWithSpouse
        ? "max(0, Line 7) × 85% because the married filing separately filer lived with a spouse during the year"
        : "Line 14 + Line 15", {
        "Line 7": line7,
        "Line 14": line14,
        "Line 15": line15,
      });
    audit.record("SS Worksheet", "17", "Maximum taxable benefits", line17, "Line 1 × 85%", {
      "Line 1": line1,
    });
    audit.record("SS Worksheet", "18", "Taxable Social Security benefits", line18, "min(Line 16, Line 17)", {
      "Line 16": line16,
      "Line 17": line17,
    });
  }

  const standardTaxableBenefits = line18;
  const sortedLumpSumElectionEarlierYears = (input.lumpSumElection?.earlierYears ?? [])
    .slice()
    .sort((left, right) => left.taxYear - right.taxYear);
  const lumpSumElectionAdditionalBenefitsByYear = sortedLumpSumElectionEarlierYears
    .map((earlierYear) => calculatePub915Worksheet2AdditionalTaxableBenefits(earlierYear));
  const totalDelayedBenefitsReceivedInCurrentYear = sum(
    ...sortedLumpSumElectionEarlierYears.map((earlierYear) => d(earlierYear.delayedBenefitsReceivedInCurrentYear))
  );
  const currentYearBenefitsExcludingPriorYears = zeroFloor(line1.minus(totalDelayedBenefitsReceivedInCurrentYear));
  const currentYearExclusionsAdjustments = exclusionsAdjustments;
  const currentYearLumpSumElectionProvisionalIncome = currentYearBenefitsExcludingPriorYears
    .dividedBy(2)
    .plus(line3)
    .plus(line4)
    .plus(currentYearExclusionsAdjustments)
    .minus(line6);
  const currentYearLumpSumElectionTaxableBenefits = currentYearBenefitsExcludingPriorYears.isZero()
    ? new Decimal(0)
    : calculatePub915TaxableBenefits({
      filingStatus: input.filingStatus,
      benefitsReceived: currentYearBenefitsExcludingPriorYears,
      provisionalIncome: currentYearLumpSumElectionProvisionalIncome,
      livedWithSpouseAtAnyTimeDuringYear: input.livedWithSpouseAtAnyTimeDuringYear,
    });
  const lumpSumElectionTaxableBenefits = lumpSumElectionAdditionalBenefitsByYear.length === 0
    ? undefined
    : currentYearLumpSumElectionTaxableBenefits.plus(
      sum(...lumpSumElectionAdditionalBenefitsByYear.map((year) => year.additionalTaxableBenefits))
    );
  const usedLumpSumElection = lumpSumElectionTaxableBenefits !== undefined
    && lumpSumElectionTaxableBenefits.lessThan(standardTaxableBenefits);
  const taxableBenefits = usedLumpSumElection
    ? lumpSumElectionTaxableBenefits
    : standardTaxableBenefits;

  for (const [index, earlierYear] of lumpSumElectionAdditionalBenefitsByYear.entries()) {
    const earlierYearInput = sortedLumpSumElectionEarlierYears[index];
    audit.record(
      "SS Worksheet",
      `W2-21 (${earlierYear.taxYear})`,
      `Additional taxable benefits from the ${earlierYear.taxYear} lump-sum payment`,
      earlierYear.additionalTaxableBenefits,
      "Pub. 915 Worksheet 2 Line 21: refigured taxable benefits minus the taxable benefits previously reported for that earlier year",
      {
        "Earlier-year filing status": earlierYearInput?.filingStatus ?? "",
        "Earlier-year lived with spouse during the year":
          earlierYearInput?.livedWithSpouseAtAnyTimeDuringYear ? "yes" : "no",
        "Earlier-year benefits received": d(earlierYearInput?.benefitsReceivedInEarlierYear),
        "Delayed benefits received in current year": d(earlierYearInput?.delayedBenefitsReceivedInCurrentYear),
        "Earlier-year adjusted gross income": d(earlierYearInput?.adjustedGrossIncome),
        "Earlier-year tax-exempt interest": d(earlierYearInput?.taxExemptInterest),
        "Earlier-year exclusions and adjustments": d(earlierYearInput?.exclusionsAdjustments),
        "Taxable benefits previously reported": d(earlierYearInput?.taxableBenefitsPreviouslyReported),
        "Refigured taxable benefits": earlierYear.refiguredTaxableBenefits,
      }
    );
  }

  if (lumpSumElectionTaxableBenefits !== undefined) {
    audit.record(
      "SS Worksheet",
      "W4-21",
      "Taxable Social Security benefits under the Pub. 915 lump-sum election",
      lumpSumElectionTaxableBenefits,
      usedLumpSumElection
        ? "Pub. 915 Worksheet 4 Line 21 elected because it is lower than the current-year standard calculation"
        : "Pub. 915 Worksheet 4 Line 21 computed for comparison, but the current-year standard calculation remains lower or equal",
      {
        "Current-year benefits excluding prior-year delayed payments": currentYearBenefitsExcludingPriorYears,
        "Current-year exclusions and adjustments": currentYearExclusionsAdjustments,
        "Current-year Pub. 915 provisional income": currentYearLumpSumElectionProvisionalIncome,
        "Current-year taxable benefits under Pub. 915 Worksheet 4": currentYearLumpSumElectionTaxableBenefits,
        "Total additional taxable benefits from earlier years": sum(
          ...lumpSumElectionAdditionalBenefitsByYear.map((year) => year.additionalTaxableBenefits)
        ),
        "Standard taxable benefits": standardTaxableBenefits,
        "Election used": usedLumpSumElection ? "yes" : "no",
      }
    );
  }

  return {
    worksheetKind,
    exclusionsAdjustments,
    line1,
    line2,
    line3,
    line4,
    line5,
    line6,
    line7,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    line14,
    line15,
    line16,
    line17,
    line18,
    standardTaxableBenefits,
    lumpSumElectionTaxableBenefits,
    usedLumpSumElection,
    lumpSumElectionAdditionalBenefitsByYear,
    taxableBenefits,
    lines: audit.getLines(),
  };
}
