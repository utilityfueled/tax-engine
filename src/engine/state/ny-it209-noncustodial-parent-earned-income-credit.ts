/**
 * New York IT-209 noncustodial parent earned income credit.
 * Implements the resident IT-201 line 66 path and the Schedule B comparison
 * against the regular NYS earned income credit.
 * Spec: spec/state/ny-it209-noncustodial-parent-earned-income-credit.yaml
 */

import Decimal from "decimal.js";
import { computeNYIT215ResidentCredit } from "@/engine/state/ny-it215-earned-income-credit.js";
import type { FilingStatus } from "@/models/constants.js";
import { getConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, max, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface NYIT209Input {
  filingStatus: FilingStatus;
  taxYear: number;
  federalAgi: Decimal | string | number;
  wagesSalariesTips: Decimal | string | number;
  earnedIncomeAdjustment?: Decimal | string | number;
  businessIncomeOrLoss?: Decimal | string | number;
  fullYearResident: boolean;
  ageAtYearEnd: number;
  hasQualifyingNoncustodialChild: boolean;
  supportOrderInEffectHalfYear: boolean;
  paidRequiredChildSupport: boolean;
  hasValidSocialSecurityNumber: boolean;
  mfsMeetsConsideredUnmarriedRequirement?: boolean;
  filesFederalForm2555?: boolean;
  investmentIncome: Decimal | string | number;
  claimedFederalEic?: boolean;
  federalEicClaimedAmount?: Decimal | string | number;
  nyStateTax: Decimal | string | number;
  householdCredit: Decimal | string | number;
  residentCredit?: Decimal | string | number;
  accumulationDistributionCredit?: Decimal | string | number;
}

export interface NYIT209Result {
  filingStatus: FilingStatus;
  federalAgi: Decimal;
  earnedIncome: Decimal;
  investmentIncome: Decimal;
  claimedFederalEic: boolean;
  isNoncustodialEligible: boolean;
  blocksRegularEarnedIncomeCredits: boolean;
  scheduleALine24OneChildComparison: Decimal;
  scheduleALine31NoChildComparison: Decimal;
  noncustodialParentEic: Decimal;
  scheduleBLine37TentativeNysEic: Decimal;
  scheduleBLine38eTaxAfterResidentAndAccumulationCredits: Decimal;
  scheduleBLine41AllowableHouseholdCredit: Decimal;
  allowableNysEarnedIncomeCredit: Decimal;
  selectedNysEarnedIncomeCredit: Decimal;
  selectedNoncustodialParentEic: Decimal;
  preferredCredit: "nys_eic" | "noncustodial_parent_eic" | "none";
  lines: CalculatedLine[];
}

const ZERO = new Decimal(0);
const IT209_FEDERAL_AGI_LIMIT = new Decimal(50434);

function computeHypotheticalFederalEic(params: {
  taxYear: number;
  earnedIncome: Decimal;
  agi: Decimal;
  qualifyingChildren: 0 | 1;
  useMfjPhaseout: boolean;
}): Decimal {
  const constants = getConstants(params.taxYear);
  const eitc = constants.eitc;
  const childKey = params.qualifyingChildren;
  const creditRate = eitc.creditRate[childKey];
  const phaseOutRate = eitc.phaseOutRate[childKey];
  const earnedIncomeAmount = eitc.earnedIncomeAmount[childKey];
  const phaseOutStart = params.useMfjPhaseout
    ? eitc.phaseOutStartMFJ[childKey]
    : eitc.phaseOutStartSingleHoH[childKey];

  const phaseInCredit = creditRate.times(min(params.earnedIncome, earnedIncomeAmount));
  const phaseOutIncome = max(params.earnedIncome, params.agi);
  const phaseOutReduction = phaseOutRate.times(
    zeroFloor(phaseOutIncome.minus(phaseOutStart))
  );

  return zeroFloor(phaseInCredit.minus(phaseOutReduction)).floor();
}

export function calculateNYIT209(input: NYIT209Input): NYIT209Result {
  if (input.taxYear !== 2025) {
    throw new Error(`NY IT-209 noncustodial parent earned income credit not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const federalAgi = d(input.federalAgi);
  const wagesSalariesTips = d(input.wagesSalariesTips);
  const earnedIncomeAdjustment = d(input.earnedIncomeAdjustment);
  const businessIncomeOrLoss = d(input.businessIncomeOrLoss);
  const earnedIncome = wagesSalariesTips.minus(earnedIncomeAdjustment).plus(businessIncomeOrLoss);
  const investmentIncome = d(input.investmentIncome);
  const claimedFederalEic = input.claimedFederalEic ?? d(input.federalEicClaimedAmount).greaterThan(ZERO);
  const federalEicClaimedAmount = zeroFloor(d(input.federalEicClaimedAmount));
  const nyStateTax = zeroFloor(d(input.nyStateTax));
  const householdCredit = zeroFloor(d(input.householdCredit));
  const residentCredit = zeroFloor(d(input.residentCredit));
  const accumulationDistributionCredit = zeroFloor(d(input.accumulationDistributionCredit));

  const invalidSsnForEarnedIncomeCredits = !input.hasValidSocialSecurityNumber;
  const filesFederalForm2555 = input.filesFederalForm2555 ?? false;
  const excessiveInvestmentIncome = investmentIncome.greaterThan(getConstants(input.taxYear).eitc.investmentIncomeLimit);
  const blocksRegularEarnedIncomeCredits =
    invalidSsnForEarnedIncomeCredits || filesFederalForm2555 || excessiveInvestmentIncome;
  const mfsMeetsConsideredUnmarriedRequirement =
    input.filingStatus !== "married_filing_separately"
      || (input.mfsMeetsConsideredUnmarriedRequirement ?? false);

  const isNoncustodialEligible =
    input.fullYearResident
    && input.ageAtYearEnd >= 18
    && input.hasQualifyingNoncustodialChild
    && input.supportOrderInEffectHalfYear
    && input.paidRequiredChildSupport
    && federalAgi.lessThan(IT209_FEDERAL_AGI_LIMIT)
    && !invalidSsnForEarnedIncomeCredits
    && mfsMeetsConsideredUnmarriedRequirement
    && !filesFederalForm2555
    && !excessiveInvestmentIncome
    && earnedIncome.greaterThan(ZERO);

  audit.record("NY-IT209", "16", "Total earned income", earnedIncome,
    "Line 13 wages and combat-pay election minus line 14 earned income adjustment plus signed line 15 business income or loss", {
      "Line 13 wages, salaries, tips, and combat pay": wagesSalariesTips.toString(),
      "Line 14 earned income adjustment": earnedIncomeAdjustment.toString(),
      "Line 15 business income or loss": businessIncomeOrLoss.toString(),
    });

  let scheduleALine24OneChildComparison = ZERO;
  let scheduleALine31NoChildComparison = ZERO;
  let noncustodialParentEic = ZERO;

  if (isNoncustodialEligible) {
    const oneChildHypotheticalEic = computeHypotheticalFederalEic({
      taxYear: input.taxYear,
      earnedIncome,
      agi: federalAgi,
      qualifyingChildren: 1,
      useMfjPhaseout: false,
    });
    const noChildHypotheticalEic = computeHypotheticalFederalEic({
      taxYear: input.taxYear,
      earnedIncome,
      agi: federalAgi,
      qualifyingChildren: 0,
      useMfjPhaseout: input.filingStatus === "married_filing_jointly",
    });

    scheduleALine24OneChildComparison = roundDollar(oneChildHypotheticalEic.times("0.20"));
    scheduleALine31NoChildComparison = roundDollar(noChildHypotheticalEic.times("2.5"));
    noncustodialParentEic = max(
      scheduleALine24OneChildComparison,
      scheduleALine31NoChildComparison
    );

    audit.record("NY-IT209", "24", "20% one-child noncustodial comparison",
      scheduleALine24OneChildComparison,
      "Round to whole dollars: 20% of the hypothetical federal EIC with one qualifying child", {
        "Hypothetical one-child federal EIC": oneChildHypotheticalEic.toString(),
      });

    audit.record("NY-IT209", "31", "2.5x no-child noncustodial comparison",
      scheduleALine31NoChildComparison,
      "Round to whole dollars: 2.5 times the hypothetical federal EIC without a qualifying child", {
        "Hypothetical no-child federal EIC": noChildHypotheticalEic.toString(),
        "Uses MFJ no-child threshold": (input.filingStatus === "married_filing_jointly").toString(),
      });
  } else {
    audit.record("NY-IT209", "24", "20% one-child noncustodial comparison",
      ZERO,
      "No noncustodial credit because the IT-209 eligibility screen failed");
    audit.record("NY-IT209", "31", "2.5x no-child noncustodial comparison",
      ZERO,
      "No noncustodial credit because the IT-209 eligibility screen failed");
  }

  audit.record("NY-IT209", "32", "Noncustodial parent earned income credit",
    noncustodialParentEic,
    "Greater of line 24 or line 31", {
      "Line 24": scheduleALine24OneChildComparison.toString(),
      "Line 31": scheduleALine31NoChildComparison.toString(),
      "Eligible for noncustodial credit": isNoncustodialEligible.toString(),
    });

  let scheduleBLine37TentativeNysEic = ZERO;
  let scheduleBLine38eTaxAfterResidentAndAccumulationCredits = ZERO;
  let scheduleBLine41AllowableHouseholdCredit = ZERO;
  let allowableNysEarnedIncomeCredit = ZERO;

  if (claimedFederalEic && !blocksRegularEarnedIncomeCredits) {
    const residentCreditComputation = computeNYIT215ResidentCredit({
      federalEic: federalEicClaimedAmount,
      nyStateTax,
      householdCredit,
      residentCredit,
      accumulationDistributionCredit,
    });
    scheduleBLine37TentativeNysEic = residentCreditComputation.tentativeNYSEarnedIncomeCredit;
    scheduleBLine38eTaxAfterResidentAndAccumulationCredits =
      residentCreditComputation.worksheetBLine5TaxAfterResidentAndAccumulationCredits;
    scheduleBLine41AllowableHouseholdCredit = residentCreditComputation.allowableHouseholdCredit;
    allowableNysEarnedIncomeCredit = residentCreditComputation.allowableNYSEarnedIncomeCredit;
  }

  audit.record("NY-IT209", "38e", "Tax after resident and accumulation distribution credits",
    scheduleBLine38eTaxAfterResidentAndAccumulationCredits,
    "max(0, line 39 NY tax minus resident credit minus accumulation distribution credit)", {
      "NY State tax (line 39)": nyStateTax.toString(),
      "Resident credit": residentCredit.toString(),
      "Accumulation distribution credit": accumulationDistributionCredit.toString(),
      "Claimed federal EIC": claimedFederalEic.toString(),
      "Regular IT-209 EIC routing blocked": blocksRegularEarnedIncomeCredits.toString(),
    });

  audit.record("NY-IT209", "41", "Allowable household credit for Schedule B",
    scheduleBLine41AllowableHouseholdCredit,
    "Lesser of line 38e or the IT-201 line 40 household credit", {
      "Line 38e": scheduleBLine38eTaxAfterResidentAndAccumulationCredits.toString(),
      "Household credit": householdCredit.toString(),
    });

  audit.record("NY-IT209", "42", "Allowable New York State earned income credit",
    allowableNysEarnedIncomeCredit,
    "max(0, tentative NYS EIC minus line 41 allowable household credit)", {
      "Tentative NYS EIC (line 37)": scheduleBLine37TentativeNysEic.toString(),
      "Line 41 allowable household credit": scheduleBLine41AllowableHouseholdCredit.toString(),
    });

  let selectedNysEarnedIncomeCredit = ZERO;
  let selectedNoncustodialParentEic = ZERO;
  let preferredCredit: NYIT209Result["preferredCredit"] = "none";

  if (claimedFederalEic && !blocksRegularEarnedIncomeCredits) {
    if (allowableNysEarnedIncomeCredit.greaterThan(noncustodialParentEic)) {
      selectedNysEarnedIncomeCredit = allowableNysEarnedIncomeCredit;
      preferredCredit = allowableNysEarnedIncomeCredit.greaterThan(ZERO) ? "nys_eic" : "none";
    } else {
      selectedNoncustodialParentEic = noncustodialParentEic;
      preferredCredit = noncustodialParentEic.greaterThan(ZERO) ? "noncustodial_parent_eic" : "none";
    }
  } else if (!claimedFederalEic && isNoncustodialEligible) {
    selectedNoncustodialParentEic = noncustodialParentEic;
    preferredCredit = noncustodialParentEic.greaterThan(ZERO) ? "noncustodial_parent_eic" : "none";
  }

  audit.record("NY-IT209", "43", "IT-201 earned income credit routing",
    max(selectedNysEarnedIncomeCredit, selectedNoncustodialParentEic),
    "Route the greater IT-209 / NYS EIC amount to IT-201 line 65 or line 66", {
      "Allowable NYS EIC (line 42)": allowableNysEarnedIncomeCredit.toString(),
      "Noncustodial EIC (line 32)": noncustodialParentEic.toString(),
      "Selected line 65 amount": selectedNysEarnedIncomeCredit.toString(),
      "Selected line 66 amount": selectedNoncustodialParentEic.toString(),
      "Preferred credit": preferredCredit,
    });

  return {
    filingStatus: input.filingStatus,
    federalAgi,
    earnedIncome,
    investmentIncome,
    claimedFederalEic,
    isNoncustodialEligible,
    blocksRegularEarnedIncomeCredits,
    scheduleALine24OneChildComparison,
    scheduleALine31NoChildComparison,
    noncustodialParentEic,
    scheduleBLine37TentativeNysEic,
    scheduleBLine38eTaxAfterResidentAndAccumulationCredits,
    scheduleBLine41AllowableHouseholdCredit,
    allowableNysEarnedIncomeCredit,
    selectedNysEarnedIncomeCredit,
    selectedNoncustodialParentEic,
    preferredCredit,
    lines: audit.getLines(),
  };
}
