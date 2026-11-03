// Spec: spec/state/pa-sp-printed-resident-credit.yaml.
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { calculatePANonresidentReturn } from "@/engine/state/pa-nonresident-orchestrator.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

/** Fixed fictional arithmetic records; no actual guided/source eligibility claim. */
function input() {
  const original = structuredClone(simpleW2Fixture);
  const wage = original.w2s[0];
  if (!wage) throw new Error("Independent source fixture requires its original wage");
  return TaxYearInputSchema.parse({
    ...original,
    taxpayer: { ...original.taxpayer, taxYear: 2025, filingStatus: "married_filing_jointly",
      spouse: { firstName: "Fictional", lastName: "Printed", ssn: "900-70-0412", dateOfBirth: "1986-01-01" },
      dependents: [],
    },
    w2s: [{ ...wage, wages: "14000", state: "PA", stateWages: "14000", stateTaxWithheld: "430" }],
  });
}

const cases = [["80.49", "80", "210"], ["80.50", "81", "209"], ["80.51", "81", "209"]] as const;
function credit(paid: string) {
  return { stateCode: "NY", incomeClass: "compensation" as const,
    incomeTaxableByBothStates: new Decimal("5000"), taxPaidToOtherState: new Decimal(paid) };
}

describe("independent printed SP resident-credit carry", () => {
  it.each(cases)("resident carries the printed credit for actual cents %s", (paid, printed, forgiveness) => {
    const original = input(), before = JSON.stringify(original);
    const result = calculatePAReturn(original, { otherStateCredits: [credit(paid)] });
    expect.soft(result.pa40.taxLiability.toFixed()).toBe("430");
    expect.soft(result.scheduleGL.totalCredit.toFixed()).toBe(new Decimal(paid).toFixed());
    expect.soft(result.pa40.residentCredit.toFixed()).toBe(printed);
    expect.soft(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe(printed);
    expect.soft(result.scheduleSP.forgivenessPercentage.toFixed()).toBe("60");
    expect.soft(result.pa40.taxForgivenessCredit.toFixed()).toBe(forgiveness);
    expect.soft(JSON.stringify(original)).toBe(before);
  });
  it.each(cases)("part-year carries the printed credit for actual cents %s", (paid, printed, forgiveness) => {
    const original = input(), before = JSON.stringify(original);
    const result = calculatePANonresidentReturn(original, { residencyStatus: "part_year",
      paTaxableCompensation: new Decimal("14000"), otherStateCredits: [credit(paid)] });
    expect.soft(result.pa40.taxLiability.toFixed()).toBe("430");
    expect.soft(result.scheduleGL.totalCredit.toFixed()).toBe(new Decimal(paid).toFixed());
    expect.soft(result.pa40.residentCredit.toFixed()).toBe(printed);
    expect.soft(result.scheduleSP.taxPaidToOtherStates.toFixed()).toBe(printed);
    expect.soft(result.scheduleSP.forgivenessPercentage.toFixed()).toBe("60");
    expect.soft(result.pa40.taxForgivenessCredit.toFixed()).toBe(forgiveness);
    expect.soft(JSON.stringify(original)).toBe(before);
  });
});
