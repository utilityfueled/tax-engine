export function assertSupportedWholeReturnAccountingPeriod(facts?: { shortTaxYear?: boolean | null }): void {
  if (facts?.shortTaxYear === true) {
    throw new Error("This return has a short tax year because of an accounting-period change. The required annualized tax calculation is unavailable.");
  }
}
