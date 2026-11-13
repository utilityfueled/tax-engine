export function farmPayment(sourceId: string, taxableAmount: string, receivedDate = "2025-04-02", accountHolder = "primary") {
  return { sourceId, sourceReference: `Synthetic payment advice ${sourceId}`, receivedDate, taxableAmount,
    accountHolder, program: "crp-annual-rental", benefitAtReceipt: "ssa-disability",
    benefitSourceReference: "Synthetic benefit payment record", annualBenefitStatementSourceId: `ssa-${accountHolder}`,
    noAttributableScheduleFDeductionsConfirmed: true };
}

export function annualFarmBenefit(accountHolder = "primary", taxYear = 2025, netBenefits = "6000") {
  return { sourceId: `ssa-${accountHolder}`, accountHolder, sourceTaxYear: taxYear, netBenefits };
}

export function cashFarmPayments(
  amount: string,
  payments: unknown[] = [farmPayment("crp-a", amount)],
  accountHolder = "primary",
) {
  return { accountingMethod: "cash", accountHolder, materiallyParticipated: true,
    agriculturalProgramPayments: amount, agriculturalPaymentSources: {
      sourceTaxYear: 2025, sourceFactsConfirmed: true, completeTaxablePaymentsConfirmed: true,
      allGrossPaymentsTaxableConfirmed: true, activeDomesticFarmConfirmed: true, payments,
    } };
}
