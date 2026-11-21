import { completeRetirementSource } from "../guided-interview/complete-facts";

export const guidedFirstHomeBirthDate = "1980-07-15";

export const guidedFirstHomeRetirement = {
  ...completeRetirementSource,
  distributionCode: "1", isIraSepSimple: true, grossDistribution: "7000", taxableAmount: "7000",
  code1IraAgeSource: { singlePaymentConfirmed: true, ownerBirthDate: guidedFirstHomeBirthDate, distributionDate: "2025-09-15" },
};

export const guidedFirstHomeWorksheet = {
  original: {
    payer: guidedFirstHomeRetirement.payer,
    payerTin: guidedFirstHomeRetirement.payerTin.replaceAll("-", ""),
    accountReference: guidedFirstHomeRetirement.accountReference,
    grossDistribution: guidedFirstHomeRetirement.grossDistribution,
    distributionDate: "2025-09-15",
    ownerBirthDate: guidedFirstHomeBirthDate,
  },
  ownHomePurchaseCompleted: true,
  unmarriedWithoutMainHomeInterest: true,
  noFormerSection1034Suspension: true,
  distributionWasNotRolledOver: true,
  paidPurchasePriceFromDistribution: true,
  bindingContractDate: "2025-10-20",
  paymentDate: "2026-01-13",
  paymentAmount: "6500",
  priorQualifiedDistributions: "4000",
};
