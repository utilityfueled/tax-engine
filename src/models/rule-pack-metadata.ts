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
    ruleVersion: "2025.3",
    calculationStatus: "legacy-available",
    reviewStatus: "independent-review-pending",
    filingQualified: false,
    sources: [
      { url: "https://www.irs.gov/instructions/i6251", section: "Line 5, Exemption Worksheet", revision: "2025 instructions", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/instructions/i1040sca", section: "Line 5e, State and Local Tax Deduction Worksheet", revision: "2025 instructions", retrievedAt: "2026-10-24" },
      { url: "https://www.irs.gov/instructions/i1040s8", section: "Part I and Part II", revision: "2025 instructions", retrievedAt: "2026-10-24" },
    ],
    limitations: ["Legacy calculations plus SALT/CTC amount corrections; remaining eligibility and law changes require review.", "Final forms and enabled scenarios have not been independently qualified."],
  },
  2026: {
    taxYear: 2026,
    ruleVersion: "2026.1-indexed-draft",
    calculationStatus: "incomplete",
    reviewStatus: "independent-review-pending",
    filingQualified: false,
    sources: [
      { url: "https://www.irs.gov/irb/2025-45_IRB", section: "Rev. Proc. 2025-32, section 4", revision: "2025-32", retrievedAt: "2026-10-24" },
      { url: "https://www.ssa.gov/OACT/COLA/cbb.html", section: "2026 contribution and benefit base", revision: "2026 row", retrievedAt: "2026-10-24" },
      { url: "https://uscode.house.gov/us/usc/119-118/t26/s55/", section: "55(d)(4)(A)(ii)(IV), AMT phase-out rate", revision: "Through Public Law 119-120", retrievedAt: "2026-10-24" },
    ],
    limitations: ["The complete 2026 federal calculation is not implemented or qualified. Do not substitute another year's rules.", "Schedule 1-A, other law changes, state conformity and final form mappings remain release gates."],
  },
});

export function getRulePack(year: number): RulePackMetadata {
  const pack = FEDERAL_RULE_PACKS[year];
  if (!pack) throw new Error(`Unknown tax year ${year}. Known years: ${Object.keys(FEDERAL_RULE_PACKS).join(", ")}`);
  return pack;
}
