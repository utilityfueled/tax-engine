/**
 * Illinois Expanded EITC Worksheet
 * Spec: spec/state/il-expanded-eitc-worksheet.yaml
 *
 * Computes the federal EITC-equivalent amount that feeds Schedule IL-E/EIC
 * Step 4, Line 6 when Illinois expanded-EITC rules apply.
 */

import Decimal from "decimal.js";
import {
  getConstants,
  IL_SCHEDULE_E_EIC_CONSTANTS as SHARED_IL_SCHEDULE_E_EIC_CONSTANTS,
  type FilingStatus,
  type IllinoisScheduleEEICConstants,
} from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { zeroFloor } from "@/utils/decimal.js";

const ZERO = new Decimal(0);

export type ILScheduleEEICConstants = IllinoisScheduleEEICConstants;
export const IL_SCHEDULE_E_EIC_CONSTANTS = SHARED_IL_SCHEDULE_E_EIC_CONSTANTS;

export interface IllinoisExpandedEITCWorksheetInput {
  taxYear: number;
  filingStatus: FilingStatus;
  qualifyingChildCount: number;

  form1040Line1z: Decimal;
  excludedMedicaidWaiverPayments: Decimal;
  electedNontaxableCombatPay: Decimal;
  scheduleSELine3: Decimal;
  scheduleSELine4bAnd5a: Decimal;
  scheduleSELine13: Decimal;
  part3NetFarmProfitOrLoss: Decimal;
  part3NetBusinessProfitOrLoss: Decimal;
  statutoryEmployeeIncome: Decimal;

  agi: Decimal;
  investmentIncome: Decimal;

  filedForm2555: boolean;
  taxpayerOrSpouseUsResidentHalfYear: boolean;
  mainHomeInUSMoreThanHalfYear?: boolean;
  canBeClaimedAsDependent?: boolean;
  canBeQualifyingChildOfAnother: boolean;
  separatedSpouseEitcEligible: boolean;
  hasComplexInvestmentIncome?: boolean;
  primaryAge: number;
  spouseAge?: number;
}

export interface IllinoisExpandedEITCWorksheetResult {
  totalEarnedIncome: Decimal;
  line18: Decimal;
  line22?: Decimal;
  line23: Decimal;
  qualifies: boolean;
  disqualificationReason?: string;
  lines: CalculatedLine[];
}

