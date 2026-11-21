// Spec: spec/federal/form-5329-hsa-timely-personal-original.yaml
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { hsaExcessSource, hsaOwnerInput } from "../fixtures/hsa-excess-owner.js";
function required<T>(value: T | null | undefined): T { if (value == null) throw new Error("Missing synthetic fixture"); return value; }
function fixture() {
  const base = hsaOwnerInput();
  const original = {
    contributionTaxYear: 2026, accountOwner: "primary", recipientFirstName: base.taxpayer.primary.firstName,
    recipientLastName: base.taxpayer.primary.lastName, recipientSsn: base.taxpayer.primary.ssn,
    contributionSourceReference: "Synthetic trustee contribution A", distributionSourceReference: "Synthetic trustee distribution A",
    payerTin: "12-3456789", accountReference: "HSA-A", contributionDate: "2026-02-01", receivedDate: "2026-12-15",
    originalPersonalContributions: "5000", returnedPrincipal: "600", postedGross: "625", postedEarnings: "25",
    hsaAccountConfirmed: true, personalContributionConfirmed: true, postedAndNotReversed: true, allAttributableIncomeReturned: true,
    ordinaryCalendarYearTaxpayer: true, noSpecialRelief: true, sourceFactsConfirmed: true, completePersonalContributionInventoryConfirmed: true, onlyCorrectionForOwner: true,
  };
  const source = { sourceReference: "Synthetic trustee distribution A", taxYear: 2026, recipientSsn: base.taxpayer.primary.ssn,
    payerTin: "12-3456789", accountReference: "HSA-A", payer: "Synthetic trustee", grossDistribution: "625", earningsOnExcessContributions: "25", trusteeToTrusteeTransfer: false, distributionCode: "2", accountHolder: "primary", accountType: "hsa" };
  const raw = { ...base, taxpayer: { ...base.taxpayer, taxYear: 2026 },
    form8889ByOwner: { primary: { ...base.form8889ByOwner?.primary, contributionsMade: "4400" }, spouse: { ...base.form8889ByOwner?.spouse, contributionsMade: "5000" } },
    form5329HsaByOwner: { primary: { ...hsaExcessSource({ sourceTaxYear: 2026, priorYearSourceTaxYear: 2025 }), timelyPersonalContributionReturn: original }, spouse: hsaExcessSource({ sourceTaxYear: 2026, priorYearSourceTaxYear: 2025 }) },
    form1099SA: [source],
  };
  return { raw, source, original };
}
it("reconciles actual original principal with net line2 before computing owner excess", () => {
  const { raw } = fixture();
  const result = calculateFederalTax(TaxYearInputSchema.parse(raw));
  const owner = result.form8889ByOwner?.primary;
  expect([owner?.line2.toString(), owner?.line13.toString(), owner?.line14a.toString(), owner?.line14b.toString(), owner?.line16.toString(), owner?.line17b.toString()]).toEqual(["4400", "4400", "625", "625", "0", "0"]);
  expect(result.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
  expect(result.form5329HsaByOwner?.primary?.requiresForm5329).toBe(false);
  expect(result.form5329HsaByOwner?.spouse?.line47.toString()).toBe("600");
  expect(result.form5329HsaByOwner?.spouse?.line49.toString()).toBe("36");
  expect(result.totalIncome.toString()).toBe("85025");
  const audit = JSON.stringify(result.allLines);
  for (const value of [raw.taxpayer.primary.ssn, raw.form5329HsaByOwner.primary.timelyPersonalContributionReturn.contributionSourceReference, "HSA-A"]) expect(audit).not.toContain(value);
  const partial = fixture();
  partial.original.returnedPrincipal = "300";
  partial.original.postedGross = partial.source.grossDistribution = "325";
  partial.raw.form8889ByOwner.primary.contributionsMade = "4700";
  const remaining = calculateFederalTax(TaxYearInputSchema.parse(partial.raw));
  expect(remaining.form5329HsaByOwner?.primary?.line47.toString()).toBe("300");
  expect(remaining.form5329HsaByOwner?.primary?.requiresForm5329).toBe(true);
  const prior = fixture();
  prior.raw.form5329HsaByOwner.primary.priorYearExcessContributions = "100";
  prior.raw.form5329HsaByOwner.primary.priorYearAdditionalTax = "6";
  expect(calculateFederalTax(TaxYearInputSchema.parse(prior.raw)).form5329HsaByOwner?.primary?.requiresForm5329).toBe(true);
});
it("preserves other owner employer excess and known zero earnings", () => {
  const { raw, source, original } = fixture();
  raw.form8889ByOwner.spouse.employerContributions = "5000";
  Object.assign(raw.form5329HsaByOwner.spouse, { excessEmployerContributionsAlreadyInWages: "0" });
  const employer = calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(employer.form5329HsaByOwner?.spouse?.line47.toString()).toBe("5600");
  expect(employer.form5329HsaByOwner?.spouse?.taxableExcessEmployerContributions.toString()).toBe("600");
  expect(employer.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
  raw.form8889ByOwner.primary.employerContributions = "5000";
  Object.assign(raw.form5329HsaByOwner.primary, { excessEmployerContributionsAlreadyInWages: "0" });
  const sameOwnerEmployer = calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(sameOwnerEmployer.form5329HsaByOwner?.primary?.line47.toString()).toBe("5000");
  expect(sameOwnerEmployer.form5329HsaByOwner?.primary?.requiresForm5329).toBe(true);
  expect(sameOwnerEmployer.form5329HsaByOwner?.primary?.taxableExcessEmployerContributions.toString()).toBe("600");
  source.earningsOnExcessContributions = original.postedEarnings = "0";
  source.grossDistribution = original.postedGross = "600";
  expect(calculateFederalTax(TaxYearInputSchema.parse(raw)).totalIncome.toString()).toBe("86200");
});
it("rejects missing mismatched or unqualified original allocation", () => {
  const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
    ...Object.keys(fixture().original).map(key => (f: ReturnType<typeof fixture>) => { delete (f.original as Record<string, unknown>)[key]; }),
    f => { f.original.accountOwner = "spouse"; }, f => { f.original.recipientSsn = "222-33-4444"; },
    f => { f.original.recipientFirstName = "Different"; }, f => { f.original.recipientLastName = "Different"; },
    f => { f.original.contributionTaxYear = 2025; }, f => { f.original.contributionDate = "2025-12-31"; },
    f => { f.original.receivedDate = "2027-01-01"; }, f => { f.original.receivedDate = "2026-01-01"; },
    f => { f.original.contributionDate = "2026-02-30"; },
    f => { f.raw.taxpayer.primary.dateOfBirth = "2026-12-20"; }, f => { f.original.returnedPrincipal = "599.99"; },
    f => { f.original.originalPersonalContributions = "4999.99"; }, f => { f.original.postedGross = "624.99"; },
    f => { f.original.postedEarnings = "24.99"; }, f => { f.original.sourceFactsConfirmed = false; },
    f => { f.source.trusteeToTrusteeTransfer = true; },
    f => { f.source.taxYear = 2025; }, f => { f.source.accountHolder = "spouse"; },
    f => { f.source.recipientSsn = "222-33-4444"; }, f => { f.source.sourceReference = "other"; },
    f => { f.source.payerTin = "98-7654321"; }, f => { f.source.accountReference = "other"; },
    f => { f.raw.form1099SA.push({ ...f.source }); }, f => { f.raw.form1099SA = []; },
    f => { required(f.raw.standardDeductionFacts).shortTaxYear = true; },
    f => { required(f.raw.standardDeductionFacts).primaryDeathDate = "2026-12-31"; },
    f => { f.original.noSpecialRelief = false; }, f => { f.original.postedAndNotReversed = false; },
    f => { f.original.allAttributableIncomeReturned = false; }, f => { f.original.personalContributionConfirmed = false; },
    // Exact net arithmetic alone cannot convert otherwise deductible personal dollars to a correction.
    f => { f.raw.form8889ByOwner.primary.contributionsMade = "4300"; f.original.returnedPrincipal = "700"; f.source.grossDistribution = f.original.postedGross = "725"; },

  ];
  for (const [index, change] of changes.entries()) { const f = fixture(); change(f); expect(() => calculateFederalTax(TaxYearInputSchema.parse(f.raw)), `control ${index}`).toThrow(); }
});
it("retains the legacy gross source path and unproven net hold", () => {
  const { raw } = fixture();
  delete (raw.form5329HsaByOwner.primary as { timelyPersonalContributionReturn?: unknown }).timelyPersonalContributionReturn;
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(raw))).toThrow(/timely correction exceeds/);
  raw.form8889ByOwner.primary.contributionsMade = "5000";
  const legacy = calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(legacy.form5329HsaByOwner?.primary?.line47.toString()).toBe("0");
  expect(legacy.form8889ByOwner?.primary?.line13.toString()).toBe("4400");
});

