// Spec: spec/federal/qof-disposition-facts.yaml.
import type { TaxYearInput } from "@/models/inputs.js";

/** Validate an actual Schedule D source answer without inferring it from gains. */
export function validateQofDispositionFacts(
  facts: TaxYearInput["qofDispositionFacts"],
  taxYear: number,
): false | undefined {
  if (facts === undefined) return undefined;
  if (facts.sourceTaxYear !== taxYear) throw new Error("QOF disposition sources require the actual return year.");
  if (!facts.sourceReference?.trim()) throw new Error("QOF disposition requires an actual investment source reference.");
  if (facts.sourceFactsConfirmed !== true || facts.allInvestmentsReviewed !== true) {
    throw new Error("QOF disposition requires confirmation of all actual investment sources after the last edit.");
  }
  if (typeof facts.disposedOfQofInvestment !== "boolean") throw new Error("The actual QOF disposition answer is unknown.");
  if (facts.disposedOfQofInvestment) {
    throw new Error("A QOF disposition requires the actual Form8997 PartIII history and Form8949 deferred-gain inclusion method, which are not yet supported.");
  }
  return false;
}
