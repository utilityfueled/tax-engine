// Actual synthetic sources pinned independently before candidate outputs; no UI defaults.
import {TaxYearInputSchema} from '@/models/inputs.js';
import {simpleW2Fixture} from './simple-w2.js';
export const scheduleCSourceFacts = {
  "sourceTaxYear": 2025,
  "sourceReference": "PRIVATE actual C source ledger",
  "sourceFactsConfirmed": true,
  "accountHolder": "primary",
  "ownerName": "Avery Source",
  "businessNameStatus": "reported",
  "businessName": "Sample Source Works",
  "businessEINStatus": "reported",
  "businessEIN": "23-4567890",
  "interest": {
    "sourceReference": "PRIVATE actual interest allocation worksheet",
    "mortgageInterest": "300.10",
    "vehicleLoanInterest": "200.20",
    "otherInterest": "499.70",
    "allInterestOrdinaryCurrentCashBusinessOnlyConfirmed": true,
    "noCapitalizedPrepaidRelatedPartyOrForeignInterestConfirmed": true,
    "noPersonalOrSchedule1AInterestConfirmed": true,
    "mortgageBank1098OrSimilarStatementConfirmed": true,
    "notDeductedElsewhereConfirmed": true,
    "otherExpensesExcludingInterest": "500",
    "otherExpenseSourceReference": "PRIVATE noninterest expense ledger",
    "grossReceiptsException": {
      "allAggregationAndPassThroughSharesIncludedConfirmed": true,
      "notTaxShelterConfirmed": true,
      "noPriorDisallowedInterestOrPartnershipEbieConfirmed": true,
      "history": [
        {
          "taxYear": 2022,
          "grossReceipts": "40000",
          "sourceReference": "PRIVATE aggregate receipts 2022",
          "fullTaxYearConfirmed": true
        },
        {
          "taxYear": 2023,
          "grossReceipts": "40000",
          "sourceReference": "PRIVATE aggregate receipts 2023",
          "fullTaxYearConfirmed": true
        },
        {
          "taxYear": 2024,
          "grossReceipts": "40000",
          "sourceReference": "PRIVATE aggregate receipts 2024",
          "fullTaxYearConfirmed": true
        }
      ]
    },
    "reclassification": {
      "originalOtherExpenses": "1500",
      "interestAlreadyIncluded": "1000",
      "ordinaryExpensesAlreadyIncluded": "0",
      "remainingOtherExpenses": "500",
      "sourceReference": "PRIVATE original vs reclassified ledger"
    }
  },
  "address": {
    "method": "separate_business_address",
    "street": "450 Source Road",
    "unitStatus": "reported",
    "unit": "Suite 4",
    "city": "Austin",
    "state": "TX",
    "zip": "78701"
  }
};
export function scheduleCSourceFixture(year:2025|2026=2025){const source=structuredClone(scheduleCSourceFacts);source.sourceTaxYear=year;source.interest.grossReceiptsException.history.forEach((row,index)=>{row.taxYear=year-3+index;});return TaxYearInputSchema.parse({...structuredClone(simpleW2Fixture),w2s:[],taxpayer:{...structuredClone(simpleW2Fixture.taxpayer),taxYear:year,primary:{...simpleW2Fixture.taxpayer.primary,firstName:'Avery',lastName:'Source',ssn:'900-70-0311'}},scheduleC:{accountHolder:'primary',businessName:'Sample Source Works',ein:'23-4567890',principalBusinessActivity:'Design services',otherExpenseDescription:'Actual office cleaning',accountingMethod:'cash',grossReceipts:'40000',expenses:{businessInterest:'1000',otherExpenses:'500'},sourceFacts:source}});}

export const ordinaryExpenseSources = {
  "sourceReference": "PRIVATE ordinary current expense worksheet",
  "sourceFactsConfirmed": true,
  "allCurrentCashBusinessOnlyConfirmed": true,
  "notCapitalizedInventoryOrDeductedElsewhereConfirmed": true,
  "rentExcludesHomeVehiclesPrepaidAndCapitalAcquisitionConfirmed": true,
  "repairsExcludeCapitalImprovementsConfirmed": true,
  "taxesExcludeIncomeSelfEmploymentCollectedSalesPenaltiesAndAssessmentsConfirmed": true,
  "wagesAreNonownerEmployeesWithoutEmploymentCreditsConfirmed": true,
  "remainingOtherExpenses": "500",
  "remainingOtherExpenseSourceReference": "PRIVATE remaining other expenses ledger",
  "rows": [
    {
      "category": "commissionsAndFees",
      "amount": "10.10",
      "sourceReference": "PRIVATE commissionsAndFees original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "rentOnBusinessProperty",
      "amount": "20.20",
      "sourceReference": "PRIVATE rentOnBusinessProperty original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "repairsAndMaintenance",
      "amount": "30.30",
      "sourceReference": "PRIVATE repairsAndMaintenance original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "taxes",
      "amount": "40.40",
      "sourceReference": "PRIVATE taxes original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "wages",
      "amount": "50.50",
      "sourceReference": "PRIVATE wages original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "bankCharges",
      "amount": "1.01",
      "sourceReference": "PRIVATE bankCharges original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "duesAndPublications",
      "amount": "1.01",
      "sourceReference": "PRIVATE duesAndPublications original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "freight",
      "amount": "1.01",
      "sourceReference": "PRIVATE freight original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "laundryAndCleaning",
      "amount": "1.01",
      "sourceReference": "PRIVATE laundryAndCleaning original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "managementFees",
      "amount": "1.01",
      "sourceReference": "PRIVATE managementFees original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "postage",
      "amount": "1.01",
      "sourceReference": "PRIVATE postage original",
      "sourceFactsConfirmed": true
    },
    {
      "category": "telephone",
      "amount": "1.01",
      "sourceReference": "PRIVATE telephone original",
      "sourceFactsConfirmed": true
    }
  ]
};