it("binds the same original packet to the actual spouse rather than the primary", () => {
  const { raw, source, original } = fixture();
  const spouse = required(raw.taxpayer.spouse);
  original.accountOwner = source.accountHolder = "spouse";
  original.recipientFirstName = spouse.firstName;
  original.recipientLastName = spouse.lastName;
  original.recipientSsn = source.recipientSsn = spouse.ssn;
  const primaryFacts = raw.form5329HsaByOwner.primary;
  delete (primaryFacts as { timelyPersonalContributionReturn?: unknown }).timelyPersonalContributionReturn;
  Object.assign(raw.form5329HsaByOwner.spouse, { timelyPersonalContributionReturn: original });
  raw.form8889ByOwner.primary.contributionsMade = "5000";
  raw.form8889ByOwner.spouse.contributionsMade = "4400";
  const result = calculateFederalTax(TaxYearInputSchema.parse(raw));
  expect(result.form5329HsaByOwner?.primary?.line47.toString()).toBe("600");
  expect(result.form5329HsaByOwner?.spouse?.line47.toString()).toBe("0");
  expect(result.form8889ByOwner?.spouse?.line2.toString()).toBe("4400");
  original.recipientSsn = raw.taxpayer.primary.ssn;
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(raw))).toThrow(/original allocation/);
});
it("does not reuse one original contribution or account across actual owners", () => {
  const f = fixture();
  const input = TaxYearInputSchema.parse(f.raw);
  const spouse = required(input.taxpayer.spouse);
  const primaryFacts = required(input.form5329HsaByOwner?.primary);
  const spouseFacts = required(input.form5329HsaByOwner?.spouse);
  const original = required(primaryFacts.timelyPersonalContributionReturn);
  const second = { ...original, accountOwner: "spouse" as const, recipientFirstName: spouse.firstName, recipientLastName: spouse.lastName, recipientSsn: spouse.ssn, accountReference: "HSA-B", contributionSourceReference: "Synthetic trustee contribution B", distributionSourceReference: "Synthetic trustee distribution B" };
  spouseFacts.timelyPersonalContributionReturn = second;
  required(input.form8889ByOwner?.spouse).contributionsMade = "4400";
  const secondSource = { ...required(input.form1099SA?.[0]), accountHolder: "spouse" as const, recipientSsn: spouse.ssn, accountReference: second.accountReference, sourceReference: second.distributionSourceReference };
  required(input.form1099SA).push(secondSource);
  expect(calculateFederalTax(input).form5329HsaByOwner?.spouse?.line47.toString()).toBe("0");
  second.contributionSourceReference = original.contributionSourceReference;
  expect(() => calculateFederalTax(input)).toThrow(/original.*identity|identity.*original/i);
  second.contributionSourceReference = "Synthetic trustee contribution B";
  second.accountReference = secondSource.accountReference = original.accountReference;
  expect(() => calculateFederalTax(input)).toThrow(/original.*identity|identity.*original/i);
});

