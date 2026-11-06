/**
 * Confidence tier classification for state tax returns.
 *
 * Determines whether a state return was produced by a dedicated spec-driven
 * engine, the generic best-effort engine, or is not applicable (no income tax).
 */

export type ConfidenceTier = "dedicated" | "best-effort" | "not-applicable";

/** States with dedicated implementations; this is not a qualification claim. */
const DEDICATED_STATES = new Set(["CA", "NY", "NJ", "IL", "PA", "OH"]);

/**
 * States with no general income tax.
 * This classification does not establish the absence of filing obligations.
 * WA has a capital gains excise tax only.
 */
const NO_INCOME_TAX_STATES = new Set([
  "AK",
  "FL",
  "NV",
  "NH",
  "SD",
  "TN",
  "TX",
  "WA",
  "WY",
]);

export interface ConfidenceTierInfo {
  tier: ConfidenceTier;
  label: string;
  description: string;
  disclaimer: string | null;
  missingCreditsNote: string | null;
}

const DEDICATED_INFO: ConfidenceTierInfo = {
  tier: "dedicated",
  label: "State preview — unqualified",
  description:
    "This state has a dedicated implementation, but this preview and its form mappings are not qualified for filing.",
  disclaimer: null,
  missingCreditsNote: null,
};

const BEST_EFFORT_INFO: ConfidenceTierInfo = {
  tier: "best-effort",
  label: "Draft — estimate using published rates",
  description:
    "Experimental estimate using published rates. It is not qualified for filing.",
  disclaimer:
    "This state return was calculated using published tax rates and standard deductions. It may not include all state-specific credits or adjustments. You could be eligible for additional credits that would reduce your tax. Review your state’s official instructions before filing.",
  missingCreditsNote:
    "Your state may offer additional credits not included in this draft (e.g., earned income credit, property tax credit, child care credit). Check your state’s tax authority website.",
};

const NOT_APPLICABLE_INFO: ConfidenceTierInfo = {
  tier: "not-applicable",
  label: "No general income tax",
  description: "This state does not levy a general income tax.",
  disclaimer: null,
  missingCreditsNote: null,
};

/**
 * Returns the confidence tier for a given two-letter state code.
 * State code is normalized to uppercase.
 */
export function getConfidenceTier(stateCode: string): ConfidenceTier {
  const code = stateCode.toUpperCase();
  if (DEDICATED_STATES.has(code)) return "dedicated";
  if (NO_INCOME_TAX_STATES.has(code)) return "not-applicable";
  return "best-effort";
}

/**
 * Returns full confidence tier info (label, description, disclaimer)
 * for a given two-letter state code.
 */
export function getConfidenceTierInfo(stateCode: string): ConfidenceTierInfo {
  const tier = getConfidenceTier(stateCode);
  switch (tier) {
    case "dedicated":
      return DEDICATED_INFO;
    case "not-applicable":
      return NOT_APPLICABLE_INFO;
    case "best-effort":
      return BEST_EFFORT_INFO;
  }
}

/** Returns true if the state has a dedicated engine. */
export function isDedicatedState(stateCode: string): boolean {
  return getConfidenceTier(stateCode) === "dedicated";
}

/** Returns true if the state uses the draft estimate engine. */
export function isBestEffortState(stateCode: string): boolean {
  return getConfidenceTier(stateCode) === "best-effort";
}

/** Returns true if the state has no general income tax. */
export function isNoIncomeTaxState(stateCode: string): boolean {
  return getConfidenceTier(stateCode) === "not-applicable";
}

/** All dedicated state codes. */
export const DEDICATED_STATE_CODES = [...DEDICATED_STATES] as const;

/** All no-income-tax state codes. */
export const NO_INCOME_TAX_STATE_CODES = [...NO_INCOME_TAX_STATES] as const;
