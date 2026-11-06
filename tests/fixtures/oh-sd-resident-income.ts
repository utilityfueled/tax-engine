/** Official 2025 booklet printed60-61; unknown annual wages stay unknown. */
export const ohioSDResidentIncomeOriginals = {
  publishedFacts: { actualMoveInto3907: "2025-06-01", priorDistrictCode: "not-provided", annualWages: "not-provided" },
  // Synthetic prior9999 is NOT supplied by the booklet. It only furnishes a
  // complete calendar for a separate numerical control with the same214days.
  syntheticSameMoveCalendar: [
      { owner: "primary", periods: [
        { from: "2025-01-01", through: "2025-05-31", districtCode: "9999" },
        { from: "2025-06-01", through: "2025-12-31", districtCode: "3907" },
      ] },
      { owner: "spouse", periods: [
        { from: "2025-01-01", through: "2025-05-31", districtCode: "9999" },
        { from: "2025-06-01", through: "2025-12-31", districtCode: "3907" },
      ] },
    ],
  published: {
    taxYear: 2025,
    districtCode: "3907",
    filingStatus: "married_filing_jointly",
    annualMAGI: "166000",
    wages: { owner: "primary", method: "specific", residentAmount: "58000", annual: { status: "not-provided" } },
    selfEmployment: { owner: "spouse", method: "prorated", annualAmount: "89000", specificIdentification: "unavailable" },
    magiComponents: [
      { id: "federal-adjustments", sign: "subtract", allocation: { owner: "joint", method: "prorated", annualAmount: "9000", specificIdentification: "unavailable" } },
      { id: "ohio-529-deduction", sign: "subtract", allocation: { owner: "joint", method: "specific", residentAmount: "0", annual: { status: "known", amount: "4000" } } },
    ],
  },
} as const;