it("rejects overbound and unsupported new path money and unknown extra owners", () => {
  const large = fixture();
  large.original.originalPersonalContributions = "1000000000000";
  large.original.returnedPrincipal = "999999995600";
  large.original.postedGross = large.source.grossDistribution = "999999995625";
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(large.raw))).toThrow(/original allocation/);
  for (const value of ["+600", "6e2", "600.000", " 600", "600 ", "-0", "9999999999999999999999999999999999999999"]) {
    const f = fixture(); f.original.returnedPrincipal = value;
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(f.raw)), value).toThrow();
  }
  for (const key of ["postedGross", "postedEarnings", "originalPersonalContributions"] as const) {
    const f = fixture(); f.original[key] += ".000";
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(f.raw)), key).toThrow();
  }
  for (const field of ["grossDistribution", "earningsOnExcessContributions"] as const) {
    const f = fixture(); f.source[field] += ".000";
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(f.raw)), field).toThrow(/original allocation/);
  }
  const net = fixture(); net.raw.form8889ByOwner.primary.contributionsMade = "4400.000";
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(net.raw))).toThrow(/original allocation/);
  const padded = fixture(); padded.source.grossDistribution = "0000000000625";
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(padded.raw))).toThrow(/original allocation/);
  const upper = fixture(); upper.original.originalPersonalContributions = "999999999999";
  upper.original.returnedPrincipal = "999999995599";
  upper.original.postedGross = upper.source.grossDistribution = "999999995624";
  expect(calculateFederalTax(TaxYearInputSchema.parse(upper.raw)).totalIncome.toString()).toBe("85025");
  const unknown = fixture();
  unknown.raw.form1099SA.push({ ...unknown.source, sourceReference: "Synthetic unknown owner", accountHolder: undefined } as unknown as typeof unknown.source);
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(unknown.raw))).toThrow(/actual.*owner/i);
});
it("holds unreconciled distribution overrides and additional owner modes", () => {
  for (const field of ["distributionsReceived", "excludedDistributions"] as const) {
    const f = fixture();
    Object.assign(f.raw.form8889ByOwner.primary, { [field]: "1000" });
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(f.raw)), field).toThrow(/original allocation/);
  }
  const mixed = fixture();
  mixed.raw.form1099SA.push({ ...mixed.source, sourceReference: "Synthetic ordinary source", distributionCode: "1", grossDistribution: "375", earningsOnExcessContributions: "0" });
  Object.assign(mixed.raw.form8889ByOwner.primary, { excludedDistributions: "1000" });
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(mixed.raw))).toThrow(/original allocation/);
  const exact = fixture();
  Object.assign(exact.raw.form8889ByOwner.primary, { distributionsReceived: "625", excludedDistributions: "625" });
  expect(calculateFederalTax(TaxYearInputSchema.parse(exact.raw)).totalIncome.toString()).toBe("85025");
});
