import Decimal from "decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

export const mortgageLoan = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "loan-one", form1098SourceId: "1098-one", lenderName: "Synthetic mortgage lender", accountHolder: "primary",
  homeId: "home-one", homeUse: "main", qualifiedResidence: true, securedDebt: true, ownershipInterest: true, obligationToRepay: true,
  originationDate: "2020-01-01", loanType: "original", acquisitionUse: true, currentYearInterestOnly: true,
  interestPaid: "40000", interestPaidByOthers: "0", interestDeductedElsewhere: "0", sameYearInterestRefund: "0", nonqualifiedInterest: "0",
  pointsPaid: "0", pointsPaidByOthers: "0", pointsNotInterest: "0", points: { method: "none" },
  balance: { method: "highest_balance", amount: "1000000", sourceReference: "Actual annual maximum" },
  ...overrides,
});
export const mortgageInput = (loans = [mortgageLoan()], overrides: Record<string, unknown> = {}) => TaxYearInputSchema.parse({
  ...simpleW2Fixture,
  form1098: loans.filter(loan => loan.form1098SourceId !== undefined).map(loan => ({
    sourceId: loan.form1098SourceId, taxYear: 2025, lender: loan.lenderName,
    mortgageOriginationDate: loan.originationDate, mortgageInterestReceived: new Decimal(String(loan.interestPaid)).plus(String(loan.interestPaidByOthers)).toString(),
    outstandingMortgagePrincipal: "1", refundOfOverpaidInterest: "0", mortgageInsurancePremiums: "0",
    pointsPaid: new Decimal(String(loan.pointsPaid)).plus(String(loan.pointsPaidByOthers)).toString(), propertyTax: "0",
  })),
  mortgageInterestWorksheet: {
    sourceTaxYear: 2025, sourceReference: "Synthetic annual loan records", sourceFactsConfirmed: true,
    allHomeDebtIncluded: true, loans, priorYearInterestRecoveries: []
  },
  ...overrides,
});
