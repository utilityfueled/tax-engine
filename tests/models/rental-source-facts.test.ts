// Spec: spec/federal/rental-source-facts.yaml, source-identity
import { expect, it } from "vitest";
import { RentalPropertySchema } from "@/models/inputs";

it("preserves actual rental source answers without creating missing qualification", () => {
  const parsed = RentalPropertySchema.parse({ description: "Actual property", rents: "0", accountHolder: "spouse", allInvestmentAtRisk: false, sourceFactsConfirmed: false, otherExpenseDescription: "Actual expense" });
  expect(parsed).toMatchObject({ rents: "0", accountHolder: "spouse", allInvestmentAtRisk: false, sourceFactsConfirmed: false, otherExpenseDescription: "Actual expense" });
  const unknown = RentalPropertySchema.parse({ description: "Actual property", rents: "0" });
  for (const field of ["accountHolder", "allInvestmentAtRisk", "sourceFactsConfirmed", "otherExpenseDescription"]) expect(unknown).not.toHaveProperty(field);
});
