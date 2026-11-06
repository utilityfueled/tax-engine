/** Spec: state/pa-orchestrator.yaml#wptc-private-review-context. Public pre-I/O controls. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { preparePAWorkingCreditReview } from "@/pdf/pa-working-credit-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import * as pdfUtils from "@/pdf/pdf-utils.js";
import { fictionalEmptyEicHistory } from "../fixtures/eic-disallowance.js";

function original(): TaxYearInput {
  // Explicit synthetic complete sources for the separately pinned19k/433 original.
  const input: TaxYearInput = { taxpayer: { taxYear: 2025, filingStatus: "head_of_household", stateResidency: "full-year",
    primary: { firstName: "Avery", lastName: "PublicSource", ssn: "900-70-0411", dateOfBirth: "1990-01-01", usResidencyMonths: 12, employmentValidSsnIssuedByDueDate: true },
    address: { street: "1 Fictional Road", city: "Harrisburg", state: "PA", zip: "17101" },
    dependents: [{ firstName: "Casey", lastName: "PublicSource", ssn: "900-70-0413", relationship: "child", dateOfBirth: "2017-06-01", monthsLivedWithYou: 12, qualifiesForCTC: true, ctcSsnEligible: true, qualifiesForODC: false, qualifiesForEIC: true }] },
    w2s: [{ taxYear: 2025, accountHolder: "primary", employer: { name: "Actual Synthetic Employer", ein: "99-1234567" }, wages: "19000", federalWithheld: "0", stateWages: "19000", stateTaxWithheld: "583", state: "PA" }],
    eic: { claimantEligibility: { sourceTaxYear: 2025, sourceReference: "private-public-entry-claimant-original", sourceFactsConfirmed: true, primaryNonresidentAlienDuringYear: false, primaryQualifyingChildOfAnotherTaxpayer: false }, primaryIsFullTimeStudent: false },
    form1099Int: [], form1099Div: [], form1099B: [], form1099Nec: [], form1099Misc: [], form1099G: [], formW2G: [], form1099K: [], form1099C: [], scheduleK1: [], form1098: [], form1095A: [], donations: [], rentalProperties: [], savingsBondRedemptions: [], form6252: [], form8814: [], homeSales: [] };
  if (!input.eic) throw new Error("Synthetic claimant sources missing");
  input.eic.disallowanceSources = fictionalEmptyEicHistory(input.taxpayer);
  return input;
}
function retained(input: TaxYearInput): TaxReturnResult {
  return { ...calculateFederalTax(input), stateReturns: { pennsylvania: calculatePAReturn(input) } };
}
const options = { blankFormsDir: "forms/blank/2025", outputDir: "missing-public-entry-output" };
afterEach(() => vi.restoreAllMocks());

describe("PA working-credit public packet source admission", () => {
  it("rejects each stripped and all-stripped retained WPTC markers before any federal template IO", async () => {
    const input = original();
    const spy = vi.spyOn(pdfUtils, "loadReviewTemplate").mockRejectedValue(new Error("unexpected template IO"));
    const fields = ["workingPennsylvaniansTaxCredit", "workingCreditSourceCommitment", "workingCreditProcessing"];
    for (const removed of [...fields.map(field => [field]), fields]) {
      const result = retained(input);
      const state = result.stateReturns?.pennsylvania;
      if (!state) throw new Error("Synthetic PA state missing");
      for (const field of removed) delete (state as unknown as Record<string, unknown>)[field];
      await expect(fillReturn(input, result, options)).rejects.toThrow(/WPTC.*(source|credit|commitment|processing|retained)/i);
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("rejects equal-dollar changed originals with both old and freshly prepared tokens before IO", async () => {
    const input = original(); const saved = retained(input); const oldToken = preparePAWorkingCreditReview(input);
    const changed = original();
    const wage = changed.w2s[0]; if (!wage) throw new Error("Synthetic wage original missing");
    wage.employer.name = "Changed Equal-Dollar Original";
    const spy = vi.spyOn(pdfUtils, "loadReviewTemplate").mockRejectedValue(new Error("unexpected template IO"));
    for (const token of [oldToken, preparePAWorkingCreditReview(changed)]) {
      const withReview = { ...options, paWorkingCreditReview: token };
      await expect(fillReturn(redactReviewIdentifiers(changed), saved, withReview)).rejects.toThrow(/WPTC.*(source|stale|reconcile|commitment)/i);
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("admits an exact original-prepared redacted source through preflight to the first template boundary", async () => {
    const input = original(); const result = retained(input);
    const state = result.stateReturns?.pennsylvania;
    if (!state || !("workingPennsylvaniansTaxCredit" in state)) throw new Error("Synthetic actual WPTC missing");
    expect(state.workingPennsylvaniansTaxCredit?.credit.toFixed(0)).toBe("433");
    expect(state.pa40.refundableCredits.toFixed(0)).toBe("0");
    const spy = vi.spyOn(pdfUtils, "loadReviewTemplate").mockRejectedValue(new Error("exact-source-template-boundary"));
    const withReview = { ...options, paWorkingCreditReview: preparePAWorkingCreditReview(input) };
    await expect(fillReturn(redactReviewIdentifiers(input), redactReviewIdentifiers(result), withReview)).rejects.toThrow("exact-source-template-boundary");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
