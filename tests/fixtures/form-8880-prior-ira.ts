/** Fictional matching originals for one prior-year payment. */
export function priorYearOrdinaryIraDistribution(amount = "500") {
  return {
    original: {
      taxYear: 2025 as const,
      accountHolder: "primary" as const,
      recipientTaxIdLast4: "6789",
      payerTin: "98-7654321",
      accountReference: "FICTIONAL RETIREMENT ACCOUNT",
      sourceReference: "FICTIONAL 2025 FORM 1099-R",
      accountType: "traditional-ira" as const,
      iraSepSimple: true as const,
      distributionCode: "7" as const,
      grossDistribution: amount,
      taxableAmount: amount,
      taxableAmountNotDetermined: false as const,
    },
    issuerPayment: {
      sourceReference: "FICTIONAL 2025 IRA PAYMENT",
      payerTin: "98-7654321",
      accountReference: "FICTIONAL RETIREMENT ACCOUNT",
      receivedDate: "2025-12-31",
      amount,
    },
    statementReportsThisSinglePaymentConfirmed: true as const,
    noLine4ExclusionConfirmed: true as const,
    onlyIncludiblePaymentForTestingPeriodConfirmed: true as const,
  };
}
