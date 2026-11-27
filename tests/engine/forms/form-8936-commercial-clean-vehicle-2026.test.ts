// Spec: spec/federal/form-8936-commercial-clean-vehicle-2026.yaml
import { expect, it } from "vitest";
import { calculateCommercialCleanVehicleCredit2026 } from "@/engine/forms/form-8936-commercial-clean-vehicle-2026.js";
import type { CommercialCleanVehicle2026Source } from "@/models/inputs.js";
import { Form8936Schema } from "@/models/inputs.js";
import { commercialCleanVehicle2026Source as source } from "../../fixtures/form-8936-commercial-clean-vehicle.js";

const compute = (vehicle: CommercialCleanVehicle2026Source) => {
  return calculateCommercialCleanVehicleCredit2026({ taxYear: 2026, vehicles: [vehicle] }).tentativeCredit.toFixed();
};

it("keeps explicit commercial originals in the canonical Form 8936 shape", () => {
  const parsed = Form8936Schema.parse(JSON.parse(JSON.stringify({ commercialCleanVehicles: [source] })));
  expect(parsed).toHaveProperty("commercialCleanVehicles", [source]);
  expect(Form8936Schema.parse({})).not.toHaveProperty("commercialCleanVehicles");
});

it("computes the smallest statutory amount from original inputs without rounding", () => {
  expect(compute(source)).toBe("6000");
  expect(compute({ ...source, taxBasis: "10001.01" })).toBe("3000.303");
  expect(compute({ ...source, purchasePrice: "30000", taxBasis: "29500" })).toBe("7500");
  expect(compute({ ...source, comparableVehiclePrice: "24999.99" })).toBe("0.01");
  expect(compute({ ...source, comparableVehiclePrice: "25000" })).toBe("0");
  expect(compute({ ...source, comparableVehiclePrice: "26000" })).toBe("0");
});

it("distinguishes timely, late, and inconsistent original dates", () => {
  expect(compute({ ...source, bindingContractDate: "2022-12-31", paymentDate: "2022-12-31" })).toBe("0");
  expect(compute({ ...source, bindingContractDate: "2022-12-31", paymentDate: "2023-01-01" })).toBe("6000");
  expect(compute({ ...source, bindingContractDate: "2023-01-01", paymentDate: "2022-12-31" })).toBe("6000");
  expect(compute({ ...source, bindingContractDate: "2025-09-29" })).toBe("6000");
  expect(compute({ ...source, paymentDate: "2025-09-29" })).toBe("6000");
  expect(compute({ ...source, bindingContractDate: "2025-10-01" })).toBe("0");
  expect(compute({ ...source, paymentDate: "2025-10-01" })).toBe("0");
  expect(() => compute({ ...source, bindingContractDate: "2025-09-31" })).toThrow(/source facts/u);
  expect(() => compute({ ...source, paymentDate: "2026-02-02" })).toThrow(/source facts/u);
  expect(() => compute({ ...source, datePlacedInService: "2025-12-31" })).toThrow(/source facts/u);
  expect(() => calculateCommercialCleanVehicleCredit2026({ taxYear: 2025, vehicles: [source] })).toThrow(/2026/u);
});

it("aggregates distinct sources through canonical serialization and holds repeated VINs", () => {
  const second = { ...source, vin: "1M8GDM9AXKP042788", comparableVehiclePrice: "22000.50" };
  const parsed = Form8936Schema.parse(JSON.parse(JSON.stringify({ commercialCleanVehicles: [source, second] })));
  const result = calculateCommercialCleanVehicleCredit2026({ taxYear: 2026, vehicles: parsed.commercialCleanVehicles ?? [] });
  expect(result.tentativeCredit.toFixed()).toBe("8999.5");
  expect(result.lines.filter(line => line.line === "tentative-per-vehicle").map(line => line.value.toFixed())).toEqual(["6000", "2999.5"]);
  expect(JSON.stringify(result.lines)).not.toMatch(/1HGCM82633A004352|1M8GDM9AXKP042788|Vehicle invoice|payment receipt|gasoline vehicle price source/u);

  const equivalentVin = { ...second, vin: ` ${source.vin.toLowerCase()} ` };
  expect(() => calculateCommercialCleanVehicleCredit2026({ taxYear: 2026, vehicles: [source, equivalentVin] })).toThrow(/distinct VIN/u);
  expect(() => calculateCommercialCleanVehicleCredit2026({ taxYear: 2026, vehicles: [source], otherClaimVins: [equivalentVin.vin] })).toThrow(/distinct VIN/u);
});

it("holds unknown or unsupported original facts instead of applying defaults", () => {
  const { paymentReference: _missing, ...withoutPaymentRecord } = source;
  for (const incomplete of [withoutPaymentRecord, { ...source, section179Expense: "0.01" }, { ...source, grossVehicleWeightRatingPounds: 14000 },
    { ...source, batteryCapacityKwh: 6.999 }, { ...source, batteryElectricOnlyConfirmed: false }, { ...source, owner: "spouse" },
    { ...source, priorSection30DOr45WClaimed: true }, { ...source, purchasePrice: "-1" }, { ...source, taxBasis: "100.001" },
    { ...source, comparableVehiclePriceReference: "   " }, { ...source, soleProprietorBusinessUseOnlyConfirmed: false },
    { ...source, vehiclePaymentMadeConfirmed: false }, { ...source, motorVehicleUnderCleanAirActTitleIIConfirmed: false }]) {
    expect(Form8936Schema.safeParse({ commercialCleanVehicles: [incomplete] }).success).toBe(false);
    expect(() => compute(incomplete as CommercialCleanVehicle2026Source)).toThrow(/source facts/u);
  }
});
