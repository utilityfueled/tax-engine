/** Actual synthetic sources; Form4137 return spec. */
export function tipFacts(owner: "primary" | "spouse", received = "1000", small = "0", noncash = "0", sourceIndex?: number) {
  return { accountHolder: owner, sourceFacts: { sourceTaxYear: 2025, sourceReference: `Actual ${owner} tip diary`, sourceFactsConfirmed: true,
    allEmployersIncluded: true, reportingYearTreatmentConfirmed: true, railroadRetirementCompensation: "0", noncashTipsNotIncludedInWages: noncash,
    employers: [{ sourceId: `tips-${owner}`, employerName: owner === "primary" ? "Primary Restaurant" : "Spouse Restaurant", employerEin: owner === "primary" ? "12-3456789" : "98-7654321",
      w2SourceIds: sourceIndex === undefined ? [] : [`formW2:${sourceIndex}`], cashAndChargeTipsReceived: received, tipsReportedToEmployer: "0", allocatedTips: "0", adequateRecordsSupportUnreportedTips: true,
      railroadRetirementCovered: false, medicareOnlyGovernmentUnreportedTips: "0", reportedTipsNotIncludedInBox7: "0", box7TipsExcludedFromReportedTotal: "0",
      smallTipMonths: small === "0" ? [] : [{ month: 6, totalCashAndChargeTips: small, tipsReportedToEmployer: "0" }] }],
  } };
}
