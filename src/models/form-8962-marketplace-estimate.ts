/** Resolve the Marketplace disclosure without inferring intent from a saved negative accuracy answer. */
export function resolveMarketplaceInformationDisregard(facts: {
  marketplaceIncorrectInformationWithDisregard?: boolean | null;
  marketplaceInformationAccurate?: boolean | null;
}): boolean | undefined {
  const { marketplaceIncorrectInformationWithDisregard, marketplaceInformationAccurate } = facts;
  if (marketplaceIncorrectInformationWithDisregard === true && marketplaceInformationAccurate === true) {
    throw new Error("The Marketplace disregard answer conflicts with the confirmed accuracy answer.");
  }
  if (typeof marketplaceIncorrectInformationWithDisregard === "boolean") return marketplaceIncorrectInformationWithDisregard;
  if (marketplaceInformationAccurate === true) return false;
  return undefined;
}
