function historicalIraPayment(amount: string, taxYear: 2024 | 2025) {
  return {
    original: {
      taxYear,
      accountHolder: "primary" as const,
      recipientTaxIdLast4: "6789",
      payerTin: "98-7654321",
      accountReference: "FICTIONAL RETIREMENT ACCOUNT",
      sourceReference: `FICTIONAL ${taxYear} FORM 1099-R`,
      accountType: "traditional-ira" as const,
      iraSepSimple: true as const,
      distributionCode: "7" as const,
      grossDistribution: amount,
      taxableAmount: amount,
      taxableAmountNotDetermined: false as const,
    },
    issuerPayment: {
      sourceReference: `FICTIONAL ${taxYear} IRA PAYMENT`,
      payerTin: "98-7654321",
      accountReference: "FICTIONAL RETIREMENT ACCOUNT",
      receivedDate: `${taxYear}-12-31`,
      amount,
    },
    statementReportsThisSinglePaymentConfirmed: true as const,
    noLine4ExclusionConfirmed: true as const,
  };
}

/** Fictional matching originals for one prior-year payment. */
export function priorYearOrdinaryIraDistribution(amount = "500", taxYear: 2024 | 2025 = 2025) {
  return { ...historicalIraPayment(amount, taxYear), onlyIncludiblePaymentForTestingPeriodConfirmed: true as const };
}

/** Fictional matching originals for one payment per historical year. */
export function twoPriorYearOrdinaryIraDistributions(amount2024 = "200.25", amount2025 = "300.50") {
  return {
    payments: [historicalIraPayment(amount2024, 2024), historicalIraPayment(amount2025, 2025)] as const,
    onlyIncludiblePaymentsForTestingPeriodConfirmed: true as const,
  };
}
