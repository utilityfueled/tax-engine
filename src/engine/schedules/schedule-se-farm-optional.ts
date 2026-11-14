/** 2026 farm optional earnings estimate. Spec: spec/federal/schedule-se-farm-optional.yaml. */
import type Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";

type Owner = "primary" | "spouse";

interface FarmOptionalInput {
  taxYear: number;
  accountHolder: Owner;
  electionRequested: boolean;
  scheduleF: {
    sourceTaxYear: number;
    accountHolder: Owner;
    sourceReference: string;
    sourceAmountsCompleteConfirmed: boolean;
    fullCalendarYearConfirmed: boolean;
    domesticSoleProprietorConfirmed: boolean;
    agriculturalLaborConfirmed: boolean;
    accountingMethod: "cash" | "accrual";
    grossIncome: string;
    netProfit: string;
  };
  noCrpPaymentsConfirmed: boolean;
  noOtherSelfEmploymentConfirmed: boolean;
  noChurchEmployeeIncomeConfirmed: boolean;
  noSeTaxExemptionConfirmed: boolean;
}

interface FarmOptionalEstimate {
  accountHolder: Owner;
  line14Cap: Decimal;
  line15: Decimal;
  line4b: Decimal;
  lines: CalculatedLine[];
}

function sourceAmount(value: unknown): Decimal {
  if (typeof value !== "string" || !/^-?\d{1,12}(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Schedule SE farm optional method requires actual Schedule F amounts in dollars and cents.");
  }
  return d(value);
}

export function calculateScheduleSEFarmOptional(input: FarmOptionalInput): FarmOptionalEstimate {
  if (input.taxYear !== 2026) throw new Error("This farm optional estimator supports tax year 2026 only.");
  if (input.electionRequested !== true) throw new Error("Schedule SE farm optional method requires an affirmative election.");

  const { accountHolder, scheduleF } = input;
  if (!scheduleF || (accountHolder !== "primary" && accountHolder !== "spouse")
    || scheduleF.accountHolder !== accountHolder || scheduleF.sourceTaxYear !== input.taxYear
    || typeof scheduleF.sourceReference !== "string" || !scheduleF.sourceReference.trim()
    || scheduleF.sourceAmountsCompleteConfirmed !== true || scheduleF.fullCalendarYearConfirmed !== true
    || scheduleF.domesticSoleProprietorConfirmed !== true || scheduleF.agriculturalLaborConfirmed !== true
    || scheduleF.accountingMethod !== "cash") {
    throw new Error("Farm optional method requires complete same-owner Schedule F sources for a domestic cash-method sole proprietor's full calendar year.");
  }
  if (input.noCrpPaymentsConfirmed !== true || input.noOtherSelfEmploymentConfirmed !== true
    || input.noChurchEmployeeIncomeConfirmed !== true || input.noSeTaxExemptionConfirmed !== true) {
    throw new Error("Farm optional method requires confirmation of no CRP payments, other self-employment, church employee income or SE tax exemption.");
  }

  const gross = sourceAmount(scheduleF.grossIncome);
  const net = sourceAmount(scheduleF.netProfit);
  if (net.gt(gross)) throw new Error("Schedule F net profit exceeds gross income in this ordinary farm method.");
  if (gross.gt("11340") && net.gte("8186")) throw new Error("This farm is ineligible for the 2026 Schedule SE farm optional method.");

  const audit = new AuditTrail();
  const line14Cap = d("7560");
  const line15 = audit.record("Sched SE", "15", "Farm optional net earnings", min(line14Cap, zeroFloor(gross).times(2).div(3)),
    "Smaller of the line 14 cap and two-thirds of nonnegative gross farm income", {
      "Schedule F line 9": gross, "Schedule F line 34": net, "Line 14 cap": line14Cap,
    });
  const line4b = audit.record("Sched SE", "4b", "Optional-method earnings", line15,
    "Carry line 15 once for a farm-only election", { "Line 15": line15 });
  return { accountHolder, line14Cap, line15, line4b, lines: audit.getLines() };
}
