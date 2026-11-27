// Spec: spec/federal/form-3800-section45w-current-year-2026.yaml
import Decimal from "decimal.js";
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { parseInput } from "@/ingest/loader.js";
import { principalResidenceCodInput } from "../fixtures/cod-principal-residence.js";
import { marketplaceActualCashInput } from "../fixtures/marketplace-actual-cash.js";
import { section45WBasisOriginals, section45WDepreciationOriginals } from "../fixtures/section45w-first-year.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Test only the candidate calculation under the existing provisional constants.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const rounded = (value: Decimal) => value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

function actualReturn(position: "full" | "capped_passenger" | "filed_class_election" = "full", netProfit = "160000") {
  const capped = position === "capped_passenger";
  const vehicle = { ...section45WBasisOriginals.vehicle, grossVehicleWeightRatingPounds: position === "full" ? 7200 : 3200,
    ...(capped ? { purchasePrice: "30000.00", taxBasis: "30000.00", comparableVehiclePrice: "24000.00" } : {}) };
  const basis = { ...section45WBasisOriginals, vehicle, depreciationAsset: { ...section45WBasisOriginals.depreciationAsset,
    originalPreCreditBasis: capped ? "30000" : section45WBasisOriginals.depreciationAsset.originalPreCreditBasis } };
  const originals = section45WDepreciationOriginals(basis);
  const workpaper = {
    ...originals,
    depreciation: {
      ...originals.depreciation,
      classification: position === "full" ? { kind: "truck_or_van", grossVehicleWeightRatingPounds: 7200, manufacturerRecordReference: "Original work van weight" } : originals.depreciation.classification,
      bonus: position === "filed_class_election" ? { treatment: "elected_out", electionTaxYear: 2026, electionClass: "5_year",
        filedClassElectionConfirmed: true, decisionReference: "Actual 2026 five-year class election" } : originals.depreciation.bonus,
    },
  };
  const allowableDepreciation = position === "full" ? "19000" : position === "capped_passenger" ? "20300" : "3800";
  const adjustedBasis = position === "capped_passenger" ? "24000" : "19000";
  const primary = { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true };
  const { taxpayerReference, activityReference } = workpaper.basis.activity;
  const expenses = { advertising: "125.25", officeExpense: "40.25", supplies: "19.50" };
  const grossReceipts = new Decimal(netProfit).plus(allowableDepreciation).plus("185").toFixed(2);
  return {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary, taxYear: 2026 },
    w2s: [],
    form2210: {
      calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
      waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
      priorYearTaxStatus: "no-tax-liability", priorYearFullYear: true, priorYearResidentAllYear: true,
      priorYearTaxForForm2210: "0", priorYearTaxComputationConfirmed: true,
    },
    form8936: {
      commercialCleanVehicles: [vehicle],
      commercialCleanVehicleCurrentCredit: {
        taxYear: 2026,
        participation: { taxpayerReference, activityReference, originalRecordReference: "Actual 2026 participation log",
          actualHours: "654.25", actualOwnerHoursComparedAndConfirmed: true, noPassiveOrFormerPassiveActivityCreditsConfirmed: true },
        amtDepreciation: { taxpayerReference, activityReference, assetReference: workpaper.basis.depreciationAsset.originalRecordReference,
          originalRecordReference: "Actual 2026 AMT asset ledger", vin: vehicle.vin, placedInServiceDate: vehicle.datePlacedInService,
          regularAdjustedBasis: adjustedBasis, amtAdjustedBasis: adjustedBasis, qualifiedSection168PropertyAndEqualBasesConfirmed: true },
        creditInventory: { taxpayerReference, originalRecordReference: "Actual 2026 business credit inventory",
          noOtherCurrentPassiveOrCarryCreditsConfirmed: true, noPriorMinimumTaxCreditConfirmed: true },
      },
    },
    scheduleC: {
      accountHolder: "primary", accountingMethod: "cash", allInvestmentAtRisk: true, qbiMateriallyParticipated: true,
      grossReceipts, expenses, principalBusinessActivity: basis.activity.principalBusinessActivity, businessCode: basis.activity.businessCode,
      sourceFacts: {
        sourceTaxYear: 2026, sourceFactsConfirmed: true, sourceReference: basis.activity.originalRecordReference,
        accountHolder: "primary", ownerName: `${primary.firstName} ${primary.lastName}`, businessNameStatus: "blank_original", businessEINStatus: "not_issued",
        address: { method: "home_at_return_address", homeAtReturnAddressConfirmed: true, homeReturnAddress: simpleW2Fixture.taxpayer.address },
        section45WFirstYear: {
          workpaper,
          owner: { firstName: primary.firstName, lastName: primary.lastName, tin: primary.ssn, taxpayerReference,
            originalRecordReference: "Actual primary holder original", identityComparedToVehicleAndTaxReturnConfirmed: true },
          ledger: { originalRecordReference: "Actual annual cash receipts and expense ledger", activityReference, businessName: null, businessEin: null,
            grossReceipts, expenses, completeAndReconciledConfirmed: true, excludesVehicleCostsAndOtherActivitiesConfirmed: true },
        },
      },
    },
  };
}

