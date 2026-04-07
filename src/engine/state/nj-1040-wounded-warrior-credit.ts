/**
 * New Jersey NJ-1040 Wounded Warrior Caregivers Credit computation.
 * Spec: spec/state/nj-1040-wounded-warrior-credit.yaml
 *
 * Refundable credit for taxpayers who provided care for a qualifying armed
 * services member relative. The credit is the lesser of federal disability
 * compensation or $675, apportioned when multiple caregivers shared care.
 */

import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { assertSupportedNJTaxYear } from "@/engine/state/nj-tax-year.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar } from "@/utils/decimal.js";

const MAX_CREDIT = new Decimal(675);
const PERCENT_DENOMINATOR = new Decimal(100);

const NJ_WWC_INCOME_LIMITS: Record<number, Record<FilingStatus, Decimal>> = {
  2025: {
    single: new Decimal(50000),
    married_filing_jointly: new Decimal(100000),
    married_filing_separately: new Decimal(50000),
    head_of_household: new Decimal(100000),
    qualifying_surviving_spouse: new Decimal(100000),
  },
};

export interface NJ1040WoundedWarriorCreditInput {
  filingStatus: FilingStatus;
  taxYear: number;
  /** NJ gross income, using the entire year for part-year residents */
  njGrossIncome: Decimal | string | number;
  /** Interview-validated flag that care was provided to a qualifying service member relative */
  providedCareToQualifyingServiceMember?: boolean;
  /** Service member's 2025 federal disability compensation */
  serviceMemberFederalDisabilityCompensation?: Decimal | string | number;
  /** True when taxpayer was the only caregiver during the tax year */
  onlyCaregiver?: boolean;
  /** Share of total care expenses when multiple caregivers existed, expressed as 0-100 percent */
  careExpensesSharePercent?: Decimal | string | number;
}

export interface NJ1040WoundedWarriorCreditResult {
  incomeLimit: Decimal;
  eligible: boolean;
  baseCredit: Decimal;
  careExpensesSharePercent: Decimal;
  credit: Decimal;
  lines: CalculatedLine[];
}

export function calculateNJ1040WoundedWarriorCredit(
  input: NJ1040WoundedWarriorCreditInput
): NJ1040WoundedWarriorCreditResult {
  const audit = new AuditTrail();
  assertSupportedNJTaxYear(input.taxYear, "NJ-1040 wounded warrior credit rules");

  const incomeLimitByStatus = NJ_WWC_INCOME_LIMITS[input.taxYear];
  if (!incomeLimitByStatus) {
    throw new Error(
      `NJ Wounded Warrior Caregivers Credit limits not available for tax year ${input.taxYear}`
    );
  }

  const incomeLimit = incomeLimitByStatus[input.filingStatus];
  const njGrossIncome = d(input.njGrossIncome);
  const providedCare = input.providedCareToQualifyingServiceMember ?? false;
  const disabilityCompensation = d(input.serviceMemberFederalDisabilityCompensation);
  const onlyCaregiver = input.onlyCaregiver ?? true;
  const careExpensesSharePercent = Decimal.min(
    new Decimal(100),
    Decimal.max(new Decimal(0), d(input.careExpensesSharePercent))
  );

  audit.record(
    "NJ-1040",
    "income-limit",
    "Wounded Warrior Caregivers Credit income limit",
    incomeLimit,
    "Income limit based on filing status",
    { "Filing status": input.filingStatus }
  );

  const eligible = providedCare && njGrossIncome.lessThanOrEqualTo(incomeLimit);

  audit.record(
    "NJ-1040",
    "wwc-eligible",
    "Wounded Warrior Caregivers Credit eligibility",
    new Decimal(eligible ? 1 : 0),
    "Provided care to a qualifying service member and NJ gross income does not exceed the filing-status limit",
    {
      "NJ gross income": njGrossIncome,
      "Income limit": incomeLimit,
      "Provided care": String(providedCare),
    }
  );

  const baseCredit = Decimal.min(disabilityCompensation, MAX_CREDIT);

  audit.record(
    "NJ-1040",
    "base-credit",
    "Wounded Warrior Caregivers Credit base amount",
    baseCredit,
    "min(service member federal disability compensation, $675)",
    {
      "Federal disability compensation": disabilityCompensation,
      "Maximum credit": MAX_CREDIT,
    }
  );

  const apportionedCredit = onlyCaregiver
    ? baseCredit
    : roundDollar(baseCredit.times(careExpensesSharePercent).dividedBy(PERCENT_DENOMINATOR));

  audit.record(
    "NJ-1040",
    "apportioned-credit",
    "Wounded Warrior Caregivers Credit after caregiver apportionment",
    apportionedCredit,
    onlyCaregiver
      ? "Only caregiver receives the full base credit"
      : "Base credit × care expenses share percentage, rounded to nearest dollar",
    {
      "Base credit": baseCredit,
      "Only caregiver": String(onlyCaregiver),
      "Care expenses share percent": careExpensesSharePercent,
    }
  );

  const credit = eligible ? apportionedCredit : new Decimal(0);

  audit.record(
    "NJ-1040",
    "62",
    "Wounded Warrior Caregivers Credit",
    credit,
    "Eligible taxpayers receive the apportioned credit; otherwise $0",
    {
      Eligible: String(eligible),
      "Apportioned credit": apportionedCredit,
    }
  );

  return {
    incomeLimit,
    eligible,
    baseCredit,
    careExpensesSharePercent,
    credit,
    lines: audit.getLines(),
  };
}
