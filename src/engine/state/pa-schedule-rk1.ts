/**
 * Pennsylvania PA-20S/PA-65 Schedule RK-1 / NRK-1 statement aggregation
 * Spec: spec/state/pa-schedule-rk1.yaml
 *
 * These statements already classify pass-through income for Pennsylvania.
 * When present, the PA resident orchestrator can use them instead of
 * inferring PA classes from federal Schedule K-1 boxes.
 */

import Decimal from "decimal.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { PAPassThroughStatement } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

export interface PAScheduleRK1Input {
  taxYear: number;
  statements?: readonly PAPassThroughStatement[];
}

export interface PAScheduleRK1StatementResult extends Omit<
  PAPassThroughStatement,
  | "businessIncome"
  | "interestIncome"
  | "dividendIncome"
  | "netGainOrLoss"
  | "netRentalIncome"
  | "estateTrustIncome"
  | "gamblingIncome"
  | "nonresidentTaxWithheld"
> {
  businessIncome: Decimal;
  interestIncome: Decimal;
  dividendIncome: Decimal;
  netGainOrLoss: Decimal;
  netRentalIncome: Decimal;
  estateTrustIncome: Decimal;
  gamblingIncome: Decimal;
  nonresidentTaxWithheld: Decimal;
}

export interface PAScheduleRK1Result {
  statements: PAScheduleRK1StatementResult[];
  totalBusinessIncome: Decimal;
  totalInterestIncome: Decimal;
  totalDividendIncome: Decimal;
  totalNetGainOrLoss: Decimal;
  totalNetRentalIncome: Decimal;
  totalEstateTrustIncome: Decimal;
  totalGamblingIncome: Decimal;
  totalNonresidentTaxWithheld: Decimal;
  lines: CalculatedLine[];
}

export function calculatePAScheduleRK1(input: PAScheduleRK1Input): PAScheduleRK1Result {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule RK-1 constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const statements = (input.statements ?? []).map((statement, index) => {
    const interestIncome = statement.sourceDocument === "pa_rk_1"
      ? d(statement.interestIncome)
      : new Decimal(0);
    const dividendIncome = statement.sourceDocument === "pa_rk_1"
      ? d(statement.dividendIncome)
      : new Decimal(0);
    const nonresidentTaxWithheld = statement.sourceDocument === "pa_nrk_1"
      ? zeroFloor(d(statement.nonresidentTaxWithheld))
      : new Decimal(0);

    const result: PAScheduleRK1StatementResult = {
      ...statement,
      businessIncome: d(statement.businessIncome),
      interestIncome,
      dividendIncome,
      netGainOrLoss: d(statement.netGainOrLoss),
      netRentalIncome: d(statement.netRentalIncome),
      estateTrustIncome: d(statement.estateTrustIncome),
      gamblingIncome: d(statement.gamblingIncome),
      nonresidentTaxWithheld,
    };

    audit.record(
      "PA-Schedule-RK1",
      `business-${index + 1}`,
      `Business income from ${statement.entityName}`,
      result.businessIncome,
      `${statement.sourceDocument} classified business income`,
    );
    audit.record(
      "PA-Schedule-RK1",
      `interest-${index + 1}`,
      `Interest income from ${statement.entityName}`,
      result.interestIncome,
      statement.sourceDocument === "pa_rk_1"
        ? "Resident RK-1 Line 2 interest income"
        : "NRK-1 does not contribute Pennsylvania interest income",
    );
    audit.record(
      "PA-Schedule-RK1",
      `dividend-${index + 1}`,
      `Dividend income from ${statement.entityName}`,
      result.dividendIncome,
      statement.sourceDocument === "pa_rk_1"
        ? "Resident RK-1 Line 3 dividend income"
        : "NRK-1 does not contribute Pennsylvania dividend income",
    );
    audit.record(
      "PA-Schedule-RK1",
      `gain-${index + 1}`,
      `Net gain or loss from ${statement.entityName}`,
      result.netGainOrLoss,
      `${statement.sourceDocument} classified net gain or loss`,
    );
    audit.record(
      "PA-Schedule-RK1",
      `rental-${index + 1}`,
      `Net rental income from ${statement.entityName}`,
      result.netRentalIncome,
      `${statement.sourceDocument} classified rent/royalty income`,
    );
    audit.record(
      "PA-Schedule-RK1",
      `estate-${index + 1}`,
      `Estate or trust income from ${statement.entityName}`,
      result.estateTrustIncome,
      `${statement.sourceDocument} classified estate or trust income`,
    );
    audit.record(
      "PA-Schedule-RK1",
      `gambling-${index + 1}`,
      `Gambling income from ${statement.entityName}`,
      result.gamblingIncome,
      `${statement.sourceDocument} classified gambling income`,
    );
    audit.record(
      "PA-Schedule-RK1",
      `withholding-${index + 1}`,
      `Nonresident withholding from ${statement.entityName}`,
      result.nonresidentTaxWithheld,
      statement.sourceDocument === "pa_nrk_1"
        ? "Positive PA Schedule NRK-1 Line 6 withholding"
        : "Only PA Schedule NRK-1 statements contribute withholding to PA-40 Line 17",
    );

    return result;
  });

  const totalBusinessIncome = sum(...statements.map((statement) => statement.businessIncome));
  const totalInterestIncome = sum(...statements.map((statement) => statement.interestIncome));
  const totalDividendIncome = sum(...statements.map((statement) => statement.dividendIncome));
  const totalNetGainOrLoss = sum(...statements.map((statement) => statement.netGainOrLoss));
  const totalNetRentalIncome = sum(...statements.map((statement) => statement.netRentalIncome));
  const totalEstateTrustIncome = sum(...statements.map((statement) => statement.estateTrustIncome));
  const totalGamblingIncome = sum(...statements.map((statement) => statement.gamblingIncome));
  const totalNonresidentTaxWithheld = sum(
    ...statements.map((statement) => statement.nonresidentTaxWithheld),
  );

  audit.record("PA-Schedule-RK1", "business-total", "Total business income", totalBusinessIncome, "Sum of statement business income");
  audit.record("PA-Schedule-RK1", "interest-total", "Total interest income", totalInterestIncome, "Sum of resident RK-1 interest income");
  audit.record("PA-Schedule-RK1", "dividend-total", "Total dividend income", totalDividendIncome, "Sum of resident RK-1 dividend income");
  audit.record("PA-Schedule-RK1", "gain-total", "Total net gain or loss", totalNetGainOrLoss, "Sum of statement net gains or losses");
  audit.record("PA-Schedule-RK1", "rental-total", "Total net rental income", totalNetRentalIncome, "Sum of statement rents and royalties");
  audit.record("PA-Schedule-RK1", "estate-total", "Total estate or trust income", totalEstateTrustIncome, "Sum of statement estate or trust income");
  audit.record("PA-Schedule-RK1", "gambling-total", "Total gambling income", totalGamblingIncome, "Sum of statement gambling income");
  audit.record(
    "PA-Schedule-RK1",
    "withholding-total",
    "Total nonresident withholding for PA-40 Line 17",
    totalNonresidentTaxWithheld,
    "Sum of positive PA Schedule NRK-1 Line 6 withholding amounts",
  );

  return {
    statements,
    totalBusinessIncome,
    totalInterestIncome,
    totalDividendIncome,
    totalNetGainOrLoss,
    totalNetRentalIncome,
    totalEstateTrustIncome,
    totalGamblingIncome,
    totalNonresidentTaxWithheld,
    lines: audit.getLines(),
  };
}
