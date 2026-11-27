import { guidedCommercialScheduleCContext, reviewCommercialScheduleCLink } from "@/lib/guided-commercial-vehicle-schedule-c";
import { emptyCreditsData, emptyPaymentData, updateSectionData } from "@/lib/guided-interview-flow";
import { emptyEstimatedTaxFacts } from "@/lib/guided-estimated-tax-facts";
import { section45WBasisOriginals, section45WDepreciationOriginals } from "./section45w-first-year";
import { completeBusinessSection, completePersonalInfo, startCompleteInterview } from "../guided-interview/complete-facts";

export function guidedCommercialWorkVanFixture(grossReceipts = "179185.00") {
  const start = startCompleteInterview({ filingStatus: "single", incomeTypes: ["self-employment"], lifeEvents: [], stateCode: null });
  const personal = { ...completePersonalInfo, spouse: undefined };
  const vehicle = { ...section45WBasisOriginals.vehicle, grossVehicleWeightRatingPounds: 7200 };
  const basis = { ...section45WBasisOriginals, vehicle };
  const { activity, commercialOriginalOwner, depreciationAsset } = basis;
  const workpaper = section45WDepreciationOriginals(basis);
  const records = {
    workpaper: { ...workpaper, depreciation: { ...workpaper.depreciation,
      classification: { kind: "truck_or_van" as const, grossVehicleWeightRatingPounds: 7200, manufacturerRecordReference: "Original van weight" },
    } },
    currentCredit: {
      taxYear: 2026 as const,
      participation: { taxpayerReference: activity.taxpayerReference, activityReference: activity.activityReference,
        originalRecordReference: "Actual participation log", actualHours: "654.25",
        actualOwnerHoursComparedAndConfirmed: true as const, noPassiveOrFormerPassiveActivityCreditsConfirmed: true as const },
      amtDepreciation: { taxpayerReference: activity.taxpayerReference, activityReference: activity.activityReference,
        assetReference: depreciationAsset.originalRecordReference, originalRecordReference: "Actual AMT asset ledger",
        vin: vehicle.vin, placedInServiceDate: vehicle.datePlacedInService, regularAdjustedBasis: "19000", amtAdjustedBasis: "19000",
        qualifiedSection168PropertyAndEqualBasesConfirmed: true as const },
      creditInventory: { taxpayerReference: activity.taxpayerReference, originalRecordReference: "Actual business credit inventory",
        noOtherCurrentPassiveOrCarryCreditsConfirmed: true as const, noPriorMinimumTaxCreditConfirmed: true as const },
    },
  };
  const business = {
    ...completeBusinessSection, manualGrossReceipts: grossReceipts,
    expenses: { ...completeBusinessSection.expenses, advertising: "125.25", officeExpense: "40.25", supplies: "19.50" },
    businessFacts: { ...completeBusinessSection.businessFacts, activityDescription: activity.principalBusinessActivity, businessCode: activity.businessCode,
      scheduleCSourceFacts: { sourceTaxYear: 2026, sourceFactsConfirmed: true as const, accountHolder: "primary" as const,
        ownerName: `${personal.firstName} ${personal.lastName}`, sourceReference: activity.originalRecordReference,
        businessNameStatus: "blank_original" as const, businessEINStatus: "not_issued" as const,
        address: { method: "home_at_return_address" as const, homeAtReturnAddressConfirmed: true as const,
          homeReturnAddress: { street: personal.addressLine1, city: personal.city, state: personal.state, zip: personal.zip } },
      },
    },
  };
  const start2026 = updateSectionData({ ...start, taxYear: 2026 }, "personal-info", personal);
  const draftedBusiness = updateSectionData(start2026, "income-self-employment", business);
  const payments = {
    ...emptyPaymentData,
    estimatedTaxFacts: { ...emptyEstimatedTaxFacts, sourceTaxYear: "2026", sourceReference: "Actual prior return and payment history",
      sourceFactsConfirmed: true, allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true,
      farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, calculationMethod: "regular",
      withholdingMethod: "equal-installments", priorYearTaxStatus: "no-tax-liability", earlyReturnExceptionClaimed: false,
      priorYearFullYear: true, priorYearJointReturn: false, priorYearResidentAllYear: true,
      priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "0" } as const,
  };
  const draftedPayments = updateSectionData(updateSectionData(draftedBusiness, "income-self-employment", business), "payments", payments);
  const draft = updateSectionData(draftedPayments, "payments", payments);
  const commercialOriginal = {
    vin: vehicle.vin, bindingContractDate: vehicle.bindingContractDate, bindingContractReference: vehicle.bindingContractReference,
    paymentDate: vehicle.paymentDate, paymentReference: vehicle.paymentReference, datePlacedInService: vehicle.datePlacedInService,
    placedInServiceReference: vehicle.placedInServiceReference,
    scheduleCLink: { taxpayerReference: activity.taxpayerReference, ownerRecordReference: commercialOriginalOwner.originalRecordReference,
      activityReference: activity.activityReference, ledgerRecordReference: "Actual annual cash ledger",
      sameOwnerAndVehicleConfirmed: true, scopeAndAmountsConfirmed: true },
  };
  const ledger = reviewCommercialScheduleCLink(commercialOriginal, guidedCommercialScheduleCContext(draft));
  const ledgerFingerprint = ledger.fingerprint;
  if (!ledgerFingerprint) throw new Error(ledger.message);
  const linked = { ...commercialOriginal, scheduleCLink: { ...commercialOriginal.scheduleCLink, reviewedFingerprint: ledgerFingerprint }, workpaper: { records } };
  const apply = (original: typeof linked) => updateSectionData(draft, "credits", { ...emptyCreditsData, vehicles: { entries: [], commercialOriginal: original } });
  return { state: apply(linked), linked, records, vehicle };
}
