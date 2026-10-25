/** Actual installation and allocation sources. Spec:spec/federal/form-5695-source.yaml. */
import Decimal from "decimal.js";
import type { EnergyCredits } from "@/models/inputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { d } from "@/utils/decimal.js";

type Home = NonNullable<EnergyCredits["homes"]>[number];
type Improvement = NonNullable<EnergyCredits["qualifiedImprovements"]>[number];
type CleanProperty = NonNullable<EnergyCredits["cleanEnergyProperties"]>[number];
export type ResolvedEnergyImprovement = Improvement & { sourceId: string; homeId: string; home: Home; eligible: boolean; allOccupantsCost: Decimal; effectiveDate: string };
export type ResolvedCleanEnergyProperty = CleanProperty & { sourceId: string; homeId: string; home: Home; eligible: boolean; allOccupantsCost: Decimal; effectiveDate: string; allocatedCost: Decimal };
export interface EnergySourceFactsResult {
  homes: Home[];
  separateSpousalMainHomes: boolean;
  improvements: ResolvedEnergyImprovement[];
  cleanProperties: ResolvedCleanEnergyProperty[];
}
const envelope = new Set(["insulation", "exterior_door", "windows_skylights"]);
export const ENERGY_PANEL_CODES = Object.freeze({ windows_skylights: "A", central_ac: "B", gas_water_heater: "C", furnace_boiler: "D", heat_pump: "E", heat_pump_water_heater: "F", biomass: "G" });
function known(value: boolean | undefined, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Energy source requires the actual ${name} answer`);
  return value;
}
function amount(value: string | undefined, name: string): Decimal {
  if (value === undefined || !value.trim()) throw new Error(`Energy source requires actual ${name}`);
  const result = d(value);
  if (!result.isFinite() || result.isNegative()) throw new Error(`Energy source ${name} must be finite and nonnegative`);
  return result;
}
function actualDate(value: string | undefined, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Energy source requires an actual ${name} date`);
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Energy source ${name} date is invalid`);
  return value;
}

export function calculateEnergySourceFacts(source: Partial<EnergyCredits>, options: { taxYear: number; filingStatus?: FilingStatus }): EnergySourceFactsResult {
  if (source.sourceFactsConfirmed !== true || !Array.isArray(source.homes)) throw new Error("Energy sources require confirmed actual home and property facts");
  if (!Array.isArray(source.qualifiedImprovements) || !Array.isArray(source.cleanEnergyProperties)) throw new Error("Energy sources require both actual property arrays, including explicit empty arrays");
  if (typeof source.residenceEligibilityConfirmed !== "boolean") throw new Error("Energy sources require actual residence eligibility");
  amount(source.priorYearCarryforward, "prior-year carryforward");
  if (source.carryforwardConfirmed !== true || source.carryforwardSourceTaxYear !== options.taxYear - 1) throw new Error("Energy source requires confirmed actual immediate-prior-year carryforward, including zero");
  const homes = source.homes;
  const homeMap = new Map<string, Home>();
  for (const home of homes) {
    if (!home.id?.trim() || homeMap.has(home.id)) throw new Error("Energy home source IDs must be unique and nonempty");
    if (!home.address || [home.address.street, home.address.city, home.address.state, home.address.zip].some(value => !value?.trim())) throw new Error("Energy source requires the actual installation home address");
    if (!home.owner || !home.mainHomeFor) throw new Error("Energy source requires actual home owner and main-home status");
    known(home.locatedInUnitedStates, "United States residence"); known(home.usedAsResidence, "residence use");
    known(home.ownedByTaxpayer, "home ownership"); known(home.jointOccupancyWithOtherReturn, "joint occupancy");
    if (home.jointOccupancyWithOtherReturn && home.allOccupantCostsComplete !== true) throw new Error("Energy joint occupancy requires complete actual costs of all occupants");
    if (home.mainHomeStartDate !== undefined || home.mainHomeEndDate !== undefined) {
      const start = actualDate(home.mainHomeStartDate, "main-home start"); const end = actualDate(home.mainHomeEndDate, "main-home end");
      if (start > end) throw new Error("Energy main-home dates are reversed");
    }
    homeMap.set(home.id, home);
  }
  for (const owner of ["primary", "spouse"] as const) {
    const mainHomes = homes.filter(home => home.mainHomeFor === owner || home.mainHomeFor === "both");
    if (mainHomes.length > 1) {
      const periods = mainHomes.map(home => ({ start: actualDate(home.mainHomeStartDate, "main-home start"), end: actualDate(home.mainHomeEndDate, "main-home end") })).sort((a, b) => a.start.localeCompare(b.start));
      if (periods.some((period, index) => index > 0 && period.start <= periods[index - 1].end)) throw new Error("Energy source cannot claim overlapping main homes for one person");
    }
  }
  const separateSpousalMainHomes = source.separateSpousalMainHomes === true;
  if (separateSpousalMainHomes) {
    if (options.filingStatus !== "married_filing_jointly") throw new Error("Separate spousal main-home credit limits require the actual joint filing status");
    for (const owner of ["primary", "spouse"] as const) if (!homes.some(home => home.owner === owner && home.mainHomeFor === owner && home.ownedByTaxpayer && home.usedAsResidence)) throw new Error("Separate spousal main-home source ownership and occupancy must be established");
  }
  const ids = new Set<string>();
  function common<T extends Improvement | CleanProperty>(entry: T) {
    if (!entry.sourceId?.trim() || ids.has(entry.sourceId)) throw new Error("Energy property source IDs must be unique and nonempty");
    ids.add(entry.sourceId);
    const home = entry.homeId ? homeMap.get(entry.homeId) : undefined;
    if (!home || !entry.homeId) throw new Error("Energy property must identify its actual installation home source");
    const paid = amount(entry.qualifiedCost, "net qualified cost");
    const effectiveDate = actualDate(entry.installationCompletedDate, "installation completion");
    known(entry.qualificationConfirmed, "property qualification");
    const association = known(entry.associationCostShare, "association cost share");
    if (association) {
      const allocation = entry.associationAllocation;
      if (!allocation?.sourceReference?.trim()) throw new Error("Energy association share requires its actual allocation statement");
      const total = amount(allocation.totalQualifiedCost, "association eligible cost");
      const numerator = amount(allocation.numerator, "association share numerator");
      const denominator = amount(allocation.denominator, "association share denominator");
      if (denominator.isZero() || numerator.gt(denominator) || !paid.eq(total.times(numerator).div(denominator).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))) throw new Error("Energy association cost share does not reconcile to its actual allocation");
    } else if (entry.associationAllocation !== undefined) throw new Error("Energy association allocation contradicts the explicit no-share answer");
    const allOccupantsCost = home.jointOccupancyWithOtherReturn ? amount(entry.totalCostPaidByAllOccupants, "all-occupant cost") : paid;
    if (allOccupantsCost.lt(paid)) throw new Error("Energy all-occupant cost cannot be less than the taxpayer's cost");
    if (!home.jointOccupancyWithOtherReturn && entry.totalCostPaidByAllOccupants !== undefined && !amount(entry.totalCostPaidByAllOccupants, "all-occupant cost").eq(paid)) throw new Error("Energy occupant cost conflicts with the no-joint-occupancy answer");
    if (home.mainHomeFor === "spouse" && options.filingStatus === undefined) throw new Error("Energy spouse main-home sources require the actual filing status");
    const mainForReturn = home.mainHomeFor === "primary" || home.mainHomeFor === "both" || (home.mainHomeFor === "spouse" && options.filingStatus === "married_filing_jointly");
    const mainHome = mainForReturn && (home.mainHomeStartDate === undefined || (effectiveDate >= home.mainHomeStartDate && effectiveDate <= (home.mainHomeEndDate ?? "")));
    const residenceEligible = source.residenceEligibilityConfirmed === true && home.locatedInUnitedStates === true && home.usedAsResidence === true;
    return { ...entry, sourceId: entry.sourceId, homeId: entry.homeId, home, allOccupantsCost, effectiveDate, mainHome, eligible: residenceEligible && entry.qualificationConfirmed };
  }
  const improvements: ResolvedEnergyImprovement[] = source.qualifiedImprovements.map(entry => {
    const resolved = common(entry);
    if (resolved.eligible) {
      if (entry.category === "home_energy_audit") resolved.eligible = resolved.mainHome && known(entry.auditReportCertified, "certified written home-energy audit report");
      else {
        const original = known(entry.originalUseByTaxpayer, "original use");
        const construction = known(entry.newConstruction, "new construction");
        const fiveYears = envelope.has(entry.category) ? known(entry.expectedFiveYearUse, "expected five-year use") : true;
        resolved.eligible = original && !construction && fiveYears && (!envelope.has(entry.category) || (resolved.mainHome && resolved.home.ownedByTaxpayer === true));
      }
    }
    return resolved;
  });
  const improvementMap = new Map(improvements.map(entry => [entry.sourceId, entry]));
  const electedYears = new Map<string, string>();
  for (const entry of improvements.filter(item => item.category === "electrical_panel" && item.eligible)) {
    if (!Array.isArray(entry.enabledPropertyIds) || !entry.enabledPropertyIds.length || new Set(entry.enabledPropertyIds).size !== entry.enabledPropertyIds.length) throw new Error("Electrical panel requires distinct actual enabled property source IDs");
    const load = amount(entry.panelLoadAmps, "panel load capacity");
    const code = known(entry.panelCodeComplianceConfirmed, "panel code compliance");
    if (!code || load.lt(200)) { entry.eligible = false; continue; }
    let pairEligible = false;
    for (const id of entry.enabledPropertyIds) {
      const target = improvementMap.get(id);
      if (!target || target.homeId !== entry.homeId || !(target.category in ENERGY_PANEL_CODES)) throw new Error("Electrical panel enabled source must identify a supported property in the same home");
      if (!target.eligible) continue;
      const panelYear = Number(entry.installationCompletedDate.slice(0, 4));
      const targetYear = Number(target.installationCompletedDate.slice(0, 4));
      if (panelYear === targetYear && panelYear === options.taxYear) pairEligible = true;
      else if (Math.abs(panelYear - targetYear) === 1) {
        const elected = known(entry.consecutiveYearElection, "panel consecutive-year election");
        if (!elected || Math.max(panelYear, targetYear) !== options.taxYear) continue;
        for (const item of [entry, target]) {
          if (item.installationCompletedDate.startsWith(`${options.taxYear}-`)) continue;
          if (item.priorYearCreditClaimed !== false) throw new Error("Panel consecutive-year election requires actual confirmation that no prior-year credit was claimed for the shifted property");
          electedYears.set(item.sourceId, `${options.taxYear}-12-31`);
        }
        pairEligible = true;
      }
    }
    entry.eligible = entry.eligible && code && load.gte(200) && pairEligible;
  }
  for (const entry of improvements) {
    entry.effectiveDate = electedYears.get(entry.sourceId) ?? entry.effectiveDate;
    entry.eligible = entry.eligible && entry.effectiveDate.startsWith(`${options.taxYear}-`);
    if (entry.eligible && !["insulation", "home_energy_audit"].includes(entry.category) && !/^[a-z0-9]{4}$/i.test(entry.manufacturerQualifiedId ?? "")) throw new Error("Qualified energy source requires its actual four-character manufacturer ID");
  }
  const cleanProperties: ResolvedCleanEnergyProperty[] = source.cleanEnergyProperties.map(entry => {
    const resolved = common(entry);
    let allocatedCost = d(entry.qualifiedCost);
    if (resolved.eligible && entry.category === "battery") resolved.eligible = amount(entry.batteryKilowattHours, "battery capacity").gte(3);
    if (resolved.eligible && entry.category === "fuel_cell") {
      const capacity = amount(entry.fuelCellKilowattCapacity, "fuel-cell capacity");
      const halves = capacity.times(2).floor();
      resolved.eligible = resolved.mainHome && halves.gte(1);
      if (resolved.eligible && resolved.home.jointOccupancyWithOtherReturn && allocatedCost.gt(0)) {
        allocatedCost = Decimal.min(allocatedCost, halves.times(1667).times(allocatedCost).div(resolved.allOccupantsCost));
      }
    }
    resolved.eligible = resolved.eligible && resolved.effectiveDate.startsWith(`${options.taxYear}-`);
    return { ...resolved, allocatedCost };
  });
  return { homes, separateSpousalMainHomes, improvements, cleanProperties };
}
