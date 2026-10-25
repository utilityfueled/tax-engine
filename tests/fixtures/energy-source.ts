/** Explicit synthetic installation facts, never production defaults. */
export const energyHome = {
  id: "home-a", owner: "primary" as const,
  address: { street: "12 Installation Way", unit: "", city: "Denver", state: "CO", zip: "80203" },
  locatedInUnitedStates: true, usedAsResidence: true, mainHomeFor: "primary" as const,
  ownedByTaxpayer: true, jointOccupancyWithOtherReturn: false,
};
export const sourceImprovement = {
  sourceId: "door-a", homeId: "home-a", category: "exterior_door" as const,
  qualifiedCost: "1000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true,
  manufacturerQualifiedId: "A1B2", originalUseByTaxpayer: true, expectedFiveYearUse: true,
  newConstruction: false, associationCostShare: false,
};
export const sourceCleanProperty = {
  sourceId: "solar-a", homeId: "home-a", category: "solar_electric" as const,
  qualifiedCost: "10000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true,
  associationCostShare: false,
};
export const energySource = {
  sourceFactsConfirmed: true, homes: [energyHome], residenceEligibilityConfirmed: true,
  qualifiedImprovements: [sourceImprovement], cleanEnergyProperties: [sourceCleanProperty],
  priorYearCarryforward: "0", carryforwardConfirmed: true, carryforwardSourceTaxYear: 2024,
};