export function calculateIllinoisExpandedEITCWorksheet(
  input: IllinoisExpandedEITCWorksheetInput,
): IllinoisExpandedEITCWorksheetResult {
  const constants = IL_SCHEDULE_E_EIC_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(
      `IL Schedule IL-E/EIC constants not available for tax year ${input.taxYear}`,
    );
  }

  const audit = new AuditTrail();
  const FORM = "Illinois Expanded EITC Worksheet";
  const childKey = Math.min(Math.max(input.qualifyingChildCount, 0), 3) as 0 | 1 | 2 | 3;
  const thresholdKey = getThresholdKey(input.filingStatus);

  if (input.hasComplexInvestmentIncome) {
    audit.record(
      FORM,
      "worksheet1-line14",
      "Federal Pub. 596 Worksheet 1 investment income total",
      input.investmentIncome,
      "IRS Pub. 596 Worksheet 1, Line 14",
      {
        investmentIncome: input.investmentIncome,
      },
    );
  }

  const line1 = audit.record(
    FORM,
    "1",
    "Wages, salaries, and tips",
    input.form1040Line1z,
    "Federal Form 1040 or 1040-SR, Line 1z",
    { form1040Line1z: input.form1040Line1z },
  );
  const line2 = audit.record(
    FORM,
    "2",
    "Medicaid waiver payments excluded from earned income",
    input.excludedMedicaidWaiverPayments,
    "Federal Form 1040 or 1040-SR, Line 1d elected out of earned income",
    { excludedMedicaidWaiverPayments: input.excludedMedicaidWaiverPayments },
  );
  const line3 = audit.record(
    FORM,
    "3",
    "Adjusted wages after Medicaid waiver exclusion",
    line1.minus(line2),
    "Line 1 - Line 2",
    { line1, line2 },
  );
  const line4 = audit.record(
    FORM,
    "4",
    "Nontaxable combat pay elected into earned income",
    input.electedNontaxableCombatPay,
    "Federal Form 1040 or 1040-SR, Line 1i elected into earned income",
    { electedNontaxableCombatPay: input.electedNontaxableCombatPay },
  );
  const line5 = audit.record(FORM, "5", "Part 1 earned income subtotal", line3.plus(line4), "Line 3 + Line 4", {
    line3,
    line4,
  });

  const line6 = audit.record(FORM, "6", "Schedule SE Part I, Line 3", input.scheduleSELine3, "Input", {
    scheduleSELine3: input.scheduleSELine3,
  });
  const line7 = audit.record(
    FORM,
    "7",
    "Schedule SE Part I, Lines 4b and 5a",
    input.scheduleSELine4bAnd5a,
    "Input",
    { scheduleSELine4bAnd5a: input.scheduleSELine4bAnd5a },
  );
  const line8 = audit.record(FORM, "8", "Schedule SE subtotal", line6.plus(line7), "Line 6 + Line 7", {
    line6,
    line7,
  });
  const line9 = audit.record(FORM, "9", "Schedule SE Part I, Line 13", input.scheduleSELine13, "Input", {
    scheduleSELine13: input.scheduleSELine13,
  });
  const line10 = audit.record(FORM, "10", "Net self-employment earned income from Schedule SE", line8.minus(line9), "Line 8 - Line 9", {
    line8,
    line9,
  });

  const line11 = audit.record(
    FORM,
    "11",
    "Net farm profit or loss for Part 3",
    input.part3NetFarmProfitOrLoss,
    "Input",
    { part3NetFarmProfitOrLoss: input.part3NetFarmProfitOrLoss },
  );
  const line12 = audit.record(
    FORM,
    "12",
    "Net nonfarm profit or loss for Part 3",
    input.part3NetBusinessProfitOrLoss,
    "Input",
    { part3NetBusinessProfitOrLoss: input.part3NetBusinessProfitOrLoss },
  );
  const line13 = audit.record(FORM, "13", "Statutory employee income", input.statutoryEmployeeIncome, "Input", {
    statutoryEmployeeIncome: input.statutoryEmployeeIncome,
  });
  const line14 = audit.record(
    FORM,
    "14",
    "Part 3 total",
    line10.plus(line11).plus(line12).plus(line13),
    "Line 10 + Line 11 + Line 12 + Line 13",
    { line10, line11, line12, line13 },
  );
  const line15 = audit.record(
    FORM,
    "15",
    "Total earned income",
    zeroFloor(line5.plus(line14)),
    "max(Line 5 + Line 14, 0)",
    { line5, line14 },
  );

  const line16Limit = constants.expandedIncomeLimit[thresholdKey][childKey];
  const line16Passes = line15.lessThan(line16Limit);
  audit.record(
    FORM,
    "16",
    "Income limit test",
    line16Passes ? new Decimal(1) : ZERO,
    "Line 15 must be less than the published Table 1 threshold",
    {
      line15,
      line16Limit,
      qualifyingChildCount: new Decimal(childKey),
      filingStatus: input.filingStatus,
    },
  );

  const qualificationFailure = findQualificationFailure(input, constants, line15, thresholdKey, childKey);
  if (qualificationFailure) {
    const line18 = audit.record(FORM, "18", "Federal EITC amount from earned income", ZERO, `Not allowed: ${qualificationFailure}`, {
      line15,
    });
    const line23 = audit.record(FORM, "23", "Federal EITC calculation used for Illinois Line 6", ZERO, `Not allowed: ${qualificationFailure}`, {
      line18,
    });

    return {
      totalEarnedIncome: line15,
      line18,
      line23,
      qualifies: false,
      disqualificationReason: qualificationFailure,
      lines: audit.getLines(),
    };
  }

  const line17 = audit.record(FORM, "17", "Earned income used for EITC lookup", line15, "Line 15", {
    line15,
  });
  const line18 = audit.record(
    FORM,
    "18",
    "Federal EITC amount from earned income",
    calculateFederalEicTableAmount(input.taxYear, input.filingStatus, childKey, line17),
    "Federal EIC table amount for Line 17",
    {
      line17,
      filingStatus: input.filingStatus,
      qualifyingChildCount: new Decimal(childKey),
    },
  );
  const line19 = audit.record(FORM, "19", "Adjusted gross income", input.agi, "Federal Form 1040 or 1040-SR, Line 11a", {
    agi: input.agi,
  });
  const line20Matches = line17.equals(line19);
  audit.record(FORM, "20", "Earned income equals AGI test", line20Matches ? new Decimal(1) : ZERO, "Line 17 = Line 19", {
    line17,
    line19,
  });

  let line22: Decimal | undefined;
  if (!line20Matches) {
    const line21Limit = childKey === 0
      ? constants.expandedAgiThreshold.noChildren[thresholdKey]
      : constants.expandedAgiThreshold.withChildren[thresholdKey];
    const line21Passes = line19.lessThan(line21Limit);
    audit.record(
      FORM,
      "21",
      "AGI lookup threshold test",
      line21Passes ? new Decimal(1) : ZERO,
      "Published AGI threshold test for Line 22 lookup",
      {
        line19,
        line21Limit,
        qualifyingChildCount: new Decimal(childKey),
      },
    );

    if (!line21Passes) {
      line22 = audit.record(
        FORM,
        "22",
        "Federal EITC amount from AGI",
        calculateFederalEicTableAmount(input.taxYear, input.filingStatus, childKey, line19),
        "Federal EIC table amount for Line 19",
        {
          line19,
          filingStatus: input.filingStatus,
          qualifyingChildCount: new Decimal(childKey),
        },
      );
    }
  }

  const line23 = audit.record(
    FORM,
    "23",
    "Federal EITC calculation used for Illinois Line 6",
    line22 ? Decimal.min(line18, line22) : line18,
    line22 ? "min(Line 18, Line 22)" : "Line 18",
    { line18, line22: line22 ?? ZERO },
  );

  return {
    totalEarnedIncome: line15,
    line18,
    line22,
    line23,
    qualifies: true,
    lines: audit.getLines(),
  };
}

