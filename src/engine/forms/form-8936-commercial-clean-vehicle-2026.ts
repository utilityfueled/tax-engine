/** Private tentative §45W calculation for source-backed 2026 road BEVs. */
import Decimal from "decimal.js";
import { z } from "zod";
import { CommercialCleanVehicle2026SourceSchema, type CommercialCleanVehicle2026Source } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

const FIRST_ELIGIBLE_ACQUISITION_DATE = "2023-01-01";
const LAST_ELIGIBLE_ACQUISITION_DATE = "2025-09-30";
const FORM = "Form 8936 Schedule A";
const normalizedVin = (vin: string) => vin.trim().toUpperCase();

interface CommercialCleanVehicleCreditInput {
  taxYear: number;
  vehicles: readonly CommercialCleanVehicle2026Source[];
  otherClaimVins?: readonly string[];
}

interface CommercialCleanVehicleCreditResult {
  tentativeCredit: Decimal;
  lines: CalculatedLine[];
}

export function calculateCommercialCleanVehicleCredit2026(input: CommercialCleanVehicleCreditInput): CommercialCleanVehicleCreditResult {
  if (input.taxYear !== 2026) throw new Error("Commercial clean vehicle original facts require the 2026 return year.");
  const parsed = z.array(CommercialCleanVehicle2026SourceSchema).safeParse(input.vehicles);
  if (!parsed.success) throw new Error("Commercial clean vehicle original source facts are incomplete, inconsistent, or outside the supported computation.");

  const seenVins = new Set(input.otherClaimVins?.map(normalizedVin));
  const audit = new AuditTrail();
  let tentativeCredit = d(0);
  for (const vehicle of parsed.data) {
    const vin = normalizedVin(vehicle.vin);
    if (seenVins.has(vin)) throw new Error("Use a distinct VIN for each vehicle claimed in the return.");
    seenVins.add(vin);

    const acquisitionDate = vehicle.bindingContractDate > vehicle.paymentDate ? vehicle.bindingContractDate : vehicle.paymentDate;
    const timely = acquisitionDate >= FIRST_ELIGIBLE_ACQUISITION_DATE && acquisitionDate <= LAST_ELIGIBLE_ACQUISITION_DATE;
    audit.record(FORM, "acquisition-and-service", "Qualifying acquisition and possession dates", d(timely ? 1 : 0),
      "Acquired January 1, 2023 through September 30, 2025, with possession in 2026");
    const basisPercentage = d(vehicle.taxBasis).times("0.30");
    const incrementalCost = Decimal.max(d(vehicle.purchasePrice).minus(vehicle.comparableVehiclePrice), 0);
    const tentativeVehicleCredit = timely ? Decimal.min(basisPercentage, incrementalCost, 7500) : d(0);
    audit.record(FORM, "tentative-per-vehicle", "Tentative commercial clean vehicle credit", tentativeVehicleCredit,
      "Timely acquisition: smaller of 30% of basis, positive incremental cost, or $7,500", {
        "30% of actual basis": basisPercentage,
        "Positive incremental cost": incrementalCost,
      });
    tentativeCredit = tentativeCredit.plus(tentativeVehicleCredit);
  }

  audit.record(FORM, "total-tentative-commercial-credit", "Total tentative commercial clean vehicle credit", tentativeCredit,
    "Sum for distinct qualifying vehicles before the Form 3800 limitation");
  return { tentativeCredit, lines: audit.getLines() };
}
