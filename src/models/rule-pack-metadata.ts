/** Provenance is recorded separately from implementation and filing qualification. */
export interface RuleSource {
  url: string;
  section: string;
  revision: string;
  retrievedAt: string;
}

export interface RulePackMetadata {
  taxYear: number;
  ruleVersion: string;
  calculationStatus: "legacy-available" | "incomplete";
  reviewStatus: "independent-review-pending";
  filingQualified: false;
  sources: RuleSource[];
  limitations: string[];
}

export function freezeRuleData<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeRuleData(child);
    Object.freeze(value);
  }
  return value;
}

export const FEDERAL_RULE_PACKS: Readonly<Record<number, RulePackMetadata>> = freezeRuleData({
  2025: {
    taxYear: 2025,
    ruleVersion: "2025.18",
    calculationStatus: "legacy-available",
    reviewStatus: "independent-review-pending",
    filingQualified: false,
    sources: [
      { url: "https://www.irs.gov/instructions/i8995", section: "Actual owner/source attribution of SE tax, health insurance and retirement deductions", revision: "2025 final instructions and Reg.1.199A-3(b)(1)(vi)", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/publications/p550", section: "Actual OID recipient sources, premium elections and ScheduleA16 allowable excess", revision: "2025 final publication and current continuous-use OID January2024", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040sse", section: "Separate spouse regular-method forms, actual W2 Boxes3/7 and adjusted K1 Box14A", revision: "2025 final instructions; independently indexed2026 payroll values", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/pub/irs-pdf/f1040sc.pdf", section: "Official income lines3-7 and other-income routing to net profit", revision: "2025 final form; applicable current-law arithmetic", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/pub/irs-pdf/f8815.pdf", section: "Source bond history, coordinated education costs, prior-interest adjustment and line9 MAGI", revision: "2025 final form and instructions; independently indexed2026 thresholds", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1099int", section: "Separate taxable Box 1 and Treasury Box 3 source amounts", revision: "Continuous-use January2024 instructions", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/publications/p915", section: "Worksheet1 lines3-8 and19; actual exclusion addbacks and lump-sum comparison", revision: "2025 final publication; applicable current-law rules", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040gi", section: "Standard deduction, separate-owner excess Social Security, foreign income tax worksheet and wage routing", revision: "2025 final instructions; applicable current-law rules", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i2555", section: "Actual foreign income sources; net exclusion45 and housing deduction50", revision: "2025 final instructions with2026indexed values", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/publications/p970", section: "Worksheets2-1 and3-1; chapter9 savings-bond actual exclusion MAGI addbacks", revision: "2025 final publication", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i8801", section: "Prior-year minimum-tax credit and current credit limit worksheet", revision: "2025 final instructions; year-aware2026prior-year values", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i8863", section: "Student eligibility, refundable support test and actual credit limit", revision: "2025 final instructions", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/pub/irs-pdf/f1040s3.pdf", section: "Official credit and payment line routing", revision: "2025 final form", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i2210", section: "Actual dated installments and enumerated line2 taxes, household exception and source facts", revision: "2025 final instructions;2026 rates only through December", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i8839", section: "Refundable split, credit limit and employer benefit exclusion", revision: "2025 instructions and 2026 transition notices", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i5695", section: "Credit limit worksheets and carryforward", revision: "2025 instructions", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040gi", section: "Lines 1a, 1c, 1g, 1h, 25, 29, 31, 34, 35a, 37 and 38", revision: "2025 instructions", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/pub/irs-pdf/f8959.pdf", section: "Part V, withholding reconciliation", revision: "2025 final form", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/pub/irs-pdf/f1040s2.pdf", section: "Lines 1a, 2, 3, 18, 19 and 21", revision: "2025 final form", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/pub/irs-drop/n-25-67.pdf", section: "2025 QCD annual-limit comparison", revision: "Notice 2025-67", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/instructions/i6251", section: "Lines 1, 2a and 5; standard/senior add-backs and Exemption Worksheet", revision: "2025 instructions", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/instructions/i1040sca", section: "Line5a source withholding and no duplicate deduction; line5e SALT limit worksheet", revision: "2025 instructions", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040s8", section: "Part I and Part II", revision: "2025 instructions", retrievedAt: "2026-10-24" },
    ],
    limitations: ["Legacy calculations plus SALT/CTC amount corrections; remaining eligibility and law changes require review.", "Final forms and enabled scenarios have not been independently qualified."],
  },
  2026: {
    taxYear: 2026,
    ruleVersion: "2026.13-law-integration-draft",
    calculationStatus: "incomplete",
    reviewStatus: "independent-review-pending",
    filingQualified: false,
    sources: [
      { url: "https://www.irs.gov/instructions/i2210", section: "Actual dated installments and enumerated line2 taxes, household exception and source facts", revision: "2025 final instructions;2026 rates only through December", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i8995", section: "Actual owner/source attribution of SE tax, health insurance and retirement deductions", revision: "2025 final instructions and Reg.1.199A-3(b)(1)(vi)", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/publications/p550", section: "Actual OID recipient sources, premium elections and ScheduleA16 allowable excess", revision: "2025 final publication and current continuous-use OID January2024", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040sse", section: "Separate spouse regular-method forms, actual W2 Boxes3/7 and adjusted K1 Box14A", revision: "2025 final instructions; independently indexed2026 payroll values", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/pub/irs-pdf/f1040sc.pdf", section: "Official income lines3-7 and other-income routing to net profit", revision: "2025 final form; applicable current-law arithmetic", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040sca", section: "Line5a source withholding, payment year and no duplicate deduction", revision: "2025 final instructions; applicable current-law rules", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/pub/irs-pdf/f8815.pdf", section: "Source bond history, coordinated education costs, prior-interest adjustment and line9 MAGI", revision: "2025 final form and instructions; independently indexed2026 thresholds", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1099int", section: "Separate taxable Box 1 and Treasury Box 3 source amounts", revision: "Continuous-use January2024 instructions", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/publications/p915", section: "Worksheet1 lines3-8 and19; actual exclusion addbacks and lump-sum comparison", revision: "2025 final publication; applicable current-law rules", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i1040gi", section: "Standard deduction, separate-owner excess Social Security, foreign income tax worksheet and wage routing", revision: "2025 final instructions; applicable current-law rules", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i2555", section: "Actual foreign income sources; net exclusion45 and housing deduction50", revision: "2025 final instructions with2026indexed values", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/publications/p970", section: "Worksheets2-1 and3-1; chapter9 savings-bond actual exclusion MAGI addbacks", revision: "2025 final publication", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i8801", section: "Prior-year minimum-tax credit and current credit limit worksheet", revision: "2025 final instructions; year-aware2026prior-year values", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/tax-professionals/eitc-central/new-social-security-number-requirements-for-education-tax-credits", section: "2026 taxpayer or joint spouse and dependent student employment-valid SSNs", revision: "IRS current enacted-law guidance", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/instructions/i8863", section: "Student eligibility, refundable support test and actual credit limit", revision: "2025 final instructions", retrievedAt: "2026-10-25" },
      { url: "https://www.irs.gov/irb/2025-45_IRB", section: "Rev. Proc. 2025-32, section 4", revision: "2025-32", retrievedAt: "2026-10-24" },
      { url: "https://www.ssa.gov/OACT/COLA/cbb.html", section: "2026 contribution and benefit base", revision: "2026 row", retrievedAt: "2026-10-24" },
      { url: "https://uscode.house.gov/us/usc/119-118/t26/s55/", section: "55(d)(4)(A)(ii)(IV), AMT phase-out rate", revision: "Through Public Law 119-120", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/pub/irs-drop/n-25-67.pdf", section: "IRA limits/phase-outs and qualified charitable distributions", revision: "Notice 2025-67", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/pub/irs-drop/rp-25-19.pdf", section: "Section 2.01, HSA contribution limits", revision: "Rev. Proc. 2025-19", retrievedAt: "2026-10-24" },
      { url: "https://www.ssa.gov/oact/cola/CovThresh.html", section: "2026 domestic employee coverage threshold", revision: "2026 row", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/publications/p505", section: "2026 SALT, Medicare and NIIT amounts", revision: "2026 Publication 505", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/pub/irs-pdf/p926.pdf", section: "Household employment tax rates and wage bases", revision: "2026 Publication 926", retrievedAt: "2026-10-24" },
    ],
    limitations: ["The constant data has a complete federal shape, but the complete 2026 federal calculation is not implemented or qualified. Do not substitute another year's rules.", "Schedule 1-A, other law changes, state conformity and final form mappings remain release gates.", "Transition amounts for vehicles and residence debt do not establish eligibility after statutory termination dates."],
  },
});

export function getRulePack(year: number): RulePackMetadata {
  const pack = FEDERAL_RULE_PACKS[year];
  if (!pack) throw new Error(`Unknown tax year ${year}. Known years: ${Object.keys(FEDERAL_RULE_PACKS).join(", ")}`);
  return pack;
}