function calculateFederalEicTableAmount(
  taxYear: number,
  filingStatus: FilingStatus,
  qualifyingChildCount: 0 | 1 | 2 | 3,
  income: Decimal,
): Decimal {
  const federalConstants = getConstants(taxYear).eitc;
  const phaseOutStart = filingStatus === "married_filing_jointly"
    ? federalConstants.phaseOutStartMFJ[qualifyingChildCount]
    : federalConstants.phaseOutStartSingleHoH[qualifyingChildCount];
  const phaseInCredit = federalConstants.creditRate[qualifyingChildCount].times(
    Decimal.min(income, federalConstants.earnedIncomeAmount[qualifyingChildCount]),
  );
  const phaseOutReduction = federalConstants.phaseOutRate[qualifyingChildCount].times(
    Decimal.max(ZERO, income.minus(phaseOutStart)),
  );

  return Decimal.max(ZERO, phaseInCredit.minus(phaseOutReduction).floor());
}

function findQualificationFailure(
  input: IllinoisExpandedEITCWorksheetInput,
  constants: IllinoisScheduleEEICConstants,
  line15: Decimal,
  thresholdKey: "mfj" | "other",
  childKey: 0 | 1 | 2 | 3,
): string | undefined {
  const publishedIncomeLimit = constants.expandedIncomeLimit[thresholdKey][childKey];

  if (!line15.lessThan(publishedIncomeLimit)) {
    return `Line 15 must be less than $${publishedIncomeLimit.toFixed(0)}`;
  }

  if (!input.agi.lessThan(publishedIncomeLimit)) {
    return `Form 1040 line 11a must be less than $${publishedIncomeLimit.toFixed(0)}`;
  }

  if (input.filedForm2555) {
    return "Federal Form 2555 filers cannot claim the Illinois Expanded EITC";
  }

  if (!input.taxpayerOrSpouseUsResidentHalfYear) {
    return "Taxpayer or spouse must be a U.S. resident for at least half the tax year";
  }

  if (input.investmentIncome.greaterThan(constants.expandedInvestmentIncomeLimit)) {
    return `Investment income exceeds $${constants.expandedInvestmentIncomeLimit.toFixed(0)}`;
  }

  if (childKey > 0) {
    if (
      input.filingStatus === "married_filing_separately"
      && !input.separatedSpouseEitcEligible
    ) {
      return "Married filing separately requires the separated-spouse eligibility rules";
    }

    if (input.canBeQualifyingChildOfAnother) {
      return "Taxpayer cannot be another person's qualifying child";
    }

    return undefined;
  }

  if (input.filingStatus === "married_filing_separately") {
    return "Married filing separately without a qualifying child cannot claim the Illinois Expanded EITC";
  }

  const oldestRelevantAge = Math.max(input.primaryAge, input.spouseAge ?? 0);
  if (oldestRelevantAge < constants.expandedChildlessMinimumAge) {
    return `At least one filer must be age ${constants.expandedChildlessMinimumAge} or older`;
  }

  if (!input.mainHomeInUSMoreThanHalfYear) {
    return "Main home must be in the United States for more than half the tax year";
  }

  if (input.canBeQualifyingChildOfAnother) {
    return "Taxpayer cannot be another person's qualifying child";
  }

  if (input.canBeClaimedAsDependent) {
    return "Taxpayer cannot be claimed as a dependent on another return";
  }

  return undefined;
}

function getThresholdKey(filingStatus: FilingStatus): "mfj" | "other" {
  return filingStatus === "married_filing_jointly" ? "mfj" : "other";
}
