/**
 * New Jersey NJ-1040 overpayment allocation and charitable contribution adjustments.
 * Spec: spec/state/nj-1040-overpayment-allocation.yaml
 *
 * Applies 2025 NJ-1040 lines 67 through 80:
 * amount owed / overpayment, credit to next year's tax, charitable checkoffs,
 * and final balance due or refund.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

const NJ_2025_OTHER_DESIGNATED_CONTRIBUTION_CODES = {
  "01": "Drug Abuse Education Fund",
  "02": "Korean Veterans' Memorial Fund",
  "03": "Organ and Tissue Donor Awareness Education Fund",
  "04": "NJ-AIDS Services Fund",
  "05": "Literacy Volunteers of America - New Jersey Fund",
  "06": "New Jersey Prostate Cancer Research Fund",
  "07": "World Trade Center Scholarship Fund",
  "08": "New Jersey Veterans Haven Support Fund",
  "09": "Community Food Pantry Fund",
  "10": "Cat and Dog Spay/Neuter Fund",
  "11": "New Jersey Lung Cancer Research Fund",
  "12": "Boys and Girls Clubs in New Jersey Fund",
  "13": "NJ National Guard State Family Readiness Council Fund",
  "14": "American Red Cross - NJ Fund",
  "15": "Girl Scouts Councils in New Jersey Fund",
  "16": "Homeless Veterans Grant Fund",
  "17": "Leukemia & Lymphoma Society New Jersey Fund",
  "18": "Northern New Jersey Veterans Memorial Cemetery Development Fund",
  "19": "New Jersey Farm to School and School Garden Fund",
  "20": "Local Library Support Fund",
  "21": "ALS Association Support Fund",
  "22": "Fund for the Support of New Jersey Nonprofit Veterans Organizations",
  "23": "New Jersey Yellow Ribbon Fund",
  "24": "Autism Programs Fund",
  "25": "Boy Scouts Councils in New Jersey Fund",
  "26": "NJ Memorials to War Veterans Maintenance Fund",
  "27": "Jersey Fresh Program Fund",
  "28": "NJ World War II Veterans' Memorial Fund",
  "29": "Meals on Wheels in New Jersey Fund",
  "30": "New Jersey Pediatric Cancer Research Fund",
  "31": "Special Olympics New Jersey Fund",
  "32": "New Jersey Ovarian Cancer Research Fund",
} as const;

const SUPPORTED_OTHER_DESIGNATED_CODES: Record<number, Record<string, string>> = {
  2025: NJ_2025_OTHER_DESIGNATED_CONTRIBUTION_CODES,
};

export interface NJ1040OtherDesignatedContributionInput {
  code: string | number;
  amount?: Decimal | string | number;
}

export interface NJ1040OtherDesignatedContribution {
  line: "75" | "76" | "77";
  code: string;
  description: string;
  amount: Decimal;
}

export interface NJ1040OverpaymentAllocationInput {
  taxYear: number;
  totalTaxDue?: Decimal | string | number;
  totalPayments?: Decimal | string | number;
  creditToNextYear?: Decimal | string | number;
  endangeredWildlifeFundContribution?: Decimal | string | number;
  childrensTrustFundContribution?: Decimal | string | number;
  vietnamVeteransMemorialFundContribution?: Decimal | string | number;
  breastCancerResearchFundContribution?: Decimal | string | number;
  ussNewJerseyEducationalMuseumFundContribution?: Decimal | string | number;
  otherDesignatedContributions?: NJ1040OtherDesignatedContributionInput[];
}

export interface NJ1040OverpaymentAllocationResult {
  line67AmountOwed: Decimal;
  line68Overpayment: Decimal;
  creditToNextYear: Decimal;
  totalCharitableContributions: Decimal;
  otherDesignatedContributions: NJ1040OtherDesignatedContribution[];
  line78TotalAdjustments: Decimal;
  balanceDue: Decimal;
  refund: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040OverpaymentAllocation(
  input: NJ1040OverpaymentAllocationInput
): NJ1040OverpaymentAllocationResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 overpayment allocation rules");
  const supportedCodes = SUPPORTED_OTHER_DESIGNATED_CODES[input.taxYear];

  if (!supportedCodes) {
    throw new Error(
      `NJ-1040 overpayment allocation rules not available for ${input.taxYear}`
    );
  }

  const totalTaxDue = requireNonNegativeAmount(input.totalTaxDue, "total tax due");
  const totalPayments = requireNonNegativeAmount(input.totalPayments, "total payments");

  const line67AmountOwed = zeroFloor(totalTaxDue.minus(totalPayments));
  const line68Overpayment = zeroFloor(totalPayments.minus(totalTaxDue));

  audit.record(
    "NJ-1040",
    "67",
    "Amount owed before adjustments",
    line67AmountOwed,
    "max(0, total tax due - total payments)",
    {
      "Total tax due": totalTaxDue,
      "Total payments": totalPayments,
    }
  );

  audit.record(
    "NJ-1040",
    "68",
    "Overpayment before adjustments",
    line68Overpayment,
    "max(0, total payments - total tax due)",
    {
      "Total tax due": totalTaxDue,
      "Total payments": totalPayments,
    }
  );

  const creditToNextYear = requireNonNegativeAmount(
    input.creditToNextYear,
    "line 69 credit to next year"
  );

  if (creditToNextYear.greaterThan(line68Overpayment)) {
    throw new Error(
      "NJ-1040 line 69 credit to next year cannot exceed the line 68 overpayment"
    );
  }

  audit.record(
    "NJ-1040",
    "69",
    "Credit to 2026 tax",
    creditToNextYear,
    "Requested amount from line 68 overpayment",
    {
      "Line 68 overpayment": line68Overpayment,
    }
  );

  const line70Contribution = requireNonNegativeAmount(
    input.endangeredWildlifeFundContribution,
    "line 70 endangered wildlife fund contribution"
  );
  const line71Contribution = requireNonNegativeAmount(
    input.childrensTrustFundContribution,
    "line 71 children's trust fund contribution"
  );
  const line72Contribution = requireNonNegativeAmount(
    input.vietnamVeteransMemorialFundContribution,
    "line 72 Vietnam Veterans' Memorial Fund contribution"
  );
  const line73Contribution = requireNonNegativeAmount(
    input.breastCancerResearchFundContribution,
    "line 73 breast cancer research fund contribution"
  );
  const line74Contribution = requireNonNegativeAmount(
    input.ussNewJerseyEducationalMuseumFundContribution,
    "line 74 U.S.S. New Jersey Educational Museum Fund contribution"
  );

  audit.record("NJ-1040", "70", "Endangered Wildlife Fund contribution", line70Contribution, "Requested contribution amount");
  audit.record("NJ-1040", "71", "Children's Trust Fund contribution", line71Contribution, "Requested contribution amount");
  audit.record("NJ-1040", "72", "Vietnam Veterans' Memorial Fund contribution", line72Contribution, "Requested contribution amount");
  audit.record("NJ-1040", "73", "Breast Cancer Research Fund contribution", line73Contribution, "Requested contribution amount");
  audit.record("NJ-1040", "74", "U.S.S. New Jersey Educational Museum Fund contribution", line74Contribution, "Requested contribution amount");

  const otherDesignatedInput = input.otherDesignatedContributions ?? [];
  if (otherDesignatedInput.length > 3) {
    throw new Error(
      "NJ-1040 lines 75 through 77 allow up to three designated contributions"
    );
  }

  const otherDesignatedContributions = otherDesignatedInput.map((entry, index) => {
    const line = (75 + index).toString() as "75" | "76" | "77";
    const code = String(entry.code).padStart(2, "0");
    const description = supportedCodes[code];

    if (!description) {
      throw new Error(`Invalid charitable contribution code for NJ-1040 lines 75-77: ${code}`);
    }

    const amount = requireNonNegativeAmount(
      entry.amount,
      `line ${line} designated contribution amount`
    );

    audit.record(
      "NJ-1040",
      line,
      `Other designated contribution (${description})`,
      amount,
      "Requested designated contribution amount",
      {
        Code: code,
      }
    );

    return {
      line,
      code,
      description,
      amount,
    };
  });

  for (let index = otherDesignatedContributions.length; index < 3; index++) {
    const line = (75 + index).toString();
    audit.record(
      "NJ-1040",
      line,
      "Other designated contribution",
      new Decimal(0),
      "No designated contribution selected"
    );
  }

  const totalCharitableContributions = sum(
    line70Contribution,
    line71Contribution,
    line72Contribution,
    line73Contribution,
    line74Contribution,
    ...otherDesignatedContributions.map((entry) => entry.amount)
  );

  const line78TotalAdjustments = creditToNextYear.plus(totalCharitableContributions);
  const balanceDue = zeroFloor(
    line67AmountOwed.plus(line78TotalAdjustments).minus(line68Overpayment)
  );
  const refund = zeroFloor(line68Overpayment.minus(line78TotalAdjustments));

  audit.record(
    "NJ-1040",
    "78",
    "Total adjustments to tax due/overpayment amount",
    line78TotalAdjustments,
    "Line 69 + lines 70 through 77",
    {
      "Line 69": creditToNextYear,
      "Charitable contributions": totalCharitableContributions,
    }
  );

  audit.record(
    "NJ-1040",
    "79",
    "Final balance due after adjustments",
    balanceDue,
    "max(0, line 67 + line 78 - line 68)",
    {
      "Line 67": line67AmountOwed,
      "Line 68": line68Overpayment,
      "Line 78": line78TotalAdjustments,
    }
  );

  audit.record(
    "NJ-1040",
    "80",
    "Final refund after adjustments",
    refund,
    "max(0, line 68 - line 78)",
    {
      "Line 68": line68Overpayment,
      "Line 78": line78TotalAdjustments,
    }
  );

  return {
    line67AmountOwed,
    line68Overpayment,
    creditToNextYear,
    totalCharitableContributions,
    otherDesignatedContributions,
    line78TotalAdjustments,
    balanceDue,
    refund,
    lines: audit.getLines(),
  };
}

function requireNonNegativeAmount(
  value: Decimal | string | number | undefined,
  label: string
): Decimal {
  const amount = d(value);
  if (amount.isNegative()) {
    throw new Error(`NJ-1040 ${label} cannot be negative`);
  }
  return amount;
}