it("uses actual post-depreciation tax and TMT for one fully usable Section 45W credit", () => {
  const earnings = new Decimal("160000").times("0.9235");
  const seTax = rounded(earnings.times("0.124")).plus(rounded(earnings.times("0.029")));
  const agi = new Decimal("160000").minus(rounded(seTax.div(2)));
  const beforeQbi = agi.minus("16100");
  const taxable = beforeQbi.minus(rounded(beforeQbi.times("0.20")));
  const regularTax = rounded(new Decimal("17966").plus(taxable.minus("105700").times("0.24")));
  const tmt = rounded(taxable.plus("16100").minus("90100").times("0.26"));
  const result = calculateFederalTax(parseInput(JSON.parse(JSON.stringify(actualReturn()))));
  expect(result.scheduleC?.netProfit.toFixed()).toBe("160000");
  expect(result.scheduleC?.depreciationAndSection179Deduction.toFixed()).toBe("19000");
  expect(result.selfEmploymentTax.eq(seTax)).toBe(true);
  expect(result.agi.eq(agi)).toBe(true);
  expect(result.taxableIncome.eq(taxable)).toBe(true);
  expect(result.ordinaryTax.eq(regularTax)).toBe(true);
  expect(result.form6251?.tentativeMinimumTax.eq(tmt) && tmt.gt(0)).toBe(true);
  expect(result.form6251?.depreciationAdjustment.isZero()).toBe(true);
  expect(result.form3800?.creditLimitation.eq(regularTax.minus(tmt))).toBe(true);
  expect(result.form3800?.currentYearCredit.toFixed()).toBe("6000");
  expect(result.form3800?.lines.find(row => row.line === "ordinary-section38-limitation")?.value.toFixed()).toBe("9716");
  expect(JSON.stringify(result.form3800)).not.toMatch(/Actual 2026 participation log|Original Schedule C|Original Form 4562|1HGCM82633A004352/u);
  expect(result.form3800?.carryforwardToNextYear.isZero()).toBe(true);
  expect(result.schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
  expect(result.totalTax.eq(regularTax.plus(seTax).minus("6000"))).toBe(true);
});

it("reduces the ordinary Section 38 limitation by earlier actual nonrefundable child credit", () => {
  const input = actualReturn();
  const result = calculateFederalTax(parseInput({ ...input,
    childTaxCredit: { possessionIncomeExclusion: "0", bonaFidePuertoRicoResident: false },
    taxpayer: { ...input.taxpayer, dependents: [{
    firstName: "Test", lastName: "Dependent", ssn: "123-45-6790", relationship: "child", dateOfBirth: "2016-01-01",
    monthsLivedWithYou: 12, qualifiesForCTC: true, ctcSsnEligible: true, qualifiesForEIC: false,
  }] } }));
  expect(result.childTaxCredit.toFixed()).toBe("2200");
  expect(result.form3800?.personalCredits.toFixed()).toBe("2200");
  expect(result.form3800?.creditLimitation.toFixed()).toBe("7516");
  expect(result.schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
});

it("holds separate filing for this direct credit regardless of available current tax", () => {
  const input = actualReturn();
  expect(() => calculateFederalTax(parseInput({ ...input,
    taxpayer: { ...input.taxpayer, filingStatus: "married_filing_separately" },
  }))).toThrow(/Single cash return/u);
});

function actualUnusedCreditReturn() {
  const input = actualReturn();
  const currentCredit = input.form8936.commercialCleanVehicleCurrentCredit;
  const priorYearCarryback = {
    taxYear: 2025, filingStatus: "single", taxpayerReference: currentCredit.creditInventory.taxpayerReference,
    filedReturnTaxpayerTin: input.taxpayer.primary.ssn,
    samePrimaryTaxpayerAndCalendarYearConfirmed: true,
    filedReturnReference: "Fictional filed 2025 return",
    filedReturnDate: "2026-04-15",
    section38LimitationReference: "Fictional 2025 Section 38 limitation worksheet",
    priorityCreditOrderingReference: "Fictional original 2025 credit ordering worksheet",
    section39CapacityVerifiedConfirmed: true, onlyOrdinarySection38PriorityCreditsConfirmed: true,
    excludesProposedCarrybackConfirmed: true,
    section38Limitation: "1400", section38CarryforwardAndCurrentCredits: "1000", earlierSourceYearCarrybacks: "0",
  };
  const dependent = {
    lastName: "Dependent", relationship: "child", dateOfBirth: "2016-01-01",
    monthsLivedWithYou: 12, qualifiesForCTC: true, ctcSsnEligible: true, qualifiesForEIC: false,
  };
  return {
    ...input,
    childTaxCredit: { possessionIncomeExclusion: "0", bonaFidePuertoRicoResident: false },
    taxpayer: { ...input.taxpayer, dependents: [
      { ...dependent, firstName: "First", ssn: "123-45-6790" },
      { ...dependent, firstName: "Second", ssn: "123-45-6791" },
    ] },
    form2210: { ...input.form2210, priorYearTaxStatus: "return-filed", priorYearJointReturn: false,
      priorYearTaxForForm2210: "3000", priorYearAgiForForm2210: "55000" },
    form8936: { ...input.form8936, commercialCleanVehicleCurrentCredit: { ...currentCredit, priorYearCarryback } },
  };
}

it("splits unused current credit after verified actual 2025 capacity", () => {
  const original = actualUnusedCreditReturn();
  const input = parseInput(JSON.parse(JSON.stringify(original)));
  const result = calculateFederalTax(input);
  expect(result.ordinaryTax.toFixed()).toBe("18056");
  expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe("8340");
  expect(result.childTaxCredit.toFixed()).toBe("4400");
  expect(result.form3800?.creditLimitation.toFixed()).toBe("5316");
  expect(result.form3800?.currentYearCredit.toFixed()).toBe("6000");
  expect(result.schedule3?.generalBusinessCredit.toFixed()).toBe("5316");
  expect(result.totalTax.toFixed()).toBe("30947");
  const lines = result.form3800?.lines;
  expect(lines?.find(line => line.line === "section45w-unused-2026")?.value.toFixed()).toBe("684");
  expect(lines?.find(line => line.line === "section45w-carryback-to-2025")?.value.toFixed()).toBe("400");
  expect(lines?.find(line => line.line === "section45w-potential-carryforward-to-2027")?.value.toFixed()).toBe("284");
  expect(result.form3800?.carryforwardToNextYear.toFixed()).toBe("284");
  expect(result.carryforwards.generalBusinessCredit.toFixed()).toBe("284");
  expect(JSON.stringify(lines)).not.toMatch(/Fictional filed|Fictional original|123-45/u);
});

it("uses actual prior-year filing only on or after the recorded date", () => {
  const original = actualUnusedCreditReturn();
  const { commercialCleanVehicleCurrentCredit: current } = original.form8936;
  const input = parseInput(original);
  expect(() => calculateFederalTax(input, { asOfDate: "2026-04-14" })).toThrow(/prior return filing date/u);
  expect(calculateFederalTax(input, { asOfDate: "2026-04-15" }).carryforwards.generalBusinessCredit.toFixed()).toBe("284");
  const replaceDate = (filedReturnDate: string | undefined) => ({ ...original, form8936: { ...original.form8936,
    commercialCleanVehicleCurrentCredit: { ...current, priorYearCarryback: { ...current.priorYearCarryback, filedReturnDate } },
  } });
  expect(() => calculateFederalTax(parseInput(replaceDate("2025-12-31")))).toThrow(/prior return filing date/u);
  expect(() => parseInput(replaceDate("2026-02-30"))).toThrow(/filedReturnDate/u);
  expect(() => parseInput(replaceDate(undefined))).toThrow(/filedReturnDate/u);
  const fullyUsed = calculateFederalTax(parseInput(actualReturn()), { asOfDate: "2026-04-14" });
  expect(fullyUsed.schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
});

it("holds carryback evidence that conflicts with the Form 8936 prior status", () => {
  const input = actualUnusedCreditReturn();
  const priorMagi = { priorYearAgi: "55000", priorYearAgiAdjustmentsConfirmed: true };
  const conflicting = { ...priorMagi, priorYearFilingStatus: "married_filing_jointly" };
  expect(() => calculateFederalTax(parseInput({ ...input, form8936: { ...input.form8936, ...conflicting } }))).toThrow(/prior return status/u);
  const agrees = calculateFederalTax(parseInput({ ...input,
    form8936: { ...input.form8936, ...priorMagi, priorYearFilingStatus: "single" },
  }));
  expect(agrees.carryforwards.generalBusinessCredit.toFixed()).toBe("284");
  const full = actualReturn();
  expect(calculateFederalTax(parseInput({ ...full, form8936: { ...full.form8936, ...conflicting } })).schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
});

it("holds missing or conflicting actual carryback evidence and accepts verified zero capacity", () => {
  const input = actualUnusedCreditReturn();
  const current = input.form8936.commercialCleanVehicleCurrentCredit;
  const prior = current.priorYearCarryback;
  const replace = (priorYearCarryback: unknown) => ({ ...input,
    form8936: { ...input.form8936, commercialCleanVehicleCurrentCredit: { ...current, priorYearCarryback } },
  });
  expect(() => calculateFederalTax(parseInput(replace(undefined)))).toThrow(/actual 2025 Section 39 capacity/u);
  expect(() => calculateFederalTax(parseInput(replace({ ...prior, taxYear: 2024 })))).toThrow();
  expect(() => calculateFederalTax(parseInput(replace({ ...prior, earlierSourceYearCarrybacks: "10" })))).toThrow();
  expect(() => calculateFederalTax(parseInput(replace({ ...prior, filingStatus: "head_of_household" })))).toThrow();
  expect(() => calculateFederalTax(parseInput(replace({ ...prior, taxpayerReference: "A different original 2025 taxpayer" })))).toThrow(/original 2025 taxpayer/u);
  expect(() => calculateFederalTax(parseInput(replace({ ...prior, filedReturnTaxpayerTin: "987-65-4321" })))).toThrow(/original 2025 taxpayer/u);
  expect(() => calculateFederalTax(parseInput({ ...input, form2210: { ...input.form2210, priorYearTaxStatus: "no-return" } }))).toThrow(/prior return status/u);
  expect(() => calculateFederalTax(parseInput({ ...input, form2210: { ...input.form2210, priorYearJointReturn: true } }))).toThrow(/prior return status/u);
  expect(() => calculateFederalTax(parseInput({ ...input, taxpayer: { ...input.taxpayer, filingStatus: "head_of_household" } }))).toThrow(/Single cash return/u);
  const withoutRoom = calculateFederalTax(parseInput(replace({ ...prior, section38Limitation: "1000" })));
  expect(withoutRoom.schedule3?.generalBusinessCredit.toFixed()).toBe("5316");
  expect(withoutRoom.form3800?.lines.find(line => line.line === "section45w-carryback-to-2025")?.value.toFixed()).toBe("0");
  expect(withoutRoom.carryforwards.generalBusinessCredit.toFixed()).toBe("684");
  const fractional = calculateFederalTax(parseInput(replace({ ...prior, section38Limitation: "1400.0025", filedReturnTaxpayerTin: prior.filedReturnTaxpayerTin.replace(/-/gu, "") })));
  expect(fractional.schedule3?.generalBusinessCredit.toFixed()).toBe("5316");
  expect(fractional.carryforwards.generalBusinessCredit.toFixed()).toBe("283.9975");
  const noLaterBalance = calculateFederalTax(parseInput(replace({ ...prior, section38Limitation: "1800" })));
  expect(noLaterBalance.form3800?.lines.find(line => line.line === "section45w-carryback-to-2025")?.value.toFixed()).toBe("684");
  expect(noLaterBalance.carryforwards.generalBusinessCredit.isZero()).toBe(true);
});

it("holds an actual debt exclusion with a positive unused current credit", () => {
  const input = actualUnusedCreditReturn();
  const debt = principalResidenceCodInput(2026);
  const { firstName, lastName, ssn } = input.taxpayer.primary;
  const proof = debt.form982PrincipalResidenceSources;
  const attached = { form1099C: debt.form1099C, form982PrincipalResidenceSources: { ...proof,
    debt: { ...proof.debt, debtorName: `${firstName} ${lastName}`, debtorSsnLast4: ssn.slice(-4) },
    acquisition: { ...proof.acquisition, residenceAddress: input.taxpayer.address,
      outstandingPrincipal: "730000", originalAcquisitionPrincipal: "740000" },
  } };
  const completeUse = calculateFederalTax(parseInput({ ...actualReturn(), ...attached }));
  expect(completeUse.schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
  expect(completeUse.schedule1?.cancelledDebtIncome.isZero()).toBe(true);
  expect(() => calculateFederalTax(parseInput({ ...input, ...attached }))).toThrow(/Section 108 attribute reconciliation/u);
});

it("requires actual commercial vehicle possession by the federal calculation date", () => {
  const original = actualReturn();
  const input = parseInput(original);
  expect(() => calculateFederalTax(input, { asOfDate: "2026-01-31" })).toThrow(/actual vehicle possession on or before/u);
  expect(() => calculateFederalTax(input, { asOfDate: "2026-02-30" })).toThrow(/valid calculation as-of date/u);
  expect(() => calculateFederalTax(input, { asOfDate: "2999-01-01" })).toThrow(/valid calculation as-of date/u);
  expect(calculateFederalTax(input, { asOfDate: "2026-02-01" }).schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
  const withoutCandidate = parseInput({ ...original, form8936: { commercialCleanVehicles: original.form8936.commercialCleanVehicles } });
  expect(() => calculateFederalTax(withoutCandidate, { asOfDate: "2026-01-31" })).toThrow(/Business clean-vehicle credit requires supported Form 3800 attribution/u);
});

it("holds unsupported Section 45W evidence and unused current-year credit", () => {
  const input = actualReturn();
  const source = input.form8936.commercialCleanVehicleCurrentCredit;
  const baseYear = { taxableIncome: "10000", filingStatus: "single", originalTax: "1000" };
  const marketplace = marketplaceActualCashInput(false, 2026);
  const replaceSource = (commercialCleanVehicleCurrentCredit: unknown) => ({ form8936: { ...input.form8936, commercialCleanVehicleCurrentCredit } });
  const holds = [
    [replaceSource(undefined), /Business clean-vehicle credit requires supported Form 3800 attribution/u],
    [{ scheduleC: { ...input.scheduleC, sourceFacts: undefined } }, /requires its verified Schedule C depreciation workpaper/u],
    [replaceSource({ ...source, participation: { ...source.participation, actualHours: "500" } }), /more than 500 logged hours/u],
    [replaceSource({ ...source, participation: { ...source.participation, activityReference: "Another activity" } }), /same taxpayer and Schedule C activity/u],
    [{ scheduleC: { ...input.scheduleC, qbiMateriallyParticipated: false } }, /contradicts the existing Schedule C participation answer/u],
    [replaceSource({ ...source, amtDepreciation: { ...source.amtDepreciation, amtAdjustedBasis: "18999.99" } }), /equal actual regular and AMT bases/u],
    [replaceSource({ ...source, amtDepreciation: { ...source.amtDepreciation, assetReference: "Another asset" } }), /same original vehicle asset/u],
    [{ form3800: { currentYearCredits: "1" } }, /competing business or minimum-tax credit/u],
    [{ priorYear: { generalBusinessCreditCarryforward: "1" } }, /competing business or minimum-tax credit/u],
    [{ form8801: { priorYear: 2025, priorYearFilingStatus: "single", priorYearAMT: "1", priorYearExclusionItemAdjustments: "0",
      unusedMinimumTaxCreditCarryforward: "0" } }, /competing business or minimum-tax credit/u],
    [{ scheduleJ: { electedFarmIncome: "100", baseYear1: baseYear, baseYear2: baseYear, baseYear3: baseYear } }, /separately reconciled staged tax-base/u],
    [{ netOperatingLoss: {} }, /separately reconciled staged tax-base/u],
    [{ form2210: { ...input.form2210, calculationMethod: "annualized" } }, /separately reconciled staged tax-base/u],
    [{ form7206: marketplace.form7206, form1095A: marketplace.form1095A }, /separately reconciled Marketplace health/u],
  ] as const;
  for (const [changed, message] of holds) {
    expect(() => calculateFederalTax(parseInput({ ...input, ...changed }))).toThrow(message);
  }
  expect(() => calculateFederalTax(parseInput(actualReturn("full", "44000")))).toThrow(/actual 2025 Section 39 capacity/u);
  expect(() => calculateFederalTax(parseInput(actualReturn("full", "250000")))).toThrow(/separate actual Section 199A basis/u);
});

it.each([["capped_passenger", "20300"], ["filed_class_election", "3800"]] as const)(
  "accepts equal-basis qualified depreciation for %s without an AMT adjustment",
  (position, depreciation) => {
    const result = calculateFederalTax(parseInput(actualReturn(position)));
    expect(result.scheduleC?.depreciationAndSection179Deduction.toFixed()).toBe(depreciation);
    expect(result.scheduleC?.netProfit.toFixed()).toBe("160000");
    expect(result.form6251?.depreciationAdjustment.isZero()).toBe(true);
    expect(result.schedule3?.generalBusinessCredit.toFixed()).toBe("6000");
  },
);
