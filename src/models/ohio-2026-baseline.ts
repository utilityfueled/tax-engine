/** Independently declared candidate data; never a complete Ohio year registry. */
import Decimal from "decimal.js";
import { freezeRuleData, type RulePackMetadata } from "./rule-pack-metadata.js";

const d = (value: string) => new Decimal(value);
const metadata: RulePackMetadata = {
  taxYear: 2026,
  ruleVersion: "oh-2026.1-baseline-draft",
  calculationStatus: "incomplete",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  sources: [
    { url: "https://codes.ohio.gov/ohio-revised-code/section-5747.02/9-30-2025", section: "(A)(3)(c) nonbusiness tax and (A)(4) separate business tax", revision: "HB96 effective September 30, 2025", retrievedAt: "2026-10-25" },
    { url: "https://codes.ohio.gov/ohio-revised-code/section-5747.025/9-30-2025", section: "(A)-(C) exemptions, exclusive 2026 MAGI ceiling and index mechanism", revision: "HB96 effective September 30, 2025", retrievedAt: "2026-10-25" },
    { url: "https://codes.ohio.gov/ohio-revised-code/section-5747.05/9-30-2025", section: "(E) joint qualifying income, percentage tiers, cap and exclusive MAGI ceiling", revision: "HB96 effective September 30, 2025", retrievedAt: "2026-10-25" },
    { url: "https://www.lsc.ohio.gov/assets/legislation/136/hb96/en0/files/hb96-tax-comparison-document-as-enacted-136th-general-assembly.pdf", section: "TAXCD103, printed page8, uncodified section757.120; 2025/2026 indexing suspension", revision: "136th General Assembly HB96 as enacted", retrievedAt: "2026-10-25" },
    { url: "https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf", section: "Printed pages17 and29; indexed exemption amounts, whole-dollar reporting and joint credit", revision: "Final 2025 booklet; amounts retained by enacted 2026 indexing suspension", retrievedAt: "2026-10-25" },
  ],
  limitations: [
    "Isolated enacted rate, exemption and joint-credit candidate; no full 2026 Ohio return availability.",
    "Actual conformity, source eligibility, residency, other credits, local/school tax, payments and carryovers are separate required computations.",
    "Launch-state demand, independent review and final 2026 instructions/forms are not established.",
  ],
};

export const OHIO_2026_BASELINE = freezeRuleData({
  metadata,
  nonbusinessThreshold: d("26050"), nonbusinessBaseTax: d("332"), nonbusinessRate: d("0.0275"),
  businessRate: d("0.03"), exemptionMagiLimit: d("500000"),
  exemptionTiers: [
    { maximumMagi: d("40000"), amount: d("2400") },
    { maximumMagi: d("80000"), amount: d("2150") },
    { maximumMagi: null, amount: d("1900") },
  ],
  jointMagiLimit: d("500000"), jointMinimumQualifyingIncome: d("500"), jointCreditMaximum: d("650"),
  jointCreditTiers: [
    { maximumMagiLessExemptions: d("25000"), rate: d("0.20") },
    { maximumMagiLessExemptions: d("50000"), rate: d("0.15") },
    { maximumMagiLessExemptions: d("75000"), rate: d("0.10") },
    { maximumMagiLessExemptions: null, rate: d("0.05") },
  ],
});
