/**
 * California Form 540 resident payments and refund/balance-due assembly.
 * Spec: spec/state/ca-form-540-payments.yaml
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, sum, zeroFloor } from "@/utils/decimal.js";

export interface CAForm540ResidentPaymentsInput {
  line64TotalTax: Decimal | string | number;
  line71Withholding?: Decimal | string | number;
  line72EstimatedPayments?: Decimal | string | number;
  line73RealEstateWithholding?: Decimal | string | number;
  line74RefundableCredits?: Decimal | string | number;
  line75CaliforniaEarnedIncomeTaxCredit?: Decimal | string | number;
  line76YoungChildTaxCredit?: Decimal | string | number;
  line77FosterYouthTaxCredit?: Decimal | string | number;
  line91UseTax?: Decimal | string | number;
  hasFullYearHealthCoverage?: boolean;
  line92IndividualSharedResponsibilityPenalty?: Decimal | string | number;
  line98AppliedToEstimatedTax?: Decimal | string | number;
  line110VoluntaryContributions?: Decimal | string | number;
  line112InterestAndPenalties?: Decimal | string | number;
  line113UnderpaymentPenalty?: Decimal | string | number;
}

export interface CAForm540ResidentPaymentsResult {
  line64TotalTax: Decimal;
  line71Withholding: Decimal;
  line72EstimatedPayments: Decimal;
  line73RealEstateWithholding: Decimal;
  line74RefundableCredits: Decimal;
  line75CaliforniaEarnedIncomeTaxCredit: Decimal;
  line76YoungChildTaxCredit: Decimal;
  line77FosterYouthTaxCredit: Decimal;
  line78TotalPayments: Decimal;
  line91UseTax: Decimal;
  line92IndividualSharedResponsibilityPenalty: Decimal;
  line93PaymentsAfterUseTax: Decimal;
  line94UseTaxBalanceDue: Decimal;
  line95PaymentsAfterIsrPenalty: Decimal;
  line96IsrPenaltyBalanceDue: Decimal;
  line97OverpaidTax: Decimal;
  line98AppliedToEstimatedTax: Decimal;
  line99Refund: Decimal;
  line100TaxDue: Decimal;
  line110VoluntaryContributions: Decimal;
  line111AmountDueBeforePenalties: Decimal;
  line112InterestAndPenalties: Decimal;
  line113UnderpaymentPenalty: Decimal;
  line114AmountDue: Decimal;
  line115RefundAfterContributionsAndPenalties: Decimal;
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

export function calculateCAForm540ResidentPayments(
  input: CAForm540ResidentPaymentsInput
): CAForm540ResidentPaymentsResult {
  const line64TotalTax = nonNegativeAmount(input.line64TotalTax, "CA Form 540 line 64 total tax");
  const line71Withholding = nonNegativeAmount(input.line71Withholding, "CA Form 540 line 71 withholding");
  const line72EstimatedPayments = nonNegativeAmount(
    input.line72EstimatedPayments,
    "CA Form 540 line 72 estimated payments"
  );
  const line73RealEstateWithholding = nonNegativeAmount(
    input.line73RealEstateWithholding,
    "CA Form 540 line 73 real estate withholding"
  );
  const line74RefundableCredits = nonNegativeAmount(
    input.line74RefundableCredits,
    "CA Form 540 line 74 refundable credits"
  );
  const line75CaliforniaEarnedIncomeTaxCredit = nonNegativeAmount(
    input.line75CaliforniaEarnedIncomeTaxCredit,
    "CA Form 540 line 75 California Earned Income Tax Credit"
  );
  const line76YoungChildTaxCredit = nonNegativeAmount(
    input.line76YoungChildTaxCredit,
    "CA Form 540 line 76 Young Child Tax Credit"
  );
  const line77FosterYouthTaxCredit = nonNegativeAmount(
    input.line77FosterYouthTaxCredit,
    "CA Form 540 line 77 Foster Youth Tax Credit"
  );
  const line91UseTax = nonNegativeAmount(input.line91UseTax, "CA Form 540 line 91 use tax");
  const line110VoluntaryContributions = nonNegativeAmount(
    input.line110VoluntaryContributions,
    "CA Form 540 line 110 voluntary contributions"
  );
  const line112InterestAndPenalties = nonNegativeAmount(
    input.line112InterestAndPenalties,
    "CA Form 540 line 112 interest and penalties"
  );
  const line113UnderpaymentPenalty = nonNegativeAmount(
    input.line113UnderpaymentPenalty,
    "CA Form 540 line 113 underpayment penalty"
  );

  const line78TotalPayments = sum(
    line71Withholding,
    line72EstimatedPayments,
    line73RealEstateWithholding,
    line74RefundableCredits,
    line75CaliforniaEarnedIncomeTaxCredit,
    line76YoungChildTaxCredit,
    line77FosterYouthTaxCredit
  );

  const line92IndividualSharedResponsibilityPenalty = input.hasFullYearHealthCoverage
    ? d(0)
    : nonNegativeAmount(
        input.line92IndividualSharedResponsibilityPenalty,
        "CA Form 540 line 92 Individual Shared Responsibility penalty"
      );

  const line93PaymentsAfterUseTax = zeroFloor(line78TotalPayments.minus(line91UseTax));
  const line94UseTaxBalanceDue = zeroFloor(line91UseTax.minus(line78TotalPayments));
  const line95PaymentsAfterIsrPenalty = zeroFloor(
    line93PaymentsAfterUseTax.minus(line92IndividualSharedResponsibilityPenalty)
  );
  const line96IsrPenaltyBalanceDue = zeroFloor(
    line92IndividualSharedResponsibilityPenalty.minus(line93PaymentsAfterUseTax)
  );
  const line97OverpaidTax = zeroFloor(line95PaymentsAfterIsrPenalty.minus(line64TotalTax));

  const line98AppliedToEstimatedTax = nonNegativeAmount(
    input.line98AppliedToEstimatedTax,
    "CA Form 540 line 98 applied estimated tax"
  );
  if (line98AppliedToEstimatedTax.greaterThan(line97OverpaidTax)) {
    throw new Error("CA Form 540 line 98 applied estimated tax cannot exceed line 97 overpaid tax");
  }

  const line99Refund = zeroFloor(line97OverpaidTax.minus(line98AppliedToEstimatedTax));
  const line100TaxDue = zeroFloor(line64TotalTax.minus(line95PaymentsAfterIsrPenalty));

  const line111AmountDueBeforePenalties = line99Refund.greaterThan(0)
    ? zeroFloor(line110VoluntaryContributions.minus(line99Refund))
    : sum(line94UseTaxBalanceDue, line96IsrPenaltyBalanceDue, line100TaxDue, line110VoluntaryContributions);

  const contributionAndPenaltyOffsets = sum(
    line110VoluntaryContributions,
    line112InterestAndPenalties,
    line113UnderpaymentPenalty
  );

  const line114AmountDue = line111AmountDueBeforePenalties.greaterThan(0)
    ? sum(line111AmountDueBeforePenalties, line112InterestAndPenalties, line113UnderpaymentPenalty)
    : zeroFloor(contributionAndPenaltyOffsets.minus(line99Refund));

  const line115RefundAfterContributionsAndPenalties = line111AmountDueBeforePenalties.greaterThan(0)
    ? d(0)
    : zeroFloor(line99Refund.minus(contributionAndPenaltyOffsets));

  const audit = new AuditTrail();

  audit.record(
    "CA-540",
    "71",
    "California income tax withheld",
    line71Withholding,
    "Supported upstream input for Form 540 line 71"
  );
  audit.record(
    "CA-540",
    "72",
    "2025 CA estimated tax and other payments",
    line72EstimatedPayments,
    "Supported upstream input for Form 540 line 72"
  );
  audit.record(
    "CA-540",
    "73",
    "Real estate and other withholding",
    line73RealEstateWithholding,
    "Supported upstream input for Form 540 line 73"
  );
  audit.record(
    "CA-540",
    "74",
    "Refundable credits",
    line74RefundableCredits,
    "Supported upstream input for Form 540 line 74"
  );
  audit.record(
    "CA-540",
    "75",
    "California Earned Income Tax Credit",
    line75CaliforniaEarnedIncomeTaxCredit,
    "Supported upstream input for Form 540 line 75"
  );
  audit.record(
    "CA-540",
    "76",
    "Young Child Tax Credit",
    line76YoungChildTaxCredit,
    "Supported upstream input for Form 540 line 76"
  );
  audit.record(
    "CA-540",
    "77",
    "Foster Youth Tax Credit",
    line77FosterYouthTaxCredit,
    "Supported upstream input for Form 540 line 77"
  );
  audit.record(
    "CA-540",
    "78",
    "Total payments",
    line78TotalPayments,
    "Line 71 + Line 72 + Line 73 + Line 74 + Line 75 + Line 76 + Line 77",
    {
      "Line 71": line71Withholding,
      "Line 72": line72EstimatedPayments,
      "Line 73": line73RealEstateWithholding,
      "Line 74": line74RefundableCredits,
      "Line 75": line75CaliforniaEarnedIncomeTaxCredit,
      "Line 76": line76YoungChildTaxCredit,
      "Line 77": line77FosterYouthTaxCredit,
    }
  );

  audit.record("CA-540", "91", "Use tax", line91UseTax, "Supported upstream input for Form 540 line 91");
  audit.record(
    "CA-540",
    "92",
    "Individual Shared Responsibility penalty",
    line92IndividualSharedResponsibilityPenalty,
    input.hasFullYearHealthCoverage
      ? "Full-year health-care coverage box checked, so line 92 is 0"
      : "Supported upstream input for Form 540 line 92 from FTB 3853",
    {
      "Full-year coverage": input.hasFullYearHealthCoverage ? "checked" : "not_checked",
    }
  );

  audit.record(
    "CA-540",
    "93",
    "Payments after use tax",
    line93PaymentsAfterUseTax,
    "max(0, Line 78 - Line 91)",
    {
      "Line 78": line78TotalPayments,
      "Line 91": line91UseTax,
    }
  );
  audit.record(
    "CA-540",
    "94",
    "Use-tax balance due",
    line94UseTaxBalanceDue,
    "max(0, Line 91 - Line 78)",
    {
      "Line 78": line78TotalPayments,
      "Line 91": line91UseTax,
    }
  );
  audit.record(
    "CA-540",
    "95",
    "Payments after Individual Shared Responsibility penalty",
    line95PaymentsAfterIsrPenalty,
    "max(0, Line 93 - Line 92)",
    {
      "Line 93": line93PaymentsAfterUseTax,
      "Line 92": line92IndividualSharedResponsibilityPenalty,
    }
  );
  audit.record(
    "CA-540",
    "96",
    "Individual Shared Responsibility penalty balance due",
    line96IsrPenaltyBalanceDue,
    "max(0, Line 92 - Line 93)",
    {
      "Line 93": line93PaymentsAfterUseTax,
      "Line 92": line92IndividualSharedResponsibilityPenalty,
    }
  );
  audit.record(
    "CA-540",
    "97",
    "Overpaid tax",
    line97OverpaidTax,
    "max(0, Line 95 - Line 64)",
    {
      "Line 95": line95PaymentsAfterIsrPenalty,
      "Line 64": line64TotalTax,
    }
  );
  audit.record(
    "CA-540",
    "98",
    "Amount applied to 2026 estimated tax",
    line98AppliedToEstimatedTax,
    "Supported taxpayer election input for Form 540 line 98",
    {
      "Line 97": line97OverpaidTax,
    }
  );
  audit.record(
    "CA-540",
    "99",
    "Refund amount",
    line99Refund,
    "max(0, Line 97 - Line 98)",
    {
      "Line 97": line97OverpaidTax,
      "Line 98": line98AppliedToEstimatedTax,
    }
  );
  audit.record(
    "CA-540",
    "100",
    "Tax due",
    line100TaxDue,
    "max(0, Line 64 - Line 95)",
    {
      "Line 64": line64TotalTax,
      "Line 95": line95PaymentsAfterIsrPenalty,
    }
  );
  audit.record(
    "CA-540",
    "110",
    "Total voluntary contributions",
    line110VoluntaryContributions,
    "Supported upstream input for Form 540 line 110"
  );
  audit.record(
    "CA-540",
    "111",
    "Subtotal amount due before interest and penalties",
    line111AmountDueBeforePenalties,
    line99Refund.greaterThan(0)
      ? "max(0, Line 110 - Line 99)"
      : "Line 94 + Line 96 + Line 100 + Line 110",
    {
      "Line 94": line94UseTaxBalanceDue,
      "Line 96": line96IsrPenaltyBalanceDue,
      "Line 100": line100TaxDue,
      "Line 110": line110VoluntaryContributions,
      "Line 99": line99Refund,
    }
  );
  audit.record(
    "CA-540",
    "112",
    "Interest, late return penalties, and late payment penalties",
    line112InterestAndPenalties,
    "Supported upstream input for Form 540 line 112"
  );
  audit.record(
    "CA-540",
    "113",
    "Underpayment of estimated tax",
    line113UnderpaymentPenalty,
    "Supported upstream input for Form 540 line 113"
  );
  audit.record(
    "CA-540",
    "114",
    "Total amount due",
    line114AmountDue,
    line111AmountDueBeforePenalties.greaterThan(0)
      ? "Line 111 + Line 112 + Line 113"
      : "max(0, (Line 110 + Line 112 + Line 113) - Line 99)",
    {
      "Line 111": line111AmountDueBeforePenalties,
      "Line 110": line110VoluntaryContributions,
      "Line 112": line112InterestAndPenalties,
      "Line 113": line113UnderpaymentPenalty,
      "Line 99": line99Refund,
    }
  );
  audit.record(
    "CA-540",
    "115",
    "Refund after voluntary contributions and penalties",
    line115RefundAfterContributionsAndPenalties,
    line111AmountDueBeforePenalties.greaterThan(0)
      ? "If Line 111 is greater than 0, line 115 is 0"
      : "max(0, Line 99 - (Line 110 + Line 112 + Line 113))",
    {
      "Line 99": line99Refund,
      "Line 110": line110VoluntaryContributions,
      "Line 112": line112InterestAndPenalties,
      "Line 113": line113UnderpaymentPenalty,
    }
  );

  return {
    line64TotalTax,
    line71Withholding,
    line72EstimatedPayments,
    line73RealEstateWithholding,
    line74RefundableCredits,
    line75CaliforniaEarnedIncomeTaxCredit,
    line76YoungChildTaxCredit,
    line77FosterYouthTaxCredit,
    line78TotalPayments,
    line91UseTax,
    line92IndividualSharedResponsibilityPenalty,
    line93PaymentsAfterUseTax,
    line94UseTaxBalanceDue,
    line95PaymentsAfterIsrPenalty,
    line96IsrPenaltyBalanceDue,
    line97OverpaidTax,
    line98AppliedToEstimatedTax,
    line99Refund,
    line100TaxDue,
    line110VoluntaryContributions,
    line111AmountDueBeforePenalties,
    line112InterestAndPenalties,
    line113UnderpaymentPenalty,
    line114AmountDue,
    line115RefundAfterContributionsAndPenalties,
    lines: audit.getLines(),
  };
}
