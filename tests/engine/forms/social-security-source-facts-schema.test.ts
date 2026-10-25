// Spec: spec/federal/social-security-source-facts.yaml
import { expect, it } from "vitest";
import { SocialSecurityFactsSchema } from "@/models/inputs";

it("preserves unknown versus zero Social Security possession exclusion facts", () => {
  expect(SocialSecurityFactsSchema.parse({})).toEqual({});
  expect(SocialSecurityFactsSchema.parse({ puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0.10", sourceFactsConfirmed: false })).toEqual({ puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0.10", sourceFactsConfirmed: false });
  for (const value of ["-0.01", "NaN", "Infinity", "invalid"]) expect(SocialSecurityFactsSchema.safeParse({ puertoRicoIncomeExclusion: value }).success).toBe(false);
});
