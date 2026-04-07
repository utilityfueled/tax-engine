/**
 * New York IT-215 resident earned income credits.
 * Implements the resident IT-201 line 65 NYS EIC path plus the Worksheet C NYC path.
 * Spec: spec/state/ny-it215-earned-income-credit.yaml
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface NYIT215Input {
  /** Federal earned income credit claimed on Form IT-215 line 10 */
  federalEic: Decimal | string | number;
  /** New York adjusted gross income from IT-201 line 33 */
  nyAgi: Decimal | string | number;
  /** New York filing status (defaults to single when omitted for backward compatibility) */
  filingStatus?: FilingStatus;
  /** New York State tax from IT-201 line 39 */
  nyStateTax?: Decimal | string | number;
  /** Household credit from IT-201 line 40 */
  householdCredit?: Decimal | string | number;
  /** Resident credit from IT-201 line 41 */
  residentCredit?: Decimal | string | number;
  /** Accumulation distribution credit used on Worksheet B line 3 */
  accumulationDistributionCredit?: Decimal | string | number;
  /** Full-year NYC resident indicator */
  isNYCResident: boolean;
  /** Joint federal / New York MFS allocation branch for IT-215 line 17 and Worksheet C line 4 */
  jointFederalReturnForMfsAllocation?: boolean;
  /** IT-215 line 17 claimed NYS EIC share when the joint-federal / NY-MFS branch applies */
  line17AllocatedNYSEic?: Decimal | string | number;
  /** Worksheet C line 4 claimed NYC EIC share when the joint-federal / NY-MFS NYC branch applies */
  worksheetCLine4AllocatedNYCEic?: Decimal | string | number;
  taxYear: number;
}

export interface NYIT215ResidentCreditComputation {
  nysEicRate: Decimal;
  tentativeNYSEarnedIncomeCredit: Decimal;
  worksheetBLine5TaxAfterResidentAndAccumulationCredits: Decimal;
  allowableHouseholdCredit: Decimal;
  allowableNYSEarnedIncomeCredit: Decimal;
}

