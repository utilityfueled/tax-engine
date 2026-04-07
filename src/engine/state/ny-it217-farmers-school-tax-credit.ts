/**
 * New York IT-217 Claim for Farmers' School Tax Credit.
 * Supported slice: 2025 current-year credit, Part 2 lines 1 through 19.
 * Spec: spec/state/ny-it217-farmers-school-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { getNYIT201ResidentConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

const ZERO = new Decimal(0);
const ONE = new Decimal(1);
const HALF = new Decimal(0.5);

function roundFourDecimals(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export interface NYIT217Input {
  taxYear: number;
  meetsQualifiedPropertyRequirement: boolean;
  meetsEligibleFarmerIncomeTest: boolean;
  directQualifiedAgriculturalAcreage?: Decimal | string | number;
  passthroughQualifiedAgriculturalAcreage?: Decimal | string | number;
  fiduciaryQualifiedAgriculturalAcreage?: Decimal | string | number;
  qualifiedConservationAcreage?: Decimal | string | number;
  hasRelatedPersonsOwnership?: boolean;
  relatedPersonsGroupCount?: number;
  allocatedBaseAcreage?: Decimal | string | number;
  directEligibleSchoolTaxes?: Decimal | string | number;
  passthroughEligibleSchoolTaxes?: Decimal | string | number;
  fiduciaryEligibleSchoolTaxes?: Decimal | string | number;
  nyAdjustedGrossIncome: Decimal | string | number;
  newYorkCcorporationEntireNetIncomeShare?: Decimal | string | number;
  passThroughCcorporationEntireNetIncomeShare?: Decimal | string | number;
  principalPaidOnFarmIndebtedness?: Decimal | string | number;
}

export interface NYIT217Result {
  line1DirectQualifiedAgriculturalAcreage: Decimal;
  line2PassthroughQualifiedAgriculturalAcreage: Decimal;
  line3FiduciaryQualifiedAgriculturalAcreage: Decimal;
  line4TotalQualifiedAgriculturalAcreage: Decimal;
  line5BaseAcreage: Decimal;
  line6ExcessAcreage: Decimal;
  line7HalfOfExcessAcreage: Decimal;
  line8AdjustedAcreage: Decimal;
  line9AcreagePercentage: Decimal;
  line10DirectEligibleSchoolTaxes: Decimal;
  line11PassthroughEligibleSchoolTaxes: Decimal;
  line12FiduciaryEligibleSchoolTaxes: Decimal;
  line13TotalEligibleSchoolTaxes: Decimal;
  line14PreliminaryCredit: Decimal;
  line15ModifiedNewYorkAdjustedGrossIncome: Decimal;
  line16ModifiedAgiExcess: Decimal;
  line17PhaseoutPercentage: Decimal;
  line18CreditReduction: Decimal;
  line19FarmersSchoolTaxCredit: Decimal;
  lines: CalculatedLine[];
}

function computeBaseAcreage(
  input: NYIT217Input,
  totalBaseAcreage: Decimal
): Decimal {
  if (input.hasRelatedPersonsOwnership !== true) {
    return totalBaseAcreage;
  }

  if (input.allocatedBaseAcreage !== undefined) {
    return d(input.allocatedBaseAcreage);
  }

  if (input.relatedPersonsGroupCount === undefined) {
    throw new Error(
      "NY IT-217 related-person ownership requires either relatedPersonsGroupCount or allocatedBaseAcreage"
    );
  }

  if (!Number.isInteger(input.relatedPersonsGroupCount) || input.relatedPersonsGroupCount < 2) {
    throw new Error("NY IT-217 relatedPersonsGroupCount must be an integer of at least 2");
  }

  return totalBaseAcreage.dividedBy(input.relatedPersonsGroupCount);
}

export function calculateNYIT217(input: NYIT217Input): NYIT217Result {
  if (input.taxYear !== 2025) {
    throw new Error(
      `NY IT-217 farmers' school tax credit not available for tax year ${input.taxYear}`
    );
  }

  const constants = getNYIT201ResidentConstants(input.taxYear).it217;
  const audit = new AuditTrail();

  const line1DirectQualifiedAgriculturalAcreage = zeroFloor(d(input.directQualifiedAgriculturalAcreage));
  const line2PassthroughQualifiedAgriculturalAcreage = zeroFloor(
    d(input.passthroughQualifiedAgriculturalAcreage)
  );
  const line3FiduciaryQualifiedAgriculturalAcreage = zeroFloor(
    d(input.fiduciaryQualifiedAgriculturalAcreage)
  );
  const line4TotalQualifiedAgriculturalAcreage = sum(
    line1DirectQualifiedAgriculturalAcreage,
    line2PassthroughQualifiedAgriculturalAcreage,
    line3FiduciaryQualifiedAgriculturalAcreage
  );

  audit.record("NY-IT217", "1", "Qualified agricultural acres owned directly",
    line1DirectQualifiedAgriculturalAcreage, "Input direct qualified agricultural acreage");
  audit.record("NY-IT217", "2", "Passthrough qualified agricultural acres",
    line2PassthroughQualifiedAgriculturalAcreage, "Input Part 4 line 7 column A acreage");
  audit.record("NY-IT217", "3", "Fiduciary qualified agricultural acres",
    line3FiduciaryQualifiedAgriculturalAcreage, "Input Part 5 column C acreage");
  audit.record("NY-IT217", "4", "Total qualified agricultural acres",
    line4TotalQualifiedAgriculturalAcreage, "Line 1 + Line 2 + Line 3", {
      "Line 1 direct acreage": line1DirectQualifiedAgriculturalAcreage.toString(),
      "Line 2 passthrough acreage": line2PassthroughQualifiedAgriculturalAcreage.toString(),
      "Line 3 fiduciary acreage": line3FiduciaryQualifiedAgriculturalAcreage.toString(),
    });

  const qualifiedConservationAcreage = zeroFloor(d(input.qualifiedConservationAcreage));
  const totalBaseAcreage = constants.baseAcreage.plus(qualifiedConservationAcreage);
  const line5BaseAcreage = computeBaseAcreage(input, totalBaseAcreage);
  audit.record("NY-IT217", "5", "Total base acreage amount", line5BaseAcreage,
    input.hasRelatedPersonsOwnership
      ? input.allocatedBaseAcreage !== undefined
        ? "Agreed related-person base acreage allocation override"
        : "Line 5 worksheet total divided equally among related persons"
      : "350 + qualified conservation acreage", {
        "Initial base acreage": constants.baseAcreage.toString(),
        "Qualified conservation acreage": qualifiedConservationAcreage.toString(),
        "Line 5 worksheet total": totalBaseAcreage.toString(),
        "Related-person group count": input.relatedPersonsGroupCount?.toString() ?? "",
        "Allocated base acreage override":
          input.allocatedBaseAcreage !== undefined ? d(input.allocatedBaseAcreage).toString() : "",
      });

  const line6ExcessAcreage = Decimal.max(line4TotalQualifiedAgriculturalAcreage.minus(line5BaseAcreage), ZERO);
  const line7HalfOfExcessAcreage = line6ExcessAcreage.times(HALF);
  const line8AdjustedAcreage = line5BaseAcreage.plus(line7HalfOfExcessAcreage);
  const line9AcreagePercentage =
    line4TotalQualifiedAgriculturalAcreage.lte(0) || line6ExcessAcreage.lte(0)
      ? ONE
      : roundFourDecimals(line8AdjustedAcreage.dividedBy(line4TotalQualifiedAgriculturalAcreage));

  audit.record("NY-IT217", "6", "Excess qualified agricultural acres over base acreage",
    line6ExcessAcreage, "max(0, Line 4 - Line 5)", {
      "Line 4 total qualified agricultural acres": line4TotalQualifiedAgriculturalAcreage.toString(),
      "Line 5 base acreage": line5BaseAcreage.toString(),
    });
  audit.record("NY-IT217", "7", "Half of the excess acreage",
    line7HalfOfExcessAcreage, "Line 6 × 50%", {
      "Line 6 excess acreage": line6ExcessAcreage.toString(),
    });
  audit.record("NY-IT217", "8", "Adjusted acreage amount",
    line8AdjustedAcreage, "Line 5 + Line 7", {
      "Line 5 base acreage": line5BaseAcreage.toString(),
      "Line 7 half of excess acreage": line7HalfOfExcessAcreage.toString(),
    });
  audit.record("NY-IT217", "9", "Acreage percentage",
    line9AcreagePercentage,
    line6ExcessAcreage.lte(0) || line4TotalQualifiedAgriculturalAcreage.lte(0)
      ? "1.0000 because line 6 is zero or less"
      : "round(Line 8 / Line 4, 4 decimal places)", {
        "Line 8 adjusted acreage": line8AdjustedAcreage.toString(),
        "Line 4 total qualified agricultural acres": line4TotalQualifiedAgriculturalAcreage.toString(),
      });

  const line10DirectEligibleSchoolTaxes = zeroFloor(d(input.directEligibleSchoolTaxes));
  const line11PassthroughEligibleSchoolTaxes = zeroFloor(d(input.passthroughEligibleSchoolTaxes));
  const line12FiduciaryEligibleSchoolTaxes = zeroFloor(d(input.fiduciaryEligibleSchoolTaxes));
  const line13TotalEligibleSchoolTaxes = sum(
    line10DirectEligibleSchoolTaxes,
    line11PassthroughEligibleSchoolTaxes,
    line12FiduciaryEligibleSchoolTaxes
  );
  const line14PreliminaryCredit = line13TotalEligibleSchoolTaxes.times(line9AcreagePercentage);

  audit.record("NY-IT217", "10", "Eligible school taxes paid directly",
    line10DirectEligibleSchoolTaxes, "Input direct eligible school taxes");
  audit.record("NY-IT217", "11", "Passthrough eligible school taxes",
    line11PassthroughEligibleSchoolTaxes, "Input Part 4 line 7 column B eligible school taxes");
  audit.record("NY-IT217", "12", "Fiduciary eligible school taxes",
    line12FiduciaryEligibleSchoolTaxes, "Input Part 5 column D eligible school taxes");
  audit.record("NY-IT217", "13", "Total eligible school taxes",
    line13TotalEligibleSchoolTaxes, "Line 10 + Line 11 + Line 12", {
      "Line 10 direct eligible school taxes": line10DirectEligibleSchoolTaxes.toString(),
      "Line 11 passthrough eligible school taxes": line11PassthroughEligibleSchoolTaxes.toString(),
      "Line 12 fiduciary eligible school taxes": line12FiduciaryEligibleSchoolTaxes.toString(),
    });
  audit.record("NY-IT217", "14", "Preliminary farmers' school tax credit",
    line14PreliminaryCredit, "Line 13 × Line 9", {
      "Line 13 total eligible school taxes": line13TotalEligibleSchoolTaxes.toString(),
      "Line 9 acreage percentage": line9AcreagePercentage.toString(),
    });

  const line15ModifiedNewYorkAdjustedGrossIncome = sum(
    d(input.nyAdjustedGrossIncome),
    d(input.newYorkCcorporationEntireNetIncomeShare),
    d(input.passThroughCcorporationEntireNetIncomeShare)
  ).minus(d(input.principalPaidOnFarmIndebtedness));
  const line16ModifiedAgiExcess = Decimal.min(
    constants.modifiedAgiPhaseoutRange,
    Decimal.max(line15ModifiedNewYorkAdjustedGrossIncome.minus(constants.modifiedAgiPhaseoutStart), ZERO)
  );
  const line17PhaseoutPercentage = line16ModifiedAgiExcess.gt(0)
    ? roundFourDecimals(line16ModifiedAgiExcess.dividedBy(constants.modifiedAgiPhaseoutRange))
    : ZERO;
  const line18CreditReduction = line14PreliminaryCredit.times(line17PhaseoutPercentage);

  audit.record("NY-IT217", "15", "Modified New York adjusted gross income",
    line15ModifiedNewYorkAdjustedGrossIncome,
    "(NY AGI + C corporation entire net income share + passthrough C corporation share) - principal paid on farm indebtedness", {
      "New York adjusted gross income": d(input.nyAdjustedGrossIncome).toString(),
      "New York C corporation entire net income share":
        d(input.newYorkCcorporationEntireNetIncomeShare).toString(),
      "Passthrough C corporation share":
        d(input.passThroughCcorporationEntireNetIncomeShare).toString(),
      "Principal paid on farm indebtedness": d(input.principalPaidOnFarmIndebtedness).toString(),
    });
  audit.record("NY-IT217", "16", "Modified New York AGI over $200,000",
    line16ModifiedAgiExcess, "min($100,000, max(0, line 15 - $200,000))", {
      "Line 15 modified New York adjusted gross income":
        line15ModifiedNewYorkAdjustedGrossIncome.toString(),
    });
  audit.record("NY-IT217", "17", "Phaseout percentage",
    line17PhaseoutPercentage,
    line16ModifiedAgiExcess.gt(0)
      ? "round(Line 16 / $100,000, 4 decimal places)"
      : "0.0000 because line 16 is zero", {
        "Line 16 modified AGI excess": line16ModifiedAgiExcess.toString(),
      });
  audit.record("NY-IT217", "18", "Credit reduction",
    line18CreditReduction, "Line 14 × Line 17", {
      "Line 14 preliminary credit": line14PreliminaryCredit.toString(),
      "Line 17 phaseout percentage": line17PhaseoutPercentage.toString(),
    });

  const isEligible =
    input.meetsQualifiedPropertyRequirement
    && input.meetsEligibleFarmerIncomeTest
    && line15ModifiedNewYorkAdjustedGrossIncome.lt(constants.modifiedAgiEligibilityCeiling);
  const line19FarmersSchoolTaxCredit = isEligible
    ? Decimal.max(line14PreliminaryCredit.minus(line18CreditReduction), ZERO)
    : ZERO;

  audit.record("NY-IT217", "19", "Farmers' school tax credit",
    line19FarmersSchoolTaxCredit,
    isEligible
      ? "Line 14 - Line 18"
      : "0 because the qualified-property test, eligible-farmer test, or modified New York AGI ceiling was not satisfied", {
        "Qualified-property requirement met": input.meetsQualifiedPropertyRequirement ? "yes" : "no",
        "Eligible-farmer income test met": input.meetsEligibleFarmerIncomeTest ? "yes" : "no",
        "Line 15 modified New York adjusted gross income":
          line15ModifiedNewYorkAdjustedGrossIncome.toString(),
        "Line 14 preliminary credit": line14PreliminaryCredit.toString(),
        "Line 18 credit reduction": line18CreditReduction.toString(),
      });

  return {
    line1DirectQualifiedAgriculturalAcreage,
    line2PassthroughQualifiedAgriculturalAcreage,
    line3FiduciaryQualifiedAgriculturalAcreage,
    line4TotalQualifiedAgriculturalAcreage,
    line5BaseAcreage,
    line6ExcessAcreage,
    line7HalfOfExcessAcreage,
    line8AdjustedAcreage,
    line9AcreagePercentage,
    line10DirectEligibleSchoolTaxes,
    line11PassthroughEligibleSchoolTaxes,
    line12FiduciaryEligibleSchoolTaxes,
    line13TotalEligibleSchoolTaxes,
    line14PreliminaryCredit,
    line15ModifiedNewYorkAdjustedGrossIncome,
    line16ModifiedAgiExcess,
    line17PhaseoutPercentage,
    line18CreditReduction,
    line19FarmersSchoolTaxCredit,
    lines: audit.getLines(),
  };
}
