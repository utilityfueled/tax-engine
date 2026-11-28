export const HOUSEHOLD_TAX_IDENTIFIER_CONFLICT = "This taxpayer identifier is already used for another person on this return.";

/** Report later occurrences without exposing the original taxpayer identifiers. */
export function duplicateHouseholdTaxIdentifierIndexes(identifiers: readonly (string | undefined)[]): number[] {
  const seen = new Set<string>();
  return identifiers.flatMap((value, index) => {
    const identifier = value?.trim();
    if (!identifier || !/^\d{3}-?\d{2}-?\d{4}$/.test(identifier)) return [];
    const digits = identifier.replaceAll("-", "");
    if (digits === "000000000") return [];
    if (seen.has(digits)) return [index];
    seen.add(digits);
    return [];
  });
}

export function duplicate2026ReturnTaxIdentifierIndexes(taxpayer: {
  taxYear: number;
  filingStatus: string;
  primary: { ssn: string };
  spouse?: { ssn: string };
  dependents: readonly { ssn: string }[];
}): number[] {
  if (taxpayer.taxYear !== 2026) return [];
  const married = taxpayer.filingStatus === "married_filing_jointly" || taxpayer.filingStatus === "married_filing_separately";
  return duplicateHouseholdTaxIdentifierIndexes([
    taxpayer.primary.ssn, married ? taxpayer.spouse?.ssn : undefined, ...taxpayer.dependents.map(person => person.ssn),
  ]);
}
