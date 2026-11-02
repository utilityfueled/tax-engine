/** Explicit fictional raw sources, pinned before any candidate outputs. */
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "./simple-w2.js";

export function paOrdinaryResidencyFixture(status: "resident" | "part_year" | "nonresident", year = 2025) {
  const start = `${year}-01-01`; const end = `${year}-12-31`;
  const owner = { firstName: "Avery", lastName: "Pennsylvania", ssn: "900-70-0311" };
  const input = TaxYearInputSchema.parse({ ...structuredClone(simpleW2Fixture),
    taxpayer: { ...structuredClone(simpleW2Fixture.taxpayer), taxYear: year,
      primary: { ...simpleW2Fixture.taxpayer.primary, ...owner },
      address: { street: "10 Fictional Way", city: "Albany", state: "NY", zip: "12201" },
    },
    w2s: [{ ...structuredClone(simpleW2Fixture.w2s[0]), taxYear: year, accountHolder: "primary",
      wages: "50000", socialSecurityWages: "50000", socialSecurityWithheld: "3100",
      medicareWages: "50000", medicareWithheld: "725", state: "PA", stateWages: status === "resident" ? "50000" : status === "part_year" ? "26000" : "6000",
      stateTaxWithheld: status === "resident" ? "1539" : status === "part_year" ? "799" : "184",
    }],
    form1099Int: [{ payer: "Fictional Bank", payerTin: "12-3456789", accountReference: "fictional-interest-original",
      accountHolder: "primary", interestIncome: "120", earlyWithdrawalPenalty: "0", usSavingsBondInterest: "0",
      federalWithheld: "0", foreignTaxPaid: "0", taxExemptInterest: "0", privateActivityBondInterest: "0",
      paDirectObligationInterest: "0", state: "PA", stateWithheld: "0" }],
  });
  const payroll = status === "part_year" ? [
    { sourceReference: "fictional-pre-move-payroll", paidOn: `${year}-06-30`, serviceFrom: start, serviceThrough: `${year}-06-30`, grossCompensation: "30000", paServicesCompensation: "6000", outsidePAServicesCompensation: "24000" },
    { sourceReference: "fictional-post-move-payroll", paidOn: end, serviceFrom: `${year}-07-01`, serviceThrough: end, grossCompensation: "20000", paServicesCompensation: "0", outsidePAServicesCompensation: "20000" },
  ] : [{ sourceReference: "fictional-full-year-payroll", paidOn: end, serviceFrom: start, serviceThrough: end,
    grossCompensation: "50000", paServicesCompensation: status === "resident" ? "0" : "6000", outsidePAServicesCompensation: status === "resident" ? "50000" : "44000" }];
  const sources = {
    sourceTaxYear: year, sourceReference: "fictional-private-pa-complete-originals", sourceFactsConfirmed: true,
    owner: { accountHolder: "primary", originalTaxpayer: owner },
    residency: { status, sourceReference: "fictional-domicile-abode-and-presence", factsConfirmed: true,
      domicilePeriods: status === "part_year" ? [
        { from: start, through: `${year}-06-30`, state: "NY", daysInPA: 20 },
        { from: `${year}-07-01`, through: end, state: "PA", daysInPA: 180 },
      ] : [{ from: start, through: end, state: status === "resident" ? "PA" : "NY", daysInPA: status === "resident" ? 350 : 20 }],
      paPermanentAbodePeriods: status === "nonresident" ? [] : [{ from: status === "part_year" ? `${year}-07-01` : start, through: end }],
      outsidePAPermanentAbodePeriods: status === "resident" ? [] : [{ from: start, through: status === "part_year" ? `${year}-06-30` : end }],
      moveAbandonmentNewDomicileAndPresenceConfirmed: status === "part_year",
      dec31PrincipalResidenceState: status === "nonresident" ? "NY" : "PA",
      schoolDistrictCode: status === "nonresident" ? "99999" : "02745",
      schoolDistrictName: status === "nonresident" ? "Non-Pennsylvania" : "Pittsburgh",
    },
    wages: [{ originalIndex: 0, sourceTaxYear: year, sourceReference: "fictional-w2-original", sourceFactsConfirmed: true,
      original: structuredClone(input.w2s[0]), ordinaryCashCompensationOnlyConfirmed: true,
      noPAFederalCompensationDifferencesConfirmed: true, currentUncorrectedNonvoidOriginalConfirmed: true,
      allOriginalBoxesKnownConfirmed: true, payroll }],
    interest: [{ originalIndex: 0, sourceTaxYear: year, sourceReference: "fictional-int-original", sourceFactsConfirmed: true,
      original: structuredClone(input.form1099Int[0]), ordinaryPersonalBankInterestConfirmed: true,
      currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
      credits: status === "part_year" ? [
        { creditedOn: `${year}-03-31`, amount: "80", sourceReference: "fictional-march-bank-credit" },
        { creditedOn: `${year}-09-30`, amount: "40", sourceReference: "fictional-september-bank-credit" },
      ] : [{ creditedOn: end, amount: "120", sourceReference: "fictional-bank-credit" }],
    }],
    otherPAIncomeClassesConfirmedNone: true, otherPAAdjustmentsConfirmedNone: true,
  };
  return { input, sources };
}
