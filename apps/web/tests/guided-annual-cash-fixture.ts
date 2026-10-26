// Explicit fictional source records; no calculated outputs or application imports.
export function actualAnnualCashInterview() { return {
  "taxYear": 2025,
  "segmentation": {
    "filingStatus": "single",
    "incomeTypes": [
      "w2-wages"
    ],
    "lifeEvents": [],
    "stateCode": null
  },
  "sectionData": {
    "deductions": {
      "method": "standard",
      "medicalExpenses": "",
      "stateLocalTaxes": "",
      "realEstateTaxes": "",
      "mortgageInterest": "",
      "charitableContributions": "",
      "casualtyLosses": "",
      "otherItemized": ""
    },
    "personal-info": {
      "dateOfBirth": "1990-01-15",
      "usResidencyMonths": "12",
      "stateResidency": "full-year",
      "firstName": "Jane",
      "middleName": "",
      "lastName": "Doe",
      "ssn": "123-45-6789",
      "addressLine1": "42 Example Road",
      "addressLine2": "",
      "city": "Columbus",
      "state": "OH",
      "zip": "43215",
      "dependentCount": "0",
      "dependents": [],
      "standardDeductionFacts": {
        "primaryBlind": false,
        "spouseBlind": false,
        "primaryCanBeClaimedAsDependent": false,
        "spouseCanBeClaimedAsDependent": false,
        "primaryDeceased": false,
        "spouseDeceased": false,
        "dualStatusAlien": false,
        "nonresidentAlien": false,
        "shortTaxYear": false,
        "spouseItemizes": false,
        "claimSpouseAdditionalDeduction": false
      },
      "livedWithSpouseAtAnyTimeDuringYear": true,
      "employmentValidSsnIssuedByDueDate": true,
      "tinIssuedByDueDate": true,
      "childTaxCredit": {
        "bonaFidePuertoRicoResident": false,
        "puertoRicoExcludedIncome": "0",
        "form4563ExcludedIncome": "0"
      },
      "spouse": {
        "firstName": "Taylor",
        "lastName": "Example",
        "ssn": "222-33-4444",
        "dateOfBirth": "1992-09-10",
        "usResidencyMonths": "12",
        "employmentValidSsnIssuedByDueDate": true,
        "tinIssuedByDueDate": true
      },
      "occupation": "Software Engineer"
    },
    "income-w2": {
      "entries": [
        {
          "accountHolder": "primary",
          "stateTaxReporting": "none",
          "state": "",
          "employerName": "Synthetic Employer",
          "employerEin": "12-3456789",
          "wages": "50000",
          "federalWithheld": "20000",
          "socialSecurityWages": "50000",
          "socialSecurityTips": "0",
          "socialSecurityWithheld": "0",
          "medicareWages": "50000",
          "medicareWithheld": "0",
          "stateWages": "",
          "stateWithheld": "",
          "aiSuggestedFields": {},
          "box10DependentCareBenefits": "0",
          "box12CodeW": "0"
        }
      ]
    },
    "credits": {
      "dependentCare": {
        "expenses": "",
        "qualifyingIndividuals": ""
      },
      "education": {
        "aocStudents": [],
        "llcExpenses": ""
      },
      "energy": {
        "solarElectricCost": "",
        "solarWaterHeatingCost": "",
        "insulationCost": "",
        "exteriorDoorsWindowsCost": "",
        "roofCost": "",
        "energyEfficientHvacCost": "",
        "waterHeaterHeatPumpCost": ""
      },
      "educationDistributions": {
        "beneficiaries": [
          {
            "id": "educator",
            "name": "Jane Doe",
            "studentTaxId": "123-45-6789",
            "outsideK12QualifiedDistributions": "0"
          }
        ],
        "expenses": [
          {
            "id": "first",
            "beneficiaryId": "educator",
            "category": "postsecondary_room_board",
            "paidDate": "2025-09-01",
            "amount": "5000",
            "refundedAmount": "0",
            "taxFreeAssistance": "0",
            "educationCreditAmount": "0",
            "otherTaxBenefitAmount": "0",
            "qualificationConfirmed": true
          },
          {
            "id": "second",
            "beneficiaryId": "educator",
            "category": "postsecondary_room_board",
            "paidDate": "2025-09-01",
            "amount": "5000",
            "refundedAmount": "0",
            "taxFreeAssistance": "0",
            "educationCreditAmount": "0",
            "otherTaxBenefitAmount": "0",
            "qualificationConfirmed": true
          }
        ],
        "allocations": [
          {
            "sourceId": "cash-first",
            "expenseId": "first",
            "amount": "5000",
            "creditAmount": "0"
          },
          {
            "sourceId": "cash-second",
            "expenseId": "second",
            "amount": "5000",
            "creditAmount": "0"
          }
        ],
        "inKindBenefits": [],
        "loanBorrowers": [],
        "coverdellAccounts": [],
        "penaltyExceptions": [],
        "roomBoardPeriods": [
          {
            "id": "fall",
            "beneficiaryId": "educator",
            "sourceTaxYear": "2025",
            "sourceReference": "Fictional fall attendance record",
            "sourceFactsConfirmed": true,
            "institutionId": "fictional-institution",
            "institutionName": "Fictional Example College",
            "institutionEligible": true,
            "academicPeriodStart": "2025-08-15",
            "academicPeriodEnd": "2025-12-20",
            "livingArrangement": "off_campus",
            "halfTimeStudent": true,
            "roomBoardAllowance": "6000",
            "allowanceApplicableConfirmed": true,
            "schoolOwnedHousing": false,
            "schoolOwnedHousingCharge": "0",
            "allReceiptsIncludedConfirmed": true
          }
        ],
        "roomBoardPeriodExpenses": [
          {
            "periodId": "fall",
            "expenseId": "first",
            "coveredStart": "2025-09-01",
            "coveredEnd": "2025-12-01",
            "sourceReference": "Fictional receipt first",
            "sourceFactsConfirmed": true
          },
          {
            "periodId": "fall",
            "expenseId": "second",
            "coveredStart": "2025-09-01",
            "coveredEnd": "2025-12-01",
            "sourceReference": "Fictional receipt second",
            "sourceFactsConfirmed": true
          }
        ],
        "roomBoardEsaAllocations": [],
        "taxYear": "2025",
        "sourceFactsConfirmed": true,
        "allDistributionsReconciled": true,
        "exceptionsDistinctFromCreditConfirmed": true,
        "forms": [
          {
            "fields": {
              "sourceFactsComplete": true,
              "sourceFactsConfirmed": true,
              "sourceId": "cash-first",
              "accountId": "fictional-cash-first",
              "beneficiaryId": "educator",
              "recipientOwner": "primary",
              "accountType": "529",
              "distributionMedium": "cash",
              "grossDistribution": "10000",
              "earnings": "4000",
              "basis": "6000",
              "isTrusteeToTrustee": false,
              "isQtpToRoth": false,
              "recipientNotBeneficiary": false,
              "taxYear": "2025"
            },
            "transfer": {
              "kind": "none"
            }
          },
          {
            "fields": {
              "sourceFactsComplete": true,
              "sourceFactsConfirmed": true,
              "sourceId": "cash-second",
              "accountId": "fictional-cash-second",
              "beneficiaryId": "educator",
              "recipientOwner": "primary",
              "accountType": "529",
              "distributionMedium": "cash",
              "grossDistribution": "10000",
              "earnings": "1000",
              "basis": "9000",
              "isTrusteeToTrustee": false,
              "isQtpToRoth": false,
              "recipientNotBeneficiary": false,
              "taxYear": "2025"
            },
            "transfer": {
              "kind": "none"
            }
          }
        ]
      }
    }
  }
}; }
