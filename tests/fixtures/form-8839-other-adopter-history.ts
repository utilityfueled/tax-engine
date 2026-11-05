import { foreignAdoptionHistoryParams } from "./form-8839-prior-benefits.js";
/** Entirely fictional documentary records, independent of calculation outputs. */
export function sharedAdoptionHistoryParams(taxYear: 2025 | 2026 = 2026) {
  const params = foreignAdoptionHistoryParams(taxYear), child = params.children[0];
  const source = child.priorYearForeignBenefitHistory;
  if (!source) throw new Error("Missing ordinary fictional history");
  source.otherAdopterReceivedBenefits = true;
  return { ...params, children: [{ ...child, priorYearForeignBenefitHistory: { ...source,
    otherAdopterAgreement: {
      sourceTaxYear: taxYear, sourceReference: "fictional-shared-adoption-agreement", sourceFactsConfirmed: true,
      bothAdoptersAgreed: true, allAdoptersIncluded: true,
      taxpayerNameOnAgreement: "Jordan Example", taxpayerIdentifyingNumberLast4: "6789",
      otherAdopterName: "Casey Example", otherAdopterIdentifyingNumber: "456-78-9012",
      childNameOnAgreement: "Sam Example", childIdentifyingNumberLast4: "8901",
      taxpayerExclusionLimit: "6000", otherAdopterExclusionLimit: taxYear === 2026 ? "11670" : "11280",
      creditExpenseHistoryConfirmed: true, taxpayerQualifiedCreditExpenses: "0", otherAdopterQualifiedCreditExpenses: "0",
      taxpayerPriorCreditsClaimed: "0", otherAdopterPriorCreditsClaimed: "0",
      otherAdopterPriorExclusionLimitUsed: "0", otherAdopterCurrentBenefits: "0",
      allOtherAdopterBenefitsIncluded: true,
      records: [{ sourceId: "fictional-outside-prior-benefit-record", taxYear: taxYear - 1,
        employerName: "Other Employer", employerEin: "23-4567890", recipientName: "Casey Example",
        recipientTaxpayerIdLast4: "9012", originalEmployerBenefits: "12000", benefitsAllocatedToChild: "12000",
        allocatedBenefitsIncludedInPriorIncome: true, employerPlanQualified: true }],
    } } }] };
}

/** Exact original simpleW2Fixture values, unannotated until real canonical parsing. */
export const sharedAdoptionCanonicalOriginals = {
  "standardDeductionFacts": {
    "primaryBlind": false,
    "spouseBlind": false,
    "primaryCanBeClaimedAsDependent": false,
    "spouseCanBeClaimedAsDependent": false,
    "primaryDeathDate": null,
    "spouseDeathDate": null,
    "dualStatusAlien": false,
    "nonresidentAlien": false,
    "shortTaxYear": false,
    "spouseItemizes": false,
    "claimSpouseAdditionalDeduction": false
  },
  "taxpayer": {
    "taxYear": 2025,
    "filingStatus": "single",
    "primary": {
      "firstName": "Jane",
      "lastName": "Doe",
      "ssn": "123-45-6789",
      "dateOfBirth": "1990-01-15",
      "occupation": "Software Engineer"
    },
    "address": {
      "street": "123 Main St",
      "city": "Seattle",
      "state": "WA",
      "zip": "98101"
    },
    "dependents": []
  },
  "w2s": [
    {
      "employer": {
        "name": "Tech Corp",
        "ein": "12-3456789"
      },
      "wages": "85000",
      "box10DependentCareBenefits": "0",
      "federalWithheld": "12750",
      "socialSecurityWages": "85000",
      "socialSecurityWithheld": "5270",
      "medicareWages": "85000",
      "medicareWithheld": "1232.50",
      "stateTaxWithheld": "0",
      "stateWages": "0",
      "localTaxWithheld": "0",
      "state": "WA"
    }
  ],
  "form1099Int": [],
  "form1099Div": [],
  "form1099B": [],
  "form1099Nec": [],
  "form1099Misc": [],
  "scheduleK1": [],
  "form1098": [],
  "form1095A": [],
  "donations": []
};
