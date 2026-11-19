/** Explicit application categories for parents, grandparents, and other qualifying relatives. */
export function isQualifyingRelativeCategory(relationship: string): boolean {
  return relationship === "parent" || relationship === "other";
}
