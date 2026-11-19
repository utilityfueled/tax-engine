const qualifyingRelativeLabels = new Set([
  "parent",
  "mother",
  "father",
  "grandparent",
  "grand parent",
  "grandmother",
  "grandfather",
  "parent or grandparent",
  "other qualifying relative",
]);

/** Match explicit parent, grandparent, and other qualifying relative labels. */
export function isQualifyingRelativeCategory(relationship: string): boolean {
  const normalized = relationship.trim().toLowerCase().replace(/\s+/g, " ");
  return relationship === "other" || qualifyingRelativeLabels.has(normalized);
}