export interface NYIT215Result {
  federalEic: Decimal;
  nyAgi: Decimal;
  filingStatus: FilingStatus;
  nyStateTax: Decimal;
  householdCredit: Decimal;
  residentCredit: Decimal;
  accumulationDistributionCredit: Decimal;
  isNYCResident: boolean;
  jointFederalReturnForMfsAllocation: boolean;
  /** IT-215 line 11 */
  nysEicRate: Decimal;
  /** IT-215 line 12 */
  tentativeNYSEarnedIncomeCredit: Decimal;
  /** Worksheet B line 5 / IT-215 line 13 */
  worksheetBLine5TaxAfterResidentAndAccumulationCredits: Decimal;
  /** IT-215 line 15 */
  allowableHouseholdCredit: Decimal;
  /** IT-215 line 16 combined credit before any MFS allocation */
  line16CombinedNYSEarnedIncomeCredit: Decimal;
  /** IT-215 line 17 claimed credit when the MFS allocation branch applies */
  line17ClaimedNYSEarnedIncomeCredit: Decimal;
  /** IT-215 line 17 / IT-201 line 65 */
  allowableNYSEarnedIncomeCredit: Decimal;
  /** Worksheet C line 2 */
  nycEicRate: Decimal;
  /** Worksheet C line 3 combined credit before any MFS allocation */
  worksheetCLine3CombinedNYCEarnedIncomeCredit: Decimal;
  /** Worksheet C line 4 claimed credit when the MFS allocation branch applies */
  worksheetCLine4ClaimedNYCEarnedIncomeCredit: Decimal;
  /** Worksheet C line 4 / IT-215 line 27 / IT-201 line 70 */
  allowableNYCEarnedIncomeCredit: Decimal;
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const PHASE_DOWN_RATE = new Decimal("0.00002");

function roundFourDecimals(value: Decimal): Decimal {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function allocateNYIT215MfsClaimedCredit(params: {
  combinedAmount: Decimal;
  claimedAmount: Decimal | string | number | undefined;
  filingStatus: FilingStatus;
  jointFederalReturnForMfsAllocation: boolean;
  fieldDescription: string;
}): Decimal {
  if (!params.jointFederalReturnForMfsAllocation) {
    return params.combinedAmount;
  }

  if (params.filingStatus !== "married_filing_separately") {
    throw new Error(`${params.fieldDescription} only applies to married_filing_separately returns`);
  }

  if (params.claimedAmount === undefined) {
    throw new Error(`${params.fieldDescription} is required when the joint federal NY-MFS allocation applies`);
  }

  const claimedAmount = d(params.claimedAmount);
  if (claimedAmount.lessThan(ZERO)) {
    throw new Error(`${params.fieldDescription} must be non-negative`);
  }
  if (claimedAmount.greaterThan(params.combinedAmount)) {
    throw new Error(`${params.fieldDescription} cannot exceed the combined credit amount`);
  }

  return claimedAmount;
}

export function computeNYIT215ResidentCredit(params: {
  federalEic: Decimal | string | number;
  nyStateTax?: Decimal | string | number;
  householdCredit?: Decimal | string | number;
  residentCredit?: Decimal | string | number;
  accumulationDistributionCredit?: Decimal | string | number;
}): NYIT215ResidentCreditComputation {
  const federalEic = zeroFloor(d(params.federalEic));
  const nyStateTax = zeroFloor(d(params.nyStateTax));
  const householdCredit = zeroFloor(d(params.householdCredit));
  const residentCredit = zeroFloor(d(params.residentCredit));
  const accumulationDistributionCredit = zeroFloor(d(params.accumulationDistributionCredit));

  const nysEicRate = new Decimal("0.30");
  const tentativeNYSEarnedIncomeCredit = roundDollar(federalEic.times(nysEicRate));
  const worksheetBLine5TaxAfterResidentAndAccumulationCredits = zeroFloor(
    nyStateTax.minus(residentCredit).minus(accumulationDistributionCredit)
  );
  const allowableHouseholdCredit = Decimal.min(
    householdCredit,
    worksheetBLine5TaxAfterResidentAndAccumulationCredits
  );
  const allowableNYSEarnedIncomeCredit = zeroFloor(
    tentativeNYSEarnedIncomeCredit.minus(allowableHouseholdCredit)
  );

  return {
    nysEicRate,
    tentativeNYSEarnedIncomeCredit,
    worksheetBLine5TaxAfterResidentAndAccumulationCredits,
    allowableHouseholdCredit,
    allowableNYSEarnedIncomeCredit,
  };
}

export function computeNYCIT215Rate(input: {
  nyAgi: Decimal | string | number;
  isNYCResident: boolean;
  taxYear?: number;
}): Decimal {
  const taxYear = input.taxYear ?? 2025;
  if (taxYear !== 2025) {
    throw new Error(`NY IT-215 NYC earned income credit not available for tax year ${taxYear}`);
  }

  if (!input.isNYCResident) return ZERO;

  const nyAgi = zeroFloor(d(input.nyAgi));

  if (nyAgi.lessThan(5000)) return new Decimal("0.30");
  if (nyAgi.lessThan(7500)) {
    return new Decimal("0.30").minus(
      roundFourDecimals(nyAgi.minus(4999).times(PHASE_DOWN_RATE))
    );
  }

  if (nyAgi.lessThan(15000)) return new Decimal("0.25");
  if (nyAgi.lessThan(17500)) {
    return new Decimal("0.25").minus(
      roundFourDecimals(nyAgi.minus(14999).times(PHASE_DOWN_RATE))
    );
  }

  if (nyAgi.lessThan(20000)) return new Decimal("0.20");
  if (nyAgi.lessThan(22500)) {
    return new Decimal("0.20").minus(
      roundFourDecimals(nyAgi.minus(19999).times(PHASE_DOWN_RATE))
    );
  }

  if (nyAgi.lessThan(40000)) return new Decimal("0.15");
  if (nyAgi.lessThan(42500)) {
    return new Decimal("0.15").minus(
      roundFourDecimals(nyAgi.minus(39999).times(PHASE_DOWN_RATE))
    );
  }

  return new Decimal("0.10");
}

export function calculateNYIT215(input: NYIT215Input): NYIT215Result {
  if (input.taxYear !== 2025) {
    throw new Error(`NY IT-215 earned income credit not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const federalEic = zeroFloor(d(input.federalEic));
  const nyAgi = zeroFloor(d(input.nyAgi));
  const nyStateTax = zeroFloor(d(input.nyStateTax));
  const householdCredit = zeroFloor(d(input.householdCredit));
  const residentCredit = zeroFloor(d(input.residentCredit));
  const accumulationDistributionCredit = zeroFloor(d(input.accumulationDistributionCredit));
  const filingStatus = input.filingStatus ?? "single";
  const jointFederalReturnForMfsAllocation = input.jointFederalReturnForMfsAllocation ?? false;
  const residentCreditComputation = computeNYIT215ResidentCredit({
    federalEic,
    nyStateTax,
    householdCredit,
    residentCredit,
    accumulationDistributionCredit,
  });
  const line16CombinedNYSEarnedIncomeCredit = residentCreditComputation.allowableNYSEarnedIncomeCredit;
  const line17ClaimedNYSEarnedIncomeCredit = allocateNYIT215MfsClaimedCredit({
    combinedAmount: line16CombinedNYSEarnedIncomeCredit,
    claimedAmount: input.line17AllocatedNYSEic,
    filingStatus,
    jointFederalReturnForMfsAllocation,
    fieldDescription: "NY IT-215 line 17 claimed allocation",
  });

  audit.record("NY-IT215", "11", "NYS earned income credit rate",
    residentCreditComputation.nysEicRate,
    "Fixed 30% rate");

  audit.record("NY-IT215", "12", "Tentative NYS earned income credit",
    residentCreditComputation.tentativeNYSEarnedIncomeCredit,
    "Round to whole dollars: line 10 federal EIC × line 11 rate", {
      "Federal EIC (line 10)": federalEic.toString(),
      "Line 11 rate": residentCreditComputation.nysEicRate.toString(),
    });

  audit.record("NY-IT215", "13", "Worksheet B tax after resident and accumulation distribution credits",
    residentCreditComputation.worksheetBLine5TaxAfterResidentAndAccumulationCredits,
    "max(0, Worksheet B line 1 NY tax minus line 2 resident credit minus line 3 accumulation distribution credit)", {
      "NY State tax (Worksheet B line 1)": nyStateTax.toString(),
      "Resident credit (Worksheet B line 2)": residentCredit.toString(),
      "Accumulation distribution credit (Worksheet B line 3)": accumulationDistributionCredit.toString(),
    });

  audit.record("NY-IT215", "15", "Allowable household credit reduction",
    residentCreditComputation.allowableHouseholdCredit,
    "Smaller of line 13 and line 14 household credit", {
      "Line 13": residentCreditComputation.worksheetBLine5TaxAfterResidentAndAccumulationCredits.toString(),
      "Line 14 household credit": householdCredit.toString(),
    });

  audit.record("NY-IT215", "16", "Allowable NYS earned income credit",
    line16CombinedNYSEarnedIncomeCredit,
    "max(0, line 12 tentative NYS EIC minus line 15 allowable household credit)", {
      "Line 12 tentative NYS EIC": residentCreditComputation.tentativeNYSEarnedIncomeCredit.toString(),
      "Line 15 allowable household credit": residentCreditComputation.allowableHouseholdCredit.toString(),
    });

  audit.record("NY-IT215", "17", "Claimed NYS earned income credit",
    line17ClaimedNYSEarnedIncomeCredit,
    jointFederalReturnForMfsAllocation
      ? "Joint federal / New York MFS claimed allocation from line 16"
      : "Line 16 carries directly to line 17 / IT-201 line 65", {
      "Line 16 combined NYS EIC": line16CombinedNYSEarnedIncomeCredit.toString(),
      "Joint federal NY-MFS allocation": jointFederalReturnForMfsAllocation.toString(),
      "Claimed line 17 input": input.line17AllocatedNYSEic === undefined
        ? "n/a"
        : d(input.line17AllocatedNYSEic).toString(),
    });

  const nycEicRate = computeNYCIT215Rate({
    nyAgi,
    isNYCResident: input.isNYCResident,
    taxYear: input.taxYear,
  });

  audit.record("NY-IT215", "C-2", "NYC EIC rate",
    nycEicRate,
    "2025 Worksheet C NYC earned income credit rate table", {
      "NY AGI": nyAgi.toString(),
      "NYC resident": input.isNYCResident.toString(),
    });

  const worksheetCLine3CombinedNYCEarnedIncomeCredit = roundDollar(federalEic.times(nycEicRate));
  const worksheetCLine4ClaimedNYCEarnedIncomeCredit = allocateNYIT215MfsClaimedCredit({
    combinedAmount: worksheetCLine3CombinedNYCEarnedIncomeCredit,
    claimedAmount: input.worksheetCLine4AllocatedNYCEic,
    filingStatus,
    jointFederalReturnForMfsAllocation: jointFederalReturnForMfsAllocation && input.isNYCResident,
    fieldDescription: "NY IT-215 Worksheet C line 4 claimed allocation",
  });
  audit.record("NY-IT215", "27", "NYC earned income credit",
    worksheetCLine4ClaimedNYCEarnedIncomeCredit,
    jointFederalReturnForMfsAllocation && input.isNYCResident
      ? "Worksheet C line 4 claimed share of the combined line 3 NYC EIC"
      : "Round to whole dollars: IT-215 line 10 federal EIC × Worksheet C line 2 rate", {
      "Federal EIC (line 10)": federalEic.toString(),
      "Worksheet C line 2 rate": nycEicRate.toString(),
      "Worksheet C line 3 combined NYC EIC": worksheetCLine3CombinedNYCEarnedIncomeCredit.toString(),
      "Claimed Worksheet C line 4 input": input.worksheetCLine4AllocatedNYCEic === undefined
        ? "n/a"
        : d(input.worksheetCLine4AllocatedNYCEic).toString(),
    });

  return {
    federalEic,
    nyAgi,
    filingStatus,
    nyStateTax,
    householdCredit,
    residentCredit,
    accumulationDistributionCredit,
    isNYCResident: input.isNYCResident,
    jointFederalReturnForMfsAllocation,
    nysEicRate: residentCreditComputation.nysEicRate,
    tentativeNYSEarnedIncomeCredit: residentCreditComputation.tentativeNYSEarnedIncomeCredit,
    worksheetBLine5TaxAfterResidentAndAccumulationCredits:
      residentCreditComputation.worksheetBLine5TaxAfterResidentAndAccumulationCredits,
    allowableHouseholdCredit: residentCreditComputation.allowableHouseholdCredit,
    line16CombinedNYSEarnedIncomeCredit,
    line17ClaimedNYSEarnedIncomeCredit,
    allowableNYSEarnedIncomeCredit: line17ClaimedNYSEarnedIncomeCredit,
    nycEicRate,
    worksheetCLine3CombinedNYCEarnedIncomeCredit,
    worksheetCLine4ClaimedNYCEarnedIncomeCredit,
    allowableNYCEarnedIncomeCredit: worksheetCLine4ClaimedNYCEarnedIncomeCredit,
    lines: audit.getLines(),
  };
}
