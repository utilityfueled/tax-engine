/**
 * California Form 540 resident total-tax assembly.
 * Spec: spec/state/ca-form-540-total-tax.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { calculateCABehavioralHealthServicesTax } from "@/engine/state/ca-behavioral-health-services-tax.js";
import {
  calculateCAForm540ChildAdoptionCostsCredit,
  type CAForm540ChildAdoptionCostsCreditInput,
} from "@/engine/state/ca-form-540-child-adoption-costs-credit.js";
import {
  calculateCAForm540ChildAndDependentCareCredit,
  type CAForm540ChildAndDependentCareCreditInput,
} from "@/engine/state/ca-form-540-child-and-dependent-care-credit.js";
import {
  calculateCAForm540DependentParentCredit,
  type CAForm540DependentParentCreditInput,
} from "@/engine/state/ca-form-540-dependent-parent-credit.js";
import { calculateCAForm540ExemptionCredits } from "@/engine/state/ca-form-540-exemption-credits.js";
import {
  calculateCAForm540JointCustodyHeadOfHouseholdCredit,
  type CAForm540JointCustodyHeadOfHouseholdCreditInput,
} from "@/engine/state/ca-form-540-joint-custody-head-of-household-credit.js";
import {
  calculateCAForm540RentersCredit,
  type CAForm540RentersCreditInput,
} from "@/engine/state/ca-form-540-renters-credit.js";
import {
  calculateCAForm540SeniorHeadOfHouseholdCredit,
  type CAForm540SeniorHeadOfHouseholdCreditInput,
} from "@/engine/state/ca-form-540-senior-head-of-household-credit.js";
import {
  calculateCASchedulePSupportedCredits,
  type CASchedulePAdditionalCarryoverCreditInput,
  type CASchedulePAdditionalCarryoverCreditResult,
} from "@/engine/state/ca-schedule-p.js";
import { calculateCAForm540TaxRateSchedules } from "@/engine/state/ca-form-540-tax-rate-schedules.js";
import { calculateCAForm540TaxTable } from "@/engine/state/ca-form-540-tax-table.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

export type CAForm540ResidentLine31Source = "tax_table" | "tax_rate_schedule";
export type CAForm540ResidentLine40ChildAndDependentCareCreditInput = Omit<
  CAForm540ChildAndDependentCareCreditInput,
  "filingStatus" | "federalAgi" | "taxYear"
>;
export type CAForm540ResidentLine43SeniorHeadOfHouseholdCreditInput = Omit<
  CAForm540SeniorHeadOfHouseholdCreditInput,
  "taxYear" | "taxableIncome"
>;
export type CAForm540ResidentLine44JointCustodyHeadOfHouseholdCreditInput = Omit<
  CAForm540JointCustodyHeadOfHouseholdCreditInput,
  "filingStatus" | "taxBeforeCredits" | "taxYear"
>;
export type CAForm540ResidentLine45DependentParentCreditInput = Omit<
  CAForm540DependentParentCreditInput,
  "filingStatus" | "taxBeforeCredits" | "taxYear"
>;
export type CAForm540ResidentLine45ChildAdoptionCostsCreditInput = Omit<
  CAForm540ChildAdoptionCostsCreditInput,
  "taxYear"
>;
export type CAForm540ResidentLine45SchedulePAdditionalCarryoverCreditInput =
  CASchedulePAdditionalCarryoverCreditInput;
export type CAForm540ResidentLine46RentersCreditInput = Omit<
  CAForm540RentersCreditInput,
  "filingStatus" | "taxYear"
>;

export interface CAForm540ResidentTotalTaxInput {
  taxableIncome: Decimal | string | number;
  filingStatus: FilingStatus;
  federalAgi: Decimal | string | number;
  personalExemptionCount: number;
  blindExemptionCount: number;
  seniorExemptionCount: number;
  dependentExemptionCount: number;
  line34Tax?: Decimal | string | number;
  schedulePTentativeMinimumTax?: Decimal | string | number;
  line40Credit?: Decimal | string | number;
  line40ChildAndDependentCareCreditInput?: CAForm540ResidentLine40ChildAndDependentCareCreditInput;
  line43Credit?: Decimal | string | number;
  line43SeniorHeadOfHouseholdCreditInput?: CAForm540ResidentLine43SeniorHeadOfHouseholdCreditInput;
  line44Credit?: Decimal | string | number;
  line44JointCustodyHeadOfHouseholdCreditInput?: CAForm540ResidentLine44JointCustodyHeadOfHouseholdCreditInput;
  line45Credit?: Decimal | string | number;
  line45DependentParentCreditInput?: CAForm540ResidentLine45DependentParentCreditInput;
  line45ChildAdoptionCostsCreditInput?: CAForm540ResidentLine45ChildAdoptionCostsCreditInput;
  line45SchedulePAdditionalCarryoverCredits?: CAForm540ResidentLine45SchedulePAdditionalCarryoverCreditInput[];
  line45SchedulePLine19RemainingNetTaxBeforeOtherStateTaxCredit?: Decimal | string | number;
  line45OtherStateTaxCreditAmount?: Decimal | string | number;
  line45PassThroughEntityElectiveTaxCreditAmount?: Decimal | string | number;
  line46Credit?: Decimal | string | number;
  line46RentersCreditInput?: CAForm540ResidentLine46RentersCreditInput;
  line61AlternativeMinimumTax?: Decimal | string | number;
  line63OtherTaxes?: Decimal | string | number;
  taxYear: number;
}

export interface CAForm540ResidentTotalTaxResult {
  taxableIncome: Decimal;
  filingStatus: FilingStatus;
  federalAgi: Decimal;
  line31Source: CAForm540ResidentLine31Source;
  line31Tax: Decimal;
  line32ExemptionCredits: Decimal;
  line33TaxAfterExemptionCredits: Decimal;
  line34Tax: Decimal;
  line35Tax: Decimal;
  line40Credit: Decimal;
  line43Credit: Decimal;
  line44Credit: Decimal;
  line45Credit: Decimal;
  line45SupportedCarryoverCredit: Decimal;
  line45AdditionalCarryoverCredits: CASchedulePAdditionalCarryoverCreditResult[];
  line45PassThroughEntityElectiveTaxCarryover: Decimal;
  line46Credit: Decimal;
  line47TotalCredits: Decimal;
  line48TaxAfterCredits: Decimal;
  line61AlternativeMinimumTax: Decimal;
  line62BehavioralHealthServicesTax: Decimal;
  line63OtherTaxes: Decimal;
  line64TotalTax: Decimal;
  lines: CalculatedLine[];
}

function nonNegativeAmount(
  value: Decimal | string | number | undefined,
  description: string
): Decimal {
  const amount = d(value);
  if (amount.lessThan(0)) {
    throw new Error(`${description} must be non-negative`);
  }

  return amount;
}

export function calculateCAForm540ResidentTotalTax(
  input: CAForm540ResidentTotalTaxInput
): CAForm540ResidentTotalTaxResult {
  if ("line41Credit" in (input as object) || "line42Credit" in (input as object)) {
    throw new Error("CA Form 540 does not support resident credit inputs for nonexistent lines 41 or 42");
  }

  const taxableIncome = zeroFloor(d(input.taxableIncome));
  const federalAgi = d(input.federalAgi);

  const line34Tax = nonNegativeAmount(input.line34Tax, "CA Form 540 line 34 tax");
  if (input.line40Credit !== undefined && input.line40ChildAndDependentCareCreditInput !== undefined) {
    throw new Error(
      "CA Form 540 line 40 cannot accept both a child and dependent care worksheet input and a direct credit amount"
    );
  }

  let line40Credit = nonNegativeAmount(input.line40Credit, "CA Form 540 line 40 credit");
  let line40Formula = "Supported upstream input for Form 540 line 40";
  let line40AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line40SupportingLines: CalculatedLine[] = [];

  if (input.line40ChildAndDependentCareCreditInput !== undefined) {
    const line40Calculation = calculateCAForm540ChildAndDependentCareCredit({
      ...input.line40ChildAndDependentCareCreditInput,
      filingStatus: input.filingStatus,
      federalAgi,
      taxYear: input.taxYear,
    });

    line40Credit = line40Calculation.line12Line40Credit;
    line40Formula = "Use the supported Form 540 line 40 child and dependent care credit calculation";
    line40AuditInputs = {
      "Qualification status": line40Calculation.qualifies
        ? "qualified"
        : `disqualified:${line40Calculation.disqualificationReason}`,
      "Computation path": "ca_form_540_child_and_dependent_care_credit",
    };
    line40SupportingLines = line40Calculation.lines.filter((line) => line.form === "CA-3506");
  }
  if (input.line43Credit !== undefined && input.line43SeniorHeadOfHouseholdCreditInput !== undefined) {
    throw new Error(
      "CA Form 540 line 43 cannot accept both a Senior Head of Household worksheet input and a direct credit amount"
    );
  }

  let line43Credit = nonNegativeAmount(input.line43Credit, "CA Form 540 line 43 credit");
  let line43Description = "Special credit";
  let line43Formula = "Supported upstream input for Form 540 line 43";
  let line43AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line43SupportingLines: CalculatedLine[] = [];

  if (input.line43SeniorHeadOfHouseholdCreditInput !== undefined) {
    const line43Calculation = calculateCAForm540SeniorHeadOfHouseholdCredit({
      ...input.line43SeniorHeadOfHouseholdCreditInput,
      taxableIncome,
      taxYear: input.taxYear,
    });

    line43Credit = line43Calculation.line3Credit;
    line43Description = "Credit for Senior Head of Household";
    line43Formula = "Use the supported California Senior Head of Household credit calculation";
    line43AuditInputs = {
      "Qualification status": line43Calculation.qualifies
        ? "qualified"
        : `disqualified:${line43Calculation.disqualificationReason}`,
      "Credit code": "163",
      "Computation path": "ca_form_540_senior_head_of_household_credit",
    };
    line43SupportingLines = line43Calculation.lines.filter((line) => line.form === "CA-SHOH");
  }

  let line44Credit = nonNegativeAmount(input.line44Credit, "CA Form 540 line 44 credit");
  let line44Description = "Special credit";
  let line44Formula = "Supported upstream input for Form 540 line 44";
  let line44AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line44SupportingLines: CalculatedLine[] = [];
  if (
    input.line45Credit !== undefined &&
    (input.line45DependentParentCreditInput !== undefined ||
      input.line45ChildAdoptionCostsCreditInput !== undefined ||
      (input.line45SchedulePAdditionalCarryoverCredits?.length ?? 0) > 0 ||
      input.line45OtherStateTaxCreditAmount !== undefined ||
      input.line45PassThroughEntityElectiveTaxCreditAmount !== undefined)
  ) {
    throw new Error(
      "CA Form 540 line 45 cannot accept both supported worksheet inputs and a direct credit amount"
    );
  }

  let line45Credit = nonNegativeAmount(input.line45Credit, "CA Form 540 line 45 credit");
  let line45Formula = "Supported upstream input for Form 540 line 45";
  let line45AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line45DependentParentAvailableCredit = d(0);
  let line45ChildAdoptionCostsAvailableCredit = d(0);
  let line45ChildAdoptionCostsWorksheetCarryover = d(0);
  const line45SchedulePAdditionalCarryoverCredits =
    input.line45SchedulePAdditionalCarryoverCredits ?? [];
  let line45OtherStateTaxAvailableCredit = d(0);
  let line45PassThroughEntityElectiveTaxAvailableCredit = d(0);
  let line45SupportingLines: CalculatedLine[] = [];
  const line45SupportedCreditCodes: string[] = [];
  if (input.line46Credit !== undefined && input.line46RentersCreditInput !== undefined) {
    throw new Error(
      "CA Form 540 line 46 cannot accept both a renter's credit worksheet input and a direct credit amount"
    );
  }

  let line46Credit = nonNegativeAmount(input.line46Credit, "CA Form 540 line 46 credit");
  let line46Formula = "Supported upstream input for Form 540 line 46";
  let line46AuditInputs: Record<string, Decimal | string> = {
    "Computation path": "upstream_input",
  };
  let line46SupportingLines: CalculatedLine[] = [];

  if (input.line46RentersCreditInput !== undefined) {
    const line46Calculation = calculateCAForm540RentersCredit({
      ...input.line46RentersCreditInput,
      filingStatus: input.filingStatus,
      taxYear: input.taxYear,
    });

    line46Credit = line46Calculation.line46RentersCredit;
    line46Formula = "Use the supported Form 540 renter's credit calculation";
    line46AuditInputs = {
      "Qualification status": line46Calculation.qualifies
        ? "qualified"
        : `disqualified:${line46Calculation.disqualificationReason}`,
      "Credit amount rule": line46Calculation.creditAmountRule,
      "Computation path": "ca_form_540_renters_credit",
    };
    line46SupportingLines = line46Calculation.lines.filter((line) => line.form === "CA-540-RC");
  }

  const line61AlternativeMinimumTax = nonNegativeAmount(
    input.line61AlternativeMinimumTax,
    "CA Form 540 line 61 alternative minimum tax"
  );
  const schedulePTentativeMinimumTax = nonNegativeAmount(
    input.schedulePTentativeMinimumTax,
    "CA Schedule P tentative minimum tax"
  );
  const line63OtherTaxes = nonNegativeAmount(input.line63OtherTaxes, "CA Form 540 line 63 other taxes");

  const line31Calculation =
    taxableIncome.lessThanOrEqualTo(100000)
      ? calculateCAForm540TaxTable({
          taxableIncome,
          filingStatus: input.filingStatus,
          taxYear: input.taxYear,
        })
      : calculateCAForm540TaxRateSchedules({
          taxableIncome,
          filingStatus: input.filingStatus,
          taxYear: input.taxYear,
        });

  const line31Source: CAForm540ResidentLine31Source = taxableIncome.lessThanOrEqualTo(100000)
    ? "tax_table"
    : "tax_rate_schedule";
  const line31Tax = line31Calculation.tax;

  const line32Calculation = calculateCAForm540ExemptionCredits({
    filingStatus: input.filingStatus,
    federalAgi,
    personalExemptionCount: input.personalExemptionCount,
    blindExemptionCount: input.blindExemptionCount,
    seniorExemptionCount: input.seniorExemptionCount,
    dependentExemptionCount: input.dependentExemptionCount,
    taxYear: input.taxYear,
  });
  const line32ExemptionCredits = line32Calculation.line32ExemptionCredits;

  const line33TaxAfterExemptionCredits = zeroFloor(line31Tax.minus(line32ExemptionCredits));
  const line35Tax = line33TaxAfterExemptionCredits.plus(line34Tax);

  if (input.line44Credit !== undefined && input.line44JointCustodyHeadOfHouseholdCreditInput !== undefined) {
    throw new Error(
      "CA Form 540 line 44 cannot accept both a Joint Custody Head of Household worksheet input and a direct credit amount"
    );
  }

  if (input.line44JointCustodyHeadOfHouseholdCreditInput !== undefined) {
    const line44Calculation = calculateCAForm540JointCustodyHeadOfHouseholdCredit({
      ...input.line44JointCustodyHeadOfHouseholdCreditInput,
      filingStatus: input.filingStatus,
      taxBeforeCredits: line35Tax,
      taxYear: input.taxYear,
    });

    line44Credit = line44Calculation.line3Credit;
    line44Description = "Credit for Joint Custody Head of Household";
    line44Formula = "Use the supported California Joint Custody Head of Household credit calculation";
    line44AuditInputs = {
      "Qualification status": line44Calculation.qualifies
        ? "qualified"
        : `disqualified:${line44Calculation.disqualificationReason}`,
      "Credit code": "170",
      "Computation path": "ca_form_540_joint_custody_head_of_household_credit",
    };
    line44SupportingLines = line44Calculation.lines.filter((line) => line.form === "CA-JCHH");
  }

  if (input.line45DependentParentCreditInput !== undefined) {
    const line45Calculation = calculateCAForm540DependentParentCredit({
      ...input.line45DependentParentCreditInput,
      filingStatus: input.filingStatus,
      taxBeforeCredits: line35Tax,
      taxYear: input.taxYear,
    });

    line45DependentParentAvailableCredit = line45Calculation.line3Credit;
    line45Formula = "Use the supported California Dependent Parent credit calculation";
    line45AuditInputs = {
      "Qualification status": line45Calculation.qualifies
        ? "qualified"
        : `disqualified:${line45Calculation.disqualificationReason}`,
      "Credit code": "173",
      "Computation path": "ca_form_540_dependent_parent_credit",
    };
    line45SupportingLines = line45Calculation.lines.filter((line) => line.form === "CA-DPC");
    line45SupportedCreditCodes.push("173");
  }

  if (input.line45ChildAdoptionCostsCreditInput !== undefined) {
    const line45Calculation = calculateCAForm540ChildAdoptionCostsCredit({
      ...input.line45ChildAdoptionCostsCreditInput,
      taxYear: input.taxYear,
    });

    line45ChildAdoptionCostsAvailableCredit = line45Calculation.line4CurrentYearCredit;
    line45ChildAdoptionCostsWorksheetCarryover = line45Calculation.line5CarryoverCredit;
    line45SupportingLines = [
      ...line45SupportingLines,
      ...line45Calculation.lines.filter((line) => line.form === "CA-197"),
    ];

    if (input.line45DependentParentCreditInput === undefined) {
      line45Formula = "Use the supported California Child Adoption Costs credit calculation";
      line45AuditInputs = {
        "Qualification status": line45Calculation.qualifies
          ? "qualified"
          : `disqualified:${line45Calculation.disqualificationReason}`,
        "Credit code": "197",
        "Carryover credit": line45Calculation.line5CarryoverCredit,
        "Computation path": "ca_form_540_child_adoption_costs_credit",
      };
    } else {
      line45Formula = "Sum the supported California line 45 special-credit calculations";
      line45AuditInputs = {
        "Computation path": "ca_form_540_line_45_special_credit_sum",
        "Credit codes": "173,197",
        "Credit code 173 qualification status":
          line45AuditInputs["Qualification status"] ?? "unknown",
        "Credit code 197 qualification status": line45Calculation.qualifies
          ? "qualified"
          : `disqualified:${line45Calculation.disqualificationReason}`,
        "Credit code 197 carryover credit": line45Calculation.line5CarryoverCredit,
      };
    }

    line45SupportedCreditCodes.push("197");
  }

  if (line45SchedulePAdditionalCarryoverCredits.length > 0) {
    line45SupportedCreditCodes.push(
      ...line45SchedulePAdditionalCarryoverCredits.map((credit) => credit.code.trim())
    );

    if (line45SupportedCreditCodes.length === line45SchedulePAdditionalCarryoverCredits.length) {
      line45Formula = "Use the supported Schedule P blank B2 carryover-credit inputs";
      line45AuditInputs = {
        "Computation path": "ca_form_540_schedule_p_blank_b2_carryover_credits",
        "Credit codes": line45SupportedCreditCodes.join(","),
      };
    }
  }

  if (input.line45OtherStateTaxCreditAmount !== undefined) {
    line45OtherStateTaxAvailableCredit = nonNegativeAmount(
      input.line45OtherStateTaxCreditAmount,
      "CA Form 540 line 45 other state tax credit amount"
    );
    line45SupportedCreditCodes.push("187");

    if (line45SupportedCreditCodes.length === 1) {
      line45Formula = "Use the supported Schedule S (540) line 12 other state tax credit amount";
      line45AuditInputs = {
        "Computation path": "ca_form_540_schedule_s_other_state_tax_credit",
        "Credit code": "187",
        "Source line": "Schedule S (540) line 12",
      };
    }
  }

  if (input.line45PassThroughEntityElectiveTaxCreditAmount !== undefined) {
    line45PassThroughEntityElectiveTaxAvailableCredit = nonNegativeAmount(
      input.line45PassThroughEntityElectiveTaxCreditAmount,
      "CA Form 540 line 45 pass-through entity elective tax credit amount"
    );
    line45SupportedCreditCodes.push("242");

    if (line45SupportedCreditCodes.length === 1) {
      line45Formula = "Use the supported FTB 3804-CR pass-through entity elective tax credit amount";
      line45AuditInputs = {
        "Computation path": "ca_form_540_ftb_3804_cr_pass_through_entity_elective_tax_credit",
        "Credit code": "242",
        "Source worksheet": "FTB 3804-CR",
      };
    }
  }

  if (
    line45SupportedCreditCodes.length > 1 &&
    (line45SchedulePAdditionalCarryoverCredits.length > 0 ||
      line45SupportedCreditCodes.some((code) => code === "187" || code === "242"))
  ) {
    line45Formula = "Sum the supported California line 45 credit amounts that flow through Schedule P";
    line45AuditInputs = {
      ...line45AuditInputs,
      "Computation path": "ca_form_540_line_45_supported_credit_sum",
      "Credit codes": line45SupportedCreditCodes.join(","),
    };
  }

  const schedulePResult = calculateCASchedulePSupportedCredits({
    regularTaxBeforeCredits: line35Tax,
    tentativeMinimumTax: schedulePTentativeMinimumTax,
    line5ChildAndDependentCareCreditAmount: line40Credit,
    line12JointCustodyHeadOfHouseholdCreditAmount:
      input.line44JointCustodyHeadOfHouseholdCreditInput !== undefined ? line44Credit : d(0),
    line13DependentParentCreditAmount: line45DependentParentAvailableCredit,
    line14SeniorHeadOfHouseholdCreditAmount:
      input.line43SeniorHeadOfHouseholdCreditInput !== undefined ? line43Credit : d(0),
    line15RentersCreditAmount: line46Credit,
    line16ChildAdoptionCostsCreditAmount: line45ChildAdoptionCostsAvailableCredit,
    line16ChildAdoptionCostsWorksheetCarryover: line45ChildAdoptionCostsWorksheetCarryover,
    line17Through19CarryoverCredits: line45SchedulePAdditionalCarryoverCredits,
    line19RemainingNetTaxBeforeOtherStateTaxCredit:
      input.line45SchedulePLine19RemainingNetTaxBeforeOtherStateTaxCredit === undefined
        ? undefined
        : nonNegativeAmount(
            input.line45SchedulePLine19RemainingNetTaxBeforeOtherStateTaxCredit,
            "CA Form 540 line 45 Schedule P line 19 remaining net tax before line 20"
          ),
    line20OtherStateTaxCreditAmount: line45OtherStateTaxAvailableCredit,
    line21PassThroughEntityElectiveTaxCreditAmount: line45PassThroughEntityElectiveTaxAvailableCredit,
    taxYear: input.taxYear,
  });

  const line45SupportedCarryoverCredit = line45ChildAdoptionCostsAvailableCredit.greaterThan(0)
    ? schedulePResult.line16dChildAdoptionCostsCarryover
    : d(0);
  const line45AdditionalCarryoverCredits = schedulePResult.line17Through19CarryoverCredits;
  const line45PassThroughEntityElectiveTaxCarryover =
    line45PassThroughEntityElectiveTaxAvailableCredit.greaterThan(0)
      ? schedulePResult.line21dPassThroughEntityElectiveTaxCreditCarryover
      : d(0);

  line40AuditInputs = {
    ...line40AuditInputs,
    "Credit usage path": "ca_schedule_p_supported_credits",
    "Schedule P line": "5",
    "Schedule P available credit": line40Credit,
    "Schedule P credit used this year": schedulePResult.line5bChildAndDependentCareCreditUsed,
  };
  line40Credit = schedulePResult.line5bChildAndDependentCareCreditUsed;

  if (input.line43SeniorHeadOfHouseholdCreditInput !== undefined) {
    line43AuditInputs = {
      ...line43AuditInputs,
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Schedule P line": "14",
      "Schedule P available credit": line43Credit,
      "Schedule P credit used this year": schedulePResult.line14bSeniorHeadOfHouseholdCreditUsed,
    };
    line43Credit = schedulePResult.line14bSeniorHeadOfHouseholdCreditUsed;
  }

  if (input.line44JointCustodyHeadOfHouseholdCreditInput !== undefined) {
    line44AuditInputs = {
      ...line44AuditInputs,
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Schedule P line": "12",
      "Schedule P available credit": line44Credit,
      "Schedule P credit used this year": schedulePResult.line12bJointCustodyHeadOfHouseholdCreditUsed,
    };
    line44Credit = schedulePResult.line12bJointCustodyHeadOfHouseholdCreditUsed;
  }

  if (
    input.line45DependentParentCreditInput !== undefined ||
    input.line45ChildAdoptionCostsCreditInput !== undefined ||
    line45SchedulePAdditionalCarryoverCredits.length > 0 ||
    input.line45OtherStateTaxCreditAmount !== undefined ||
    input.line45PassThroughEntityElectiveTaxCreditAmount !== undefined
  ) {
    const line45SchedulePLines: string[] = [];
    if (input.line45DependentParentCreditInput !== undefined) {
      line45SchedulePLines.push("13");
    }
    if (input.line45ChildAdoptionCostsCreditInput !== undefined) {
      line45SchedulePLines.push("16");
    }
    for (const carryoverCredit of line45AdditionalCarryoverCredits) {
      line45SchedulePLines.push(carryoverCredit.line.toString());
    }
    if (input.line45OtherStateTaxCreditAmount !== undefined) {
      line45SchedulePLines.push("20");
    }
    if (input.line45PassThroughEntityElectiveTaxCreditAmount !== undefined) {
      line45SchedulePLines.push("21");
    }

    line45AuditInputs = {
      ...line45AuditInputs,
      "Credit usage path": "ca_schedule_p_supported_credits",
      "Schedule P line": line45SchedulePLines.join(","),
    };

    if (input.line45DependentParentCreditInput !== undefined) {
      line45AuditInputs["Credit code 173 used this year"] =
        schedulePResult.line13bDependentParentCreditUsed.toString();
    }
    if (input.line45ChildAdoptionCostsCreditInput !== undefined) {
      line45AuditInputs["Credit code 197 used this year"] =
        schedulePResult.line16bChildAdoptionCostsCreditUsed.toString();
      line45AuditInputs["Credit code 197 carryover"] = line45SupportedCarryoverCredit.toString();
    }
    for (const carryoverCredit of line45AdditionalCarryoverCredits) {
      line45AuditInputs[`Credit code ${carryoverCredit.code} used this year`] =
        carryoverCredit.creditUsedThisYear.toString();
      line45AuditInputs[`Credit code ${carryoverCredit.code} carryover`] =
        carryoverCredit.carryover.toString();
    }
    if (input.line45OtherStateTaxCreditAmount !== undefined) {
      line45AuditInputs["Credit code 187 used this year"] =
        schedulePResult.line20bOtherStateTaxCreditUsed.toString();
    }
    if (input.line45PassThroughEntityElectiveTaxCreditAmount !== undefined) {
      line45AuditInputs["Credit code 242 used this year"] =
        schedulePResult.line21bPassThroughEntityElectiveTaxCreditUsed.toString();
      line45AuditInputs["Credit code 242 carryover"] =
        line45PassThroughEntityElectiveTaxCarryover.toString();
    }
  }
  line45Credit = line45Credit
    .plus(schedulePResult.line13bDependentParentCreditUsed)
    .plus(schedulePResult.line16bChildAdoptionCostsCreditUsed)
    .plus(
      line45AdditionalCarryoverCredits.reduce(
        (total, carryoverCredit) => total.plus(carryoverCredit.creditUsedThisYear),
        d(0)
      )
    )
    .plus(schedulePResult.line20bOtherStateTaxCreditUsed)
    .plus(schedulePResult.line21bPassThroughEntityElectiveTaxCreditUsed);

  line46AuditInputs = {
    ...line46AuditInputs,
    "Credit usage path": "ca_schedule_p_supported_credits",
    "Schedule P line": "15",
    "Schedule P available credit": line46Credit,
    "Schedule P credit used this year": schedulePResult.line15bRentersCreditUsed,
  };
  line46Credit = schedulePResult.line15bRentersCreditUsed;

  const line47TotalCredits = sum(
    line40Credit,
    line43Credit,
    line44Credit,
    line45Credit,
    line46Credit
  );
  const line48TaxAfterCredits = zeroFloor(line35Tax.minus(line47TotalCredits));

  const line62Calculation = calculateCABehavioralHealthServicesTax({
    taxableIncome,
    filingStatus: input.filingStatus,
    returnType: "resident",
    taxYear: input.taxYear,
  });
  const line62BehavioralHealthServicesTax = line62Calculation.tax;

  const line64TotalTax = sum(
    line48TaxAfterCredits,
    line61AlternativeMinimumTax,
    line62BehavioralHealthServicesTax,
    line63OtherTaxes
  );

  const audit = new AuditTrail();
  audit.merge(line40SupportingLines);
  audit.merge(line43SupportingLines);
  audit.merge(line44SupportingLines);
  audit.merge(line45SupportingLines);
  audit.merge(line46SupportingLines);
  audit.merge(schedulePResult.lines);
  audit.record(
    "CA-540",
    "31",
    "Form 540 tax",
    line31Tax,
    line31Source === "tax_table"
      ? "Use the supported Form 540 Tax Table amount because taxable income is $100,000 or less"
      : "Use the supported Form 540 Tax Rate Schedules amount because taxable income is more than $100,000",
    {
      "Taxable income": taxableIncome,
      "Filing status": input.filingStatus,
      "Computation path": line31Source,
    }
  );

  audit.record(
    "CA-540",
    "32",
    "Exemption credits",
    line32ExemptionCredits,
    "Use the supported Form 540 exemption-credit calculation",
    {
      "Federal AGI": federalAgi,
      "Filing status": input.filingStatus,
    }
  );

  audit.record(
    "CA-540",
    "33",
    "Tax after exemption credits",
    line33TaxAfterExemptionCredits,
    "max(0, Line 31 - Line 32)",
    {
      "Line 31": line31Tax,
      "Line 32": line32ExemptionCredits,
    }
  );

  audit.record(
    "CA-540",
    "34",
    "Tax from Schedule G-1 and/or FTB 5870A",
    line34Tax,
    "Supported upstream input for Form 540 line 34"
  );

  audit.record(
    "CA-540",
    "35",
    "Subtotal tax before credits",
    line35Tax,
    "Line 33 + Line 34",
    {
      "Line 33": line33TaxAfterExemptionCredits,
      "Line 34": line34Tax,
    }
  );

  audit.record(
    "CA-540",
    "40",
    "Nonrefundable child and dependent care expenses credit",
    line40Credit,
    line40Formula,
    line40AuditInputs
  );
  audit.record("CA-540", "43", line43Description, line43Credit, line43Formula, line43AuditInputs);
  audit.record("CA-540", "44", line44Description, line44Credit, line44Formula, line44AuditInputs);
  audit.record("CA-540", "45", "Additional nonrefundable credits", line45Credit, line45Formula, line45AuditInputs);
  audit.record(
    "CA-540",
    "46",
    "Nonrefundable renter's credit",
    line46Credit,
    line46Formula,
    line46AuditInputs
  );

  audit.record(
    "CA-540",
    "47",
    "Total credits",
    line47TotalCredits,
    "Line 40 + Line 43 + Line 44 + Line 45 + Line 46",
    {
      "Line 40": line40Credit,
      "Line 43": line43Credit,
      "Line 44": line44Credit,
      "Line 45": line45Credit,
      "Line 46": line46Credit,
    }
  );

  audit.record(
    "CA-540",
    "48",
    "Tax after nonrefundable credits",
    line48TaxAfterCredits,
    "max(0, Line 35 - Line 47)",
    {
      "Line 35": line35Tax,
      "Line 47": line47TotalCredits,
    }
  );

  audit.record(
    "CA-540",
    "61",
    "Alternative minimum tax",
    line61AlternativeMinimumTax,
    "Supported upstream input for Form 540 line 61"
  );

  audit.record(
    "CA-540",
    "62",
    "Behavioral Health Services Tax",
    line62BehavioralHealthServicesTax,
    "Use the supported resident Behavioral Health Services Tax worksheet amount",
    {
      "Taxable income": taxableIncome,
      "Computation path": "resident_behavioral_health_services_tax",
    }
  );

  audit.record(
    "CA-540",
    "63",
    "Other taxes and credit recapture",
    line63OtherTaxes,
    "Supported upstream input for Form 540 line 63"
  );

  audit.record(
    "CA-540",
    "64",
    "Total tax",
    line64TotalTax,
    "Line 48 + Line 61 + Line 62 + Line 63",
    {
      "Line 48": line48TaxAfterCredits,
      "Line 61": line61AlternativeMinimumTax,
      "Line 62": line62BehavioralHealthServicesTax,
      "Line 63": line63OtherTaxes,
    }
  );

  audit.merge(line31Calculation.lines);
  audit.merge(line32Calculation.lines);
  audit.merge(line62Calculation.lines);

  return {
    taxableIncome,
    filingStatus: input.filingStatus,
    federalAgi,
    line31Source,
    line31Tax,
    line32ExemptionCredits,
    line33TaxAfterExemptionCredits,
    line34Tax,
    line35Tax,
    line40Credit,
    line43Credit,
    line44Credit,
    line45Credit,
    line45SupportedCarryoverCredit,
    line45AdditionalCarryoverCredits,
    line45PassThroughEntityElectiveTaxCarryover,
    line46Credit,
    line47TotalCredits,
    line48TaxAfterCredits,
    line61AlternativeMinimumTax,
    line62BehavioralHealthServicesTax,
    line63OtherTaxes,
    line64TotalTax,
    lines: audit.getLines(),
  };
}
