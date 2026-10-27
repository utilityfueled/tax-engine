/** Explicit fictional originals, generated from the source fixture; no calculation results. */
export function actualSavingsBondReissueInterview() { return {
  "phase": "interview",
  "taxYear": 2025,
  "segmentation": {
    "filingStatus": "mfj",
    "incomeTypes": [
      "w2",
      "investments"
    ],
    "lifeEvents": [],
    "stateCode": null
  },
  "currentSectionIndex": 0,
  "completedSections": [],
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
      "dateOfBirth": "1970-01-01",
      "usResidencyMonths": "12",
      "stateResidency": "full-year",
      "firstName": "Morgan",
      "middleName": "",
      "lastName": "Fixture",
      "ssn": "900-70-3101",
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
        "lastName": "Fixture",
        "ssn": "900-70-3102",
        "dateOfBirth": "1972-02-01",
        "usResidencyMonths": "12",
        "employmentValidSsnIssuedByDueDate": true,
        "tinIssuedByDueDate": true
      }
    },
    "income-w2": {
      "entries": [
        {
          "accountHolder": "primary",
          "stateTaxReporting": "none",
          "state": "",
          "employerName": "Synthetic Employer",
          "employerEin": "12-3456789",
          "wages": "80000",
          "federalWithheld": "10000",
          "socialSecurityWages": "80000",
          "socialSecurityTips": "0",
          "socialSecurityWithheld": "4960",
          "medicareWages": "80000",
          "medicareWithheld": "1160",
          "stateWages": "",
          "stateWithheld": "",
          "aiSuggestedFields": {},
          "box10DependentCareBenefits": "0",
          "box12CodeW": "0"
        }
      ]
    },
    "income-investments": {
      "interestEntries": [
        {
          "payer": "Fictional Treasury original",
          "interestIncome": "0",
          "federalWithheld": "0",
          "accountHolder": "primary",
          "payerTin": "12-3456789",
          "stateTaxReporting": "none",
          "state": "",
          "stateWithheld": "0",
          "earlyWithdrawalPenalty": "0",
          "usSavingsBondInterest": "500",
          "foreignTaxPaid": "0",
          "foreignCountry": "",
          "taxExemptInterest": "0",
          "privateActivityBondInterest": "0",
          "marketDiscount": "0",
          "bondPremium": "0",
          "treasuryBondPremium": "0",
          "taxExemptBondPremium": "0",
          "accountReference": "FICTIONAL-BOND-ACCOUNT"
        }
      ],
      "dividendEntries": [],
      "brokerageEntries": []
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
      "savingsBondEducation": {
        "reissueSources": {
          "sourceTaxYear": "2025",
          "sourceReference": "Fictional original Treasury history",
          "sourceFactsConfirmed": true,
          "primary": {
            "firstName": "Morgan",
            "lastName": "Fixture",
            "ssnLast4": "3101",
            "dateOfBirth": "1970-01-01"
          },
          "spouse": {
            "firstName": "Taylor",
            "lastName": "Fixture",
            "ssnLast4": "3102",
            "dateOfBirth": "1972-02-01"
          },
          "statements": [
            {
              "sourceId": "statement-a",
              "sourceReference": "Fictional original Box3 and transaction detail",
              "originalIndex": "0",
              "payer": "Fictional Treasury original",
              "accountReference": "FICTIONAL-BOND-ACCOUNT",
              "accountHolder": "primary",
              "box3": "500",
              "priorRecognizedInterestIncluded": "0",
              "otherBox3Interest": "0",
              "redemptionSourceIds": [
                "bond-primary",
                "bond-spouse"
              ],
              "currentTransfers": [
                {
                  "groupSourceId": "original-joint",
                  "owner": "primary"
                }
              ]
            }
          ],
          "groups": [
            {
              "sourceId": "original-joint",
              "originalBondIdentifier": "EE-FICTIONAL-ORIGINAL",
              "sourceReference": "Fictional original purchase and reissue records",
              "originalBondType": "paper_ee",
              "originalIssueDate": "2000-01-01",
              "originalFaceValue": "1000",
              "originalRegisteredOwner": "taxpayer_and_spouse",
              "taxpayerPurchaseFunds": "500",
              "spousePurchaseFunds": "0",
              "communityProperty": false,
              "bothOriginalOwnersLivingConfirmed": true,
              "allPriorReportingCompleteConfirmed": true,
              "taxpayerPreviouslyReportedInterest": "0",
              "spousePreviouslyReportedInterest": "0",
              "reissueDate": "2025-06-01",
              "valueAtReissue": "700",
              "allSuccessorsCompleteConfirmed": true,
              "successors": [
                {
                  "sourceId": "successor-primary",
                  "bondIdentifier": "EE-FICTIONAL-A",
                  "sourceReference": "Fictional successor A",
                  "faceValue": "500",
                  "registeredOwner": "taxpayer",
                  "furtherOwnershipChanges": false,
                  "status": "redeemed",
                  "redemptionSourceId": "bond-primary",
                  "postReissuePriorInterestReported": "0"
                },
                {
                  "sourceId": "successor-spouse",
                  "bondIdentifier": "EE-FICTIONAL-B",
                  "sourceReference": "Fictional successor B",
                  "faceValue": "500",
                  "registeredOwner": "spouse",
                  "furtherOwnershipChanges": false,
                  "status": "redeemed",
                  "redemptionSourceId": "bond-spouse",
                  "postReissuePriorInterestReported": "0"
                }
              ]
            }
          ]
        },
        "sourceFactsConfirmed": true,
        "currentStatementReconciliationConfirmed": true,
        "priorYearInterestIncludedInCurrentStatements": "0",
        "educationExpenses": [
          {
            "sourceId": "tuition",
            "beneficiaryName": "Morgan Fixture",
            "beneficiaryTaxId": "900-70-3101",
            "relationship": "taxpayer",
            "institutionName": "Fictional College",
            "institutionAddress": "1 Example Lane",
            "expenseType": "tuition_and_required_fees",
            "paidTaxYear": "2025",
            "amountPaid": "5000",
            "qualificationConfirmed": true,
            "coordinationConfirmed": true,
            "directInstitutionBenefits": "0",
            "educationCreditExpenses": "0",
            "taxFreeDistributionExpenses": "0",
            "beneficiaryBenefits": "0"
          }
        ],
        "americanSamoaIncomeExclusion": "0",
        "puertoRicoIncomeExclusion": "0",
        "royaltyInterestAdjustment": "0",
        "taxYear": "2025",
        "redemptions": [
          {
            "sourceFactsComplete": true,
            "proceeds": "500",
            "sourceId": "bond-primary",
            "reissueSourceId": "successor-primary",
            "bondIdentifier": "EE-FICTIONAL-A",
            "bondType": "paper_ee",
            "issueDate": "2000-01-01",
            "redemptionDate": "2025-09-01",
            "ownerDateOfBirth": "1970-01-01",
            "registeredOwner": "taxpayer",
            "ownershipConfirmed": true,
            "faceValue": "500"
          },
          {
            "sourceFactsComplete": true,
            "proceeds": "500",
            "sourceId": "bond-spouse",
            "reissueSourceId": "successor-spouse",
            "bondIdentifier": "EE-FICTIONAL-B",
            "bondType": "paper_ee",
            "issueDate": "2000-01-01",
            "redemptionDate": "2025-09-01",
            "ownerDateOfBirth": "1972-02-01",
            "registeredOwner": "spouse",
            "ownershipConfirmed": true,
            "faceValue": "500"
          }
        ]
      }
    }
  }
}; }
