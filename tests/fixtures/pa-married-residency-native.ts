/** Literal fictional records copied from the existing admitted method before native changes. */
import {TaxYearInputSchema} from '@/models/inputs';
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources';
const examples={
  "nonresident": {
    "input": {
      "taxpayer": {
        "taxYear": 2025,
        "filingStatus": "married_filing_jointly",
        "primary": {
          "firstName": "Avery",
          "lastName": "Pennsylvania",
          "ssn": "900-70-0311",
          "dateOfBirth": "1950-04-02",
          "employmentValidSsnIssuedByDueDate": true,
          "tinIssuedByDueDate": true
        },
        "spouse": {
          "firstName": "Morgan",
          "lastName": "Pennsylvania",
          "ssn": "900-70-0312",
          "dateOfBirth": "1952-05-03",
          "employmentValidSsnIssuedByDueDate": true,
          "tinIssuedByDueDate": true
        },
        "address": {
          "street": "10 Fictional Way",
          "city": "Pittsburgh",
          "state": "PA",
          "zip": "15201"
        },
        "dependents": []
      },
      "w2s": [
        {
          "taxYear": 2025,
          "employer": {
            "name": "Fictional Avery Employer",
            "ein": "91-0000311"
          },
          "accountHolder": "primary",
          "wages": "50000",
          "federalWithheld": "0",
          "box12CodeW": "0",
          "box12CodeD": "0",
          "box12CodeE": "0",
          "box12CodeF": "0",
          "box12CodeG": "0",
          "box12CodeH": "0",
          "box12CodeS": "0",
          "box12CodeAA": "0",
          "box12CodeBB": "0",
          "box12CodeEE": "0",
          "box12CodeT": "0",
          "socialSecurityWages": "50000",
          "socialSecurityTips": "0",
          "allocatedTips": "0",
          "socialSecurityWithheld": "3100",
          "medicareWages": "50000",
          "medicareWithheld": "725",
          "box10DependentCareBenefits": "0",
          "stateTaxWithheld": "1535",
          "localWages": "0",
          "localTaxWithheld": "0",
          "stateWages": "50000",
          "state": "PA"
        },
        {
          "taxYear": 2025,
          "employer": {
            "name": "Fictional Morgan Employer",
            "ein": "91-0000312"
          },
          "accountHolder": "spouse",
          "wages": "30000",
          "federalWithheld": "0",
          "box12CodeW": "0",
          "box12CodeD": "0",
          "box12CodeE": "0",
          "box12CodeF": "0",
          "box12CodeG": "0",
          "box12CodeH": "0",
          "box12CodeS": "0",
          "box12CodeAA": "0",
          "box12CodeBB": "0",
          "box12CodeEE": "0",
          "box12CodeT": "0",
          "socialSecurityWages": "30000",
          "socialSecurityTips": "0",
          "allocatedTips": "0",
          "socialSecurityWithheld": "1860",
          "medicareWages": "30000",
          "medicareWithheld": "435",
          "box10DependentCareBenefits": "0",
          "stateTaxWithheld": "368",
          "localWages": "0",
          "localTaxWithheld": "0",
          "stateWages": "12000",
          "state": "PA"
        }
      ],
      "form1099Int": [],
      "form1099Div": [],
      "form1099B": [],
      "form1099DA": [],
      "form1099Nec": [],
      "form1099Misc": [],
      "form1099G": [],
      "form1099OID": [],
      "formW2G": [],
      "form1099K": [],
      "form1099C": [],
      "form1099Q": [],
      "scheduleK1": [],
      "scheduleK1Form1041": [],
      "form1098": [],
      "form1098E": [],
      "form1095A": [],
      "donations": [],
      "rentalProperties": [],
      "standardDeductionFacts": {
        "primaryBlind": false,
        "spouseBlind": false,
        "primaryCanBeClaimedAsDependent": false,
        "spouseCanBeClaimedAsDependent": false,
        "spouseItemizes": false,
        "dualStatusAlien": false,
        "nonresidentAlien": false,
        "shortTaxYear": false,
        "primaryDeathDate": null,
        "spouseDeathDate": null,
        "claimSpouseAdditionalDeduction": false
      },
      "savingsBondRedemptions": [],
      "form6252": [],
      "form8814": [],
      "homeSales": [],
      "form8824": [],
      "eic": {
        "claimantEligibility": {
          "sourceTaxYear": 2025,
          "sourceReference": "Fictional actual taxpayer and spouse childless eligibility records",
          "sourceFactsConfirmed": true,
          "primaryNonresidentAlienDuringYear": false,
          "primaryQualifyingChildOfAnotherTaxpayer": false,
          "spouseNonresidentAlienDuringYear": false,
          "spouseQualifyingChildOfAnotherTaxpayer": false,
          "primaryChildless": {
            "mainHomeInUnitedStatesMoreThanHalfYear": true,
            "countedMilitaryDutyOutsideUnitedStates": false
          },
          "spouseChildless": {
            "mainHomeInUnitedStatesMoreThanHalfYear": true,
            "countedMilitaryDutyOutsideUnitedStates": false
          }
        },
        "disallowanceSources": {
          "sourceTaxYear": 2025,
          "sourceReference": "Fictional complete IRS and filed-return records",
          "sourceFactsConfirmed": true,
          "claimStatus": "preparing",
          "reviewedThroughDate": "2026-03-01",
          "preparationAsOfDate": "2026-03-01",
          "filers": [
            {
              "owner": "primary",
              "originalTaxpayer": {
                "firstName": "Avery",
                "lastName": "Pennsylvania",
                "ssn": "900-70-0311"
              },
              "sourceReference": "Fictional primary complete history",
              "sourceFactsConfirmed": true,
              "allHistoryIncluded": true,
              "denials": [],
              "laterAllowances": []
            },
            {
              "owner": "spouse",
              "originalTaxpayer": {
                "firstName": "Morgan",
                "lastName": "Pennsylvania",
                "ssn": "900-70-0312"
              },
              "sourceReference": "Fictional spouse complete history",
              "sourceFactsConfirmed": true,
              "allHistoryIncluded": true,
              "denials": [],
              "laterAllowances": []
            }
          ]
        }
      }
    },
    "sources": {
      "sourceTaxYear": 2025,
      "sourceReference": "Fictional actual complete married household",
      "sourceFactsConfirmed": true,
      "originalFederalSources": {
        "taxpayer": {
          "taxYear": 2025,
          "filingStatus": "married_filing_jointly",
          "primary": {
            "firstName": "Avery",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0311",
            "dateOfBirth": "1950-04-02",
            "employmentValidSsnIssuedByDueDate": true,
            "tinIssuedByDueDate": true
          },
          "spouse": {
            "firstName": "Morgan",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0312",
            "dateOfBirth": "1952-05-03",
            "employmentValidSsnIssuedByDueDate": true,
            "tinIssuedByDueDate": true
          },
          "address": {
            "street": "10 Fictional Way",
            "city": "Pittsburgh",
            "state": "PA",
            "zip": "15201"
          },
          "dependents": []
        },
        "w2s": [
          {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Avery Employer",
              "ein": "91-0000311"
            },
            "accountHolder": "primary",
            "wages": "50000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "50000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "3100",
            "medicareWages": "50000",
            "medicareWithheld": "725",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "1535",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "50000",
            "state": "PA"
          },
          {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Morgan Employer",
              "ein": "91-0000312"
            },
            "accountHolder": "spouse",
            "wages": "30000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "30000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "1860",
            "medicareWages": "30000",
            "medicareWithheld": "435",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "368",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "12000",
            "state": "PA"
          }
        ],
        "form1099Int": [],
        "form1099Div": [],
        "form1099B": [],
        "form1099DA": [],
        "form1099Nec": [],
        "form1099Misc": [],
        "form1099G": [],
        "form1099OID": [],
        "formW2G": [],
        "form1099K": [],
        "form1099C": [],
        "form1099Q": [],
        "scheduleK1": [],
        "scheduleK1Form1041": [],
        "form1098": [],
        "form1098E": [],
        "form1095A": [],
        "donations": [],
        "rentalProperties": [],
        "standardDeductionFacts": {
          "primaryBlind": false,
          "spouseBlind": false,
          "primaryCanBeClaimedAsDependent": false,
          "spouseCanBeClaimedAsDependent": false,
          "spouseItemizes": false,
          "dualStatusAlien": false,
          "nonresidentAlien": false,
          "shortTaxYear": false,
          "primaryDeathDate": null,
          "spouseDeathDate": null,
          "claimSpouseAdditionalDeduction": false
        },
        "savingsBondRedemptions": [],
        "form6252": [],
        "form8814": [],
        "homeSales": [],
        "form8824": [],
        "eic": {
          "claimantEligibility": {
            "sourceTaxYear": 2025,
            "sourceReference": "Fictional actual taxpayer and spouse childless eligibility records",
            "sourceFactsConfirmed": true,
            "primaryNonresidentAlienDuringYear": false,
            "primaryQualifyingChildOfAnotherTaxpayer": false,
            "spouseNonresidentAlienDuringYear": false,
            "spouseQualifyingChildOfAnotherTaxpayer": false,
            "primaryChildless": {
              "mainHomeInUnitedStatesMoreThanHalfYear": true,
              "countedMilitaryDutyOutsideUnitedStates": false
            },
            "spouseChildless": {
              "mainHomeInUnitedStatesMoreThanHalfYear": true,
              "countedMilitaryDutyOutsideUnitedStates": false
            }
          },
          "disallowanceSources": {
            "sourceTaxYear": 2025,
            "sourceReference": "Fictional complete IRS and filed-return records",
            "sourceFactsConfirmed": true,
            "claimStatus": "preparing",
            "reviewedThroughDate": "2026-03-01",
            "preparationAsOfDate": "2026-03-01",
            "filers": [
              {
                "owner": "primary",
                "originalTaxpayer": {
                  "firstName": "Avery",
                  "lastName": "Pennsylvania",
                  "ssn": "900-70-0311"
                },
                "sourceReference": "Fictional primary complete history",
                "sourceFactsConfirmed": true,
                "allHistoryIncluded": true,
                "denials": [],
                "laterAllowances": []
              },
              {
                "owner": "spouse",
                "originalTaxpayer": {
                  "firstName": "Morgan",
                  "lastName": "Pennsylvania",
                  "ssn": "900-70-0312"
                },
                "sourceReference": "Fictional spouse complete history",
                "sourceFactsConfirmed": true,
                "allHistoryIncluded": true,
                "denials": [],
                "laterAllowances": []
              }
            ]
          }
        }
      },
      "filingMode": "M",
      "owners": [
        {
          "accountHolder": "primary",
          "originalTaxpayer": {
            "firstName": "Avery",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0311"
          },
          "sourceReference": "Fictional primary actual household originals",
          "factsConfirmed": true,
          "taxYearFrom": "2025-01-01",
          "taxYearThrough": "2025-12-31",
          "aliveEntireYear": true,
          "marriedAndLivedTogetherEntireYearConfirmed": true,
          "cohabitationFrom": "2025-01-01",
          "cohabitationThrough": "2025-12-31",
          "claimedAsDependentOnAnotherReturn": false,
          "individualSupportDhsLiability": false,
          "individualCourtObligation": false,
          "residency": {
            "sourceReference": "Fictional legacy residency summary intentionally unconfirmed",
            "factsConfirmed": false,
            "domicileState": "",
            "domicileFrom": "",
            "domicileThrough": "",
            "paAbodeFrom": "",
            "paAbodeThrough": "",
            "actualDaysInPA": null,
            "dec31SchoolDistrictCode": "",
            "dec31SchoolDistrictName": ""
          },
          "sp": {
            "sourceReference": "Fictional primary complete worldwide source history",
            "allWorldwideSourcesCompleteConfirmed": true,
            "categories": {
              "2": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 2",
                "entries": []
              },
              "3": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 3",
                "entries": []
              },
              "4": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 4",
                "entries": []
              },
              "5": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 5",
                "entries": []
              },
              "6": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 6",
                "entries": []
              },
              "7": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 7",
                "entries": []
              },
              "8": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 8",
                "entries": []
              },
              "9": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 9",
                "entries": []
              },
              "10": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 10",
                "entries": []
              }
            }
          },
          "payments": {
            "sourceReference": "Fictional primary complete PA account statement",
            "allCurrentPaymentsReviewedConfirmed": true,
            "estimatedPaymentsStatus": "known_none",
            "extensionPaymentsStatus": "known_none",
            "priorCreditStatus": "known_none",
            "originalReceipts": [],
            "priorReturnStatus": "no_return",
            "priorReturnSourceReference": "Fictional primary actual no prior return history"
          }
        },
        {
          "accountHolder": "spouse",
          "originalTaxpayer": {
            "firstName": "Morgan",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0312"
          },
          "sourceReference": "Fictional spouse actual household originals",
          "factsConfirmed": true,
          "taxYearFrom": "2025-01-01",
          "taxYearThrough": "2025-12-31",
          "aliveEntireYear": true,
          "marriedAndLivedTogetherEntireYearConfirmed": true,
          "cohabitationFrom": "2025-01-01",
          "cohabitationThrough": "2025-12-31",
          "claimedAsDependentOnAnotherReturn": false,
          "individualSupportDhsLiability": false,
          "individualCourtObligation": false,
          "residency": {
            "sourceReference": "Fictional legacy residency summary intentionally unconfirmed",
            "factsConfirmed": false,
            "domicileState": "",
            "domicileFrom": "",
            "domicileThrough": "",
            "paAbodeFrom": "",
            "paAbodeThrough": "",
            "actualDaysInPA": null,
            "dec31SchoolDistrictCode": "",
            "dec31SchoolDistrictName": ""
          },
          "sp": {
            "sourceReference": "Fictional spouse complete worldwide source history",
            "allWorldwideSourcesCompleteConfirmed": true,
            "categories": {
              "2": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 2",
                "entries": []
              },
              "3": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 3",
                "entries": []
              },
              "4": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 4",
                "entries": []
              },
              "5": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 5",
                "entries": []
              },
              "6": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 6",
                "entries": []
              },
              "7": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 7",
                "entries": []
              },
              "8": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 8",
                "entries": []
              },
              "9": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 9",
                "entries": []
              },
              "10": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 10",
                "entries": []
              }
            }
          },
          "payments": {
            "sourceReference": "Fictional spouse complete PA account statement",
            "allCurrentPaymentsReviewedConfirmed": true,
            "estimatedPaymentsStatus": "known_none",
            "extensionPaymentsStatus": "known_none",
            "priorCreditStatus": "known_none",
            "originalReceipts": [],
            "priorReturnStatus": "no_return",
            "priorReturnSourceReference": "Fictional spouse actual no prior return history"
          }
        }
      ],
      "wages": [
        {
          "originalIndex": 0,
          "sourceTaxYear": 2025,
          "accountHolder": "primary",
          "sourceReference": "Fictional original actual W2 0",
          "sourceFactsConfirmed": true,
          "original": {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Avery Employer",
              "ein": "91-0000311"
            },
            "accountHolder": "primary",
            "wages": "50000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "50000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "3100",
            "medicareWages": "50000",
            "medicareWithheld": "725",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "1535",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "50000",
            "state": "PA"
          },
          "originalRecipientSsn": "900-70-0311",
          "currentUncorrectedNonvoidOriginalConfirmed": true,
          "allOriginalBoxesKnownConfirmed": true,
          "ordinaryCashCompensationOnlyConfirmed": true,
          "noPAFederalCompensationDifferencesConfirmed": true,
          "payroll": [
            {
              "sourceReference": "Fictional original dated cash payroll 0",
              "paidOn": "2025-12-31",
              "serviceFrom": "2025-01-01",
              "serviceThrough": "2025-12-31",
              "grossCompensation": "50000",
              "paServicesCompensation": "50000",
              "outsidePAServicesCompensation": "0"
            }
          ]
        },
        {
          "originalIndex": 1,
          "sourceTaxYear": 2025,
          "accountHolder": "spouse",
          "sourceReference": "Fictional original actual W2 1",
          "sourceFactsConfirmed": true,
          "original": {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Morgan Employer",
              "ein": "91-0000312"
            },
            "accountHolder": "spouse",
            "wages": "30000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "30000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "1860",
            "medicareWages": "30000",
            "medicareWithheld": "435",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "368",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "12000",
            "state": "PA"
          },
          "originalRecipientSsn": "900-70-0312",
          "currentUncorrectedNonvoidOriginalConfirmed": true,
          "allOriginalBoxesKnownConfirmed": true,
          "ordinaryCashCompensationOnlyConfirmed": true,
          "noPAFederalCompensationDifferencesConfirmed": true,
          "payroll": [
            {
              "sourceReference": "Fictional actual nonresident mixed services cash payroll",
              "paidOn": "2025-12-31",
              "serviceFrom": "2025-01-01",
              "serviceThrough": "2025-12-31",
              "grossCompensation": "30000",
              "paServicesCompensation": "12000",
              "outsidePAServicesCompensation": "18000"
            }
          ]
        }
      ],
      "coverage": {
        "sourceReference": "Fictional complete original income credit and purchase review",
        "allOtherIncomeClassesKnownNoneConfirmed": true,
        "allEmployeeExpensesAndOtherDeductionsKnownNoneConfirmed": true,
        "allOtherStateTaxesKnownNoneConfirmed": true,
        "allRestrictedCreditsKnownNoneConfirmed": true,
        "allCareExpensesAndEmployerBenefitsKnownNoneConfirmed": true,
        "allNrkStatementsKnownNoneConfirmed": true,
        "allUseTaxPurchasesKnownNoneConfirmed": true,
        "allAgencyReliefKnownNoneConfirmed": true,
        "allDependentSourcesKnownNoneConfirmed": true,
        "localJurisdictions": [
          {
            "name": "Fictional Pittsburgh local residence and work jurisdiction",
            "sourceReference": "Fictional actual separate local obligation",
            "separateReturnRequired": true
          }
        ]
      },
      "timing": {
        "sourceReference": "Fictional current actual preparation timing",
        "kind": "expected",
        "filingDate": "2026-04-15",
        "asOfDate": "2026-03-01",
        "returnKind": "original",
        "filingExtension": "none",
        "paymentExtension": "none"
      },
      "dispositions": [
        {
          "accountHolder": "primary",
          "sourceReference": "Fictional primary actual no-overpayment election",
          "refundRequested": "0",
          "nextYearCreditRequested": "0",
          "donations": [],
          "remainingPayment": {
            "status": "no_remaining_tax",
            "sourceReference": "Fictional primary actual no remaining principal"
          }
        },
        {
          "accountHolder": "spouse",
          "sourceReference": "Fictional spouse actual no-overpayment election",
          "refundRequested": "0",
          "nextYearCreditRequested": "0",
          "donations": [],
          "remainingPayment": {
            "status": "no_remaining_tax",
            "sourceReference": "Fictional spouse actual no remaining principal"
          }
        }
      ],
      "residencySources": {
        "methodVersion": "pa-married-residency-sources-v1",
        "sourceTaxYear": 2025,
        "sourceReference": "Fictional complete separate spouse calendar records",
        "sourceFactsConfirmed": true,
        "owners": [
          {
            "accountHolder": "primary",
            "allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed": true,
            "originalTaxpayer": {
              "firstName": "Avery",
              "lastName": "Pennsylvania",
              "ssn": "900-70-0311"
            },
            "residency": {
              "status": "resident",
              "sourceReference": "Fictional primary actual calendar domicile abode and presence records",
              "factsConfirmed": true,
              "domicilePeriods": [
                {
                  "state": "PA",
                  "from": "2025-01-01",
                  "through": "2025-12-31",
                  "daysInPA": 170
                }
              ],
              "paPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-12-31"
                }
              ],
              "outsidePAPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-12-31"
                }
              ],
              "moveAbandonmentNewDomicileAndPresenceConfirmed": false,
              "dec31PrincipalResidenceState": "PA",
              "schoolDistrictCode": "02745",
              "schoolDistrictName": "Pittsburgh"
            }
          },
          {
            "accountHolder": "spouse",
            "allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed": true,
            "originalTaxpayer": {
              "firstName": "Morgan",
              "lastName": "Pennsylvania",
              "ssn": "900-70-0312"
            },
            "residency": {
              "status": "nonresident",
              "sourceReference": "Fictional spouse actual calendar domicile abode and presence records",
              "factsConfirmed": true,
              "domicilePeriods": [
                {
                  "state": "FL",
                  "from": "2025-01-01",
                  "through": "2025-12-31",
                  "daysInPA": 170
                }
              ],
              "paPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-12-31"
                }
              ],
              "outsidePAPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-12-31"
                }
              ],
              "moveAbandonmentNewDomicileAndPresenceConfirmed": false,
              "dec31PrincipalResidenceState": "FL",
              "schoolDistrictCode": "99999",
              "schoolDistrictName": "Outside Pennsylvania"
            }
          }
        ]
      }
    }
  },
  "part_year": {
    "input": {
      "taxpayer": {
        "taxYear": 2025,
        "filingStatus": "married_filing_jointly",
        "primary": {
          "firstName": "Avery",
          "lastName": "Pennsylvania",
          "ssn": "900-70-0311",
          "dateOfBirth": "1950-04-02",
          "employmentValidSsnIssuedByDueDate": true,
          "tinIssuedByDueDate": true
        },
        "spouse": {
          "firstName": "Morgan",
          "lastName": "Pennsylvania",
          "ssn": "900-70-0312",
          "dateOfBirth": "1952-05-03",
          "employmentValidSsnIssuedByDueDate": true,
          "tinIssuedByDueDate": true
        },
        "address": {
          "street": "10 Fictional Way",
          "city": "Pittsburgh",
          "state": "PA",
          "zip": "15201"
        },
        "dependents": []
      },
      "w2s": [
        {
          "taxYear": 2025,
          "employer": {
            "name": "Fictional Avery Employer",
            "ein": "91-0000311"
          },
          "accountHolder": "primary",
          "wages": "50000",
          "federalWithheld": "0",
          "box12CodeW": "0",
          "box12CodeD": "0",
          "box12CodeE": "0",
          "box12CodeF": "0",
          "box12CodeG": "0",
          "box12CodeH": "0",
          "box12CodeS": "0",
          "box12CodeAA": "0",
          "box12CodeBB": "0",
          "box12CodeEE": "0",
          "box12CodeT": "0",
          "socialSecurityWages": "50000",
          "socialSecurityTips": "0",
          "allocatedTips": "0",
          "socialSecurityWithheld": "3100",
          "medicareWages": "50000",
          "medicareWithheld": "725",
          "box10DependentCareBenefits": "0",
          "stateTaxWithheld": "1535",
          "localWages": "0",
          "localTaxWithheld": "0",
          "stateWages": "50000",
          "state": "PA"
        },
        {
          "taxYear": 2025,
          "employer": {
            "name": "Fictional Morgan Employer",
            "ein": "91-0000312"
          },
          "accountHolder": "spouse",
          "wages": "30000",
          "federalWithheld": "0",
          "box12CodeW": "0",
          "box12CodeD": "0",
          "box12CodeE": "0",
          "box12CodeF": "0",
          "box12CodeG": "0",
          "box12CodeH": "0",
          "box12CodeS": "0",
          "box12CodeAA": "0",
          "box12CodeBB": "0",
          "box12CodeEE": "0",
          "box12CodeT": "0",
          "socialSecurityWages": "30000",
          "socialSecurityTips": "0",
          "allocatedTips": "0",
          "socialSecurityWithheld": "1860",
          "medicareWages": "30000",
          "medicareWithheld": "435",
          "box10DependentCareBenefits": "0",
          "stateTaxWithheld": "553",
          "localWages": "0",
          "localTaxWithheld": "0",
          "stateWages": "18000",
          "state": "PA"
        }
      ],
      "form1099Int": [],
      "form1099Div": [],
      "form1099B": [],
      "form1099DA": [],
      "form1099Nec": [],
      "form1099Misc": [],
      "form1099G": [],
      "form1099OID": [],
      "formW2G": [],
      "form1099K": [],
      "form1099C": [],
      "form1099Q": [],
      "scheduleK1": [],
      "scheduleK1Form1041": [],
      "form1098": [],
      "form1098E": [],
      "form1095A": [],
      "donations": [],
      "rentalProperties": [],
      "standardDeductionFacts": {
        "primaryBlind": false,
        "spouseBlind": false,
        "primaryCanBeClaimedAsDependent": false,
        "spouseCanBeClaimedAsDependent": false,
        "spouseItemizes": false,
        "dualStatusAlien": false,
        "nonresidentAlien": false,
        "shortTaxYear": false,
        "primaryDeathDate": null,
        "spouseDeathDate": null,
        "claimSpouseAdditionalDeduction": false
      },
      "savingsBondRedemptions": [],
      "form6252": [],
      "form8814": [],
      "homeSales": [],
      "form8824": [],
      "eic": {
        "claimantEligibility": {
          "sourceTaxYear": 2025,
          "sourceReference": "Fictional actual taxpayer and spouse childless eligibility records",
          "sourceFactsConfirmed": true,
          "primaryNonresidentAlienDuringYear": false,
          "primaryQualifyingChildOfAnotherTaxpayer": false,
          "spouseNonresidentAlienDuringYear": false,
          "spouseQualifyingChildOfAnotherTaxpayer": false,
          "primaryChildless": {
            "mainHomeInUnitedStatesMoreThanHalfYear": true,
            "countedMilitaryDutyOutsideUnitedStates": false
          },
          "spouseChildless": {
            "mainHomeInUnitedStatesMoreThanHalfYear": true,
            "countedMilitaryDutyOutsideUnitedStates": false
          }
        },
        "disallowanceSources": {
          "sourceTaxYear": 2025,
          "sourceReference": "Fictional complete IRS and filed-return records",
          "sourceFactsConfirmed": true,
          "claimStatus": "preparing",
          "reviewedThroughDate": "2026-03-01",
          "preparationAsOfDate": "2026-03-01",
          "filers": [
            {
              "owner": "primary",
              "originalTaxpayer": {
                "firstName": "Avery",
                "lastName": "Pennsylvania",
                "ssn": "900-70-0311"
              },
              "sourceReference": "Fictional primary complete history",
              "sourceFactsConfirmed": true,
              "allHistoryIncluded": true,
              "denials": [],
              "laterAllowances": []
            },
            {
              "owner": "spouse",
              "originalTaxpayer": {
                "firstName": "Morgan",
                "lastName": "Pennsylvania",
                "ssn": "900-70-0312"
              },
              "sourceReference": "Fictional spouse complete history",
              "sourceFactsConfirmed": true,
              "allHistoryIncluded": true,
              "denials": [],
              "laterAllowances": []
            }
          ]
        }
      }
    },
    "sources": {
      "sourceTaxYear": 2025,
      "sourceReference": "Fictional actual complete married household",
      "sourceFactsConfirmed": true,
      "originalFederalSources": {
        "taxpayer": {
          "taxYear": 2025,
          "filingStatus": "married_filing_jointly",
          "primary": {
            "firstName": "Avery",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0311",
            "dateOfBirth": "1950-04-02",
            "employmentValidSsnIssuedByDueDate": true,
            "tinIssuedByDueDate": true
          },
          "spouse": {
            "firstName": "Morgan",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0312",
            "dateOfBirth": "1952-05-03",
            "employmentValidSsnIssuedByDueDate": true,
            "tinIssuedByDueDate": true
          },
          "address": {
            "street": "10 Fictional Way",
            "city": "Pittsburgh",
            "state": "PA",
            "zip": "15201"
          },
          "dependents": []
        },
        "w2s": [
          {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Avery Employer",
              "ein": "91-0000311"
            },
            "accountHolder": "primary",
            "wages": "50000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "50000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "3100",
            "medicareWages": "50000",
            "medicareWithheld": "725",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "1535",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "50000",
            "state": "PA"
          },
          {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Morgan Employer",
              "ein": "91-0000312"
            },
            "accountHolder": "spouse",
            "wages": "30000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "30000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "1860",
            "medicareWages": "30000",
            "medicareWithheld": "435",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "553",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "18000",
            "state": "PA"
          }
        ],
        "form1099Int": [],
        "form1099Div": [],
        "form1099B": [],
        "form1099DA": [],
        "form1099Nec": [],
        "form1099Misc": [],
        "form1099G": [],
        "form1099OID": [],
        "formW2G": [],
        "form1099K": [],
        "form1099C": [],
        "form1099Q": [],
        "scheduleK1": [],
        "scheduleK1Form1041": [],
        "form1098": [],
        "form1098E": [],
        "form1095A": [],
        "donations": [],
        "rentalProperties": [],
        "standardDeductionFacts": {
          "primaryBlind": false,
          "spouseBlind": false,
          "primaryCanBeClaimedAsDependent": false,
          "spouseCanBeClaimedAsDependent": false,
          "spouseItemizes": false,
          "dualStatusAlien": false,
          "nonresidentAlien": false,
          "shortTaxYear": false,
          "primaryDeathDate": null,
          "spouseDeathDate": null,
          "claimSpouseAdditionalDeduction": false
        },
        "savingsBondRedemptions": [],
        "form6252": [],
        "form8814": [],
        "homeSales": [],
        "form8824": [],
        "eic": {
          "claimantEligibility": {
            "sourceTaxYear": 2025,
            "sourceReference": "Fictional actual taxpayer and spouse childless eligibility records",
            "sourceFactsConfirmed": true,
            "primaryNonresidentAlienDuringYear": false,
            "primaryQualifyingChildOfAnotherTaxpayer": false,
            "spouseNonresidentAlienDuringYear": false,
            "spouseQualifyingChildOfAnotherTaxpayer": false,
            "primaryChildless": {
              "mainHomeInUnitedStatesMoreThanHalfYear": true,
              "countedMilitaryDutyOutsideUnitedStates": false
            },
            "spouseChildless": {
              "mainHomeInUnitedStatesMoreThanHalfYear": true,
              "countedMilitaryDutyOutsideUnitedStates": false
            }
          },
          "disallowanceSources": {
            "sourceTaxYear": 2025,
            "sourceReference": "Fictional complete IRS and filed-return records",
            "sourceFactsConfirmed": true,
            "claimStatus": "preparing",
            "reviewedThroughDate": "2026-03-01",
            "preparationAsOfDate": "2026-03-01",
            "filers": [
              {
                "owner": "primary",
                "originalTaxpayer": {
                  "firstName": "Avery",
                  "lastName": "Pennsylvania",
                  "ssn": "900-70-0311"
                },
                "sourceReference": "Fictional primary complete history",
                "sourceFactsConfirmed": true,
                "allHistoryIncluded": true,
                "denials": [],
                "laterAllowances": []
              },
              {
                "owner": "spouse",
                "originalTaxpayer": {
                  "firstName": "Morgan",
                  "lastName": "Pennsylvania",
                  "ssn": "900-70-0312"
                },
                "sourceReference": "Fictional spouse complete history",
                "sourceFactsConfirmed": true,
                "allHistoryIncluded": true,
                "denials": [],
                "laterAllowances": []
              }
            ]
          }
        }
      },
      "filingMode": "M",
      "owners": [
        {
          "accountHolder": "primary",
          "originalTaxpayer": {
            "firstName": "Avery",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0311"
          },
          "sourceReference": "Fictional primary actual household originals",
          "factsConfirmed": true,
          "taxYearFrom": "2025-01-01",
          "taxYearThrough": "2025-12-31",
          "aliveEntireYear": true,
          "marriedAndLivedTogetherEntireYearConfirmed": true,
          "cohabitationFrom": "2025-01-01",
          "cohabitationThrough": "2025-12-31",
          "claimedAsDependentOnAnotherReturn": false,
          "individualSupportDhsLiability": false,
          "individualCourtObligation": false,
          "residency": {
            "sourceReference": "Fictional legacy residency summary intentionally unconfirmed",
            "factsConfirmed": false,
            "domicileState": "",
            "domicileFrom": "",
            "domicileThrough": "",
            "paAbodeFrom": "",
            "paAbodeThrough": "",
            "actualDaysInPA": null,
            "dec31SchoolDistrictCode": "",
            "dec31SchoolDistrictName": ""
          },
          "sp": {
            "sourceReference": "Fictional primary complete worldwide source history",
            "allWorldwideSourcesCompleteConfirmed": true,
            "categories": {
              "2": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 2",
                "entries": []
              },
              "3": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 3",
                "entries": []
              },
              "4": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 4",
                "entries": []
              },
              "5": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 5",
                "entries": []
              },
              "6": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 6",
                "entries": []
              },
              "7": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 7",
                "entries": []
              },
              "8": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 8",
                "entries": []
              },
              "9": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 9",
                "entries": []
              },
              "10": {
                "status": "known_none",
                "sourceReference": "Fictional primary SP category 10",
                "entries": []
              }
            }
          },
          "payments": {
            "sourceReference": "Fictional primary complete PA account statement",
            "allCurrentPaymentsReviewedConfirmed": true,
            "estimatedPaymentsStatus": "known_none",
            "extensionPaymentsStatus": "known_none",
            "priorCreditStatus": "known_none",
            "originalReceipts": [],
            "priorReturnStatus": "no_return",
            "priorReturnSourceReference": "Fictional primary actual no prior return history"
          }
        },
        {
          "accountHolder": "spouse",
          "originalTaxpayer": {
            "firstName": "Morgan",
            "lastName": "Pennsylvania",
            "ssn": "900-70-0312"
          },
          "sourceReference": "Fictional spouse actual household originals",
          "factsConfirmed": true,
          "taxYearFrom": "2025-01-01",
          "taxYearThrough": "2025-12-31",
          "aliveEntireYear": true,
          "marriedAndLivedTogetherEntireYearConfirmed": true,
          "cohabitationFrom": "2025-01-01",
          "cohabitationThrough": "2025-12-31",
          "claimedAsDependentOnAnotherReturn": false,
          "individualSupportDhsLiability": false,
          "individualCourtObligation": false,
          "residency": {
            "sourceReference": "Fictional legacy residency summary intentionally unconfirmed",
            "factsConfirmed": false,
            "domicileState": "",
            "domicileFrom": "",
            "domicileThrough": "",
            "paAbodeFrom": "",
            "paAbodeThrough": "",
            "actualDaysInPA": null,
            "dec31SchoolDistrictCode": "",
            "dec31SchoolDistrictName": ""
          },
          "sp": {
            "sourceReference": "Fictional spouse complete worldwide source history",
            "allWorldwideSourcesCompleteConfirmed": true,
            "categories": {
              "2": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 2",
                "entries": []
              },
              "3": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 3",
                "entries": []
              },
              "4": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 4",
                "entries": []
              },
              "5": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 5",
                "entries": []
              },
              "6": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 6",
                "entries": []
              },
              "7": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 7",
                "entries": []
              },
              "8": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 8",
                "entries": []
              },
              "9": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 9",
                "entries": []
              },
              "10": {
                "status": "known_none",
                "sourceReference": "Fictional spouse SP category 10",
                "entries": []
              }
            }
          },
          "payments": {
            "sourceReference": "Fictional spouse complete PA account statement",
            "allCurrentPaymentsReviewedConfirmed": true,
            "estimatedPaymentsStatus": "known_none",
            "extensionPaymentsStatus": "known_none",
            "priorCreditStatus": "known_none",
            "originalReceipts": [],
            "priorReturnStatus": "no_return",
            "priorReturnSourceReference": "Fictional spouse actual no prior return history"
          }
        }
      ],
      "wages": [
        {
          "originalIndex": 0,
          "sourceTaxYear": 2025,
          "accountHolder": "primary",
          "sourceReference": "Fictional original actual W2 0",
          "sourceFactsConfirmed": true,
          "original": {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Avery Employer",
              "ein": "91-0000311"
            },
            "accountHolder": "primary",
            "wages": "50000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "50000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "3100",
            "medicareWages": "50000",
            "medicareWithheld": "725",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "1535",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "50000",
            "state": "PA"
          },
          "originalRecipientSsn": "900-70-0311",
          "currentUncorrectedNonvoidOriginalConfirmed": true,
          "allOriginalBoxesKnownConfirmed": true,
          "ordinaryCashCompensationOnlyConfirmed": true,
          "noPAFederalCompensationDifferencesConfirmed": true,
          "payroll": [
            {
              "sourceReference": "Fictional original dated cash payroll 0",
              "paidOn": "2025-12-31",
              "serviceFrom": "2025-01-01",
              "serviceThrough": "2025-12-31",
              "grossCompensation": "50000",
              "paServicesCompensation": "50000",
              "outsidePAServicesCompensation": "0"
            }
          ]
        },
        {
          "originalIndex": 1,
          "sourceTaxYear": 2025,
          "accountHolder": "spouse",
          "sourceReference": "Fictional original actual W2 1",
          "sourceFactsConfirmed": true,
          "original": {
            "taxYear": 2025,
            "employer": {
              "name": "Fictional Morgan Employer",
              "ein": "91-0000312"
            },
            "accountHolder": "spouse",
            "wages": "30000",
            "federalWithheld": "0",
            "box12CodeW": "0",
            "box12CodeD": "0",
            "box12CodeE": "0",
            "box12CodeF": "0",
            "box12CodeG": "0",
            "box12CodeH": "0",
            "box12CodeS": "0",
            "box12CodeAA": "0",
            "box12CodeBB": "0",
            "box12CodeEE": "0",
            "box12CodeT": "0",
            "socialSecurityWages": "30000",
            "socialSecurityTips": "0",
            "allocatedTips": "0",
            "socialSecurityWithheld": "1860",
            "medicareWages": "30000",
            "medicareWithheld": "435",
            "box10DependentCareBenefits": "0",
            "stateTaxWithheld": "553",
            "localWages": "0",
            "localTaxWithheld": "0",
            "stateWages": "18000",
            "state": "PA"
          },
          "originalRecipientSsn": "900-70-0312",
          "currentUncorrectedNonvoidOriginalConfirmed": true,
          "allOriginalBoxesKnownConfirmed": true,
          "ordinaryCashCompensationOnlyConfirmed": true,
          "noPAFederalCompensationDifferencesConfirmed": true,
          "payroll": [
            {
              "sourceReference": "Fictional actual first half nonresident cash payroll",
              "paidOn": "2025-06-30",
              "serviceFrom": "2025-01-01",
              "serviceThrough": "2025-06-30",
              "grossCompensation": "15000",
              "paServicesCompensation": "3000",
              "outsidePAServicesCompensation": "12000"
            },
            {
              "sourceReference": "Fictional actual second half resident cash payroll",
              "paidOn": "2025-12-31",
              "serviceFrom": "2025-07-01",
              "serviceThrough": "2025-12-31",
              "grossCompensation": "15000",
              "paServicesCompensation": "6000",
              "outsidePAServicesCompensation": "9000"
            }
          ]
        }
      ],
      "coverage": {
        "sourceReference": "Fictional complete original income credit and purchase review",
        "allOtherIncomeClassesKnownNoneConfirmed": true,
        "allEmployeeExpensesAndOtherDeductionsKnownNoneConfirmed": true,
        "allOtherStateTaxesKnownNoneConfirmed": true,
        "allRestrictedCreditsKnownNoneConfirmed": true,
        "allCareExpensesAndEmployerBenefitsKnownNoneConfirmed": true,
        "allNrkStatementsKnownNoneConfirmed": true,
        "allUseTaxPurchasesKnownNoneConfirmed": true,
        "allAgencyReliefKnownNoneConfirmed": true,
        "allDependentSourcesKnownNoneConfirmed": true,
        "localJurisdictions": [
          {
            "name": "Fictional Pittsburgh local residence and work jurisdiction",
            "sourceReference": "Fictional actual separate local obligation",
            "separateReturnRequired": true
          }
        ]
      },
      "timing": {
        "sourceReference": "Fictional current actual preparation timing",
        "kind": "expected",
        "filingDate": "2026-04-15",
        "asOfDate": "2026-03-01",
        "returnKind": "original",
        "filingExtension": "none",
        "paymentExtension": "none"
      },
      "dispositions": [
        {
          "accountHolder": "primary",
          "sourceReference": "Fictional primary actual no-overpayment election",
          "refundRequested": "0",
          "nextYearCreditRequested": "0",
          "donations": [],
          "remainingPayment": {
            "status": "no_remaining_tax",
            "sourceReference": "Fictional primary actual no remaining principal"
          }
        },
        {
          "accountHolder": "spouse",
          "sourceReference": "Fictional spouse actual no-overpayment election",
          "refundRequested": "0",
          "nextYearCreditRequested": "0",
          "donations": [],
          "remainingPayment": {
            "status": "no_remaining_tax",
            "sourceReference": "Fictional spouse actual no remaining principal"
          }
        }
      ],
      "residencySources": {
        "methodVersion": "pa-married-residency-sources-v1",
        "sourceTaxYear": 2025,
        "sourceReference": "Fictional complete separate spouse calendar records",
        "sourceFactsConfirmed": true,
        "owners": [
          {
            "accountHolder": "primary",
            "allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed": true,
            "originalTaxpayer": {
              "firstName": "Avery",
              "lastName": "Pennsylvania",
              "ssn": "900-70-0311"
            },
            "residency": {
              "status": "resident",
              "sourceReference": "Fictional primary actual calendar domicile abode and presence records",
              "factsConfirmed": true,
              "domicilePeriods": [
                {
                  "state": "PA",
                  "from": "2025-01-01",
                  "through": "2025-12-31",
                  "daysInPA": 170
                }
              ],
              "paPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-12-31"
                }
              ],
              "outsidePAPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-12-31"
                }
              ],
              "moveAbandonmentNewDomicileAndPresenceConfirmed": false,
              "dec31PrincipalResidenceState": "PA",
              "schoolDistrictCode": "02745",
              "schoolDistrictName": "Pittsburgh"
            }
          },
          {
            "accountHolder": "spouse",
            "allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed": true,
            "originalTaxpayer": {
              "firstName": "Morgan",
              "lastName": "Pennsylvania",
              "ssn": "900-70-0312"
            },
            "residency": {
              "status": "part_year",
              "sourceReference": "Fictional spouse actual calendar domicile abode and presence records",
              "factsConfirmed": true,
              "domicilePeriods": [
                {
                  "state": "FL",
                  "from": "2025-01-01",
                  "through": "2025-06-30",
                  "daysInPA": 15
                },
                {
                  "state": "PA",
                  "from": "2025-07-01",
                  "through": "2025-12-31",
                  "daysInPA": 150
                }
              ],
              "paPermanentAbodePeriods": [
                {
                  "from": "2025-07-01",
                  "through": "2025-12-31"
                }
              ],
              "outsidePAPermanentAbodePeriods": [
                {
                  "from": "2025-01-01",
                  "through": "2025-06-30"
                }
              ],
              "moveAbandonmentNewDomicileAndPresenceConfirmed": true,
              "dec31PrincipalResidenceState": "PA",
              "schoolDistrictCode": "02745",
              "schoolDistrictName": "Pittsburgh"
            }
          }
        ]
      }
    }
  }
};
export function paMarriedResidencyNativeFixture(kind:'nonresident'|'part_year'='nonresident'){const f=structuredClone(examples[kind]);return{input:TaxYearInputSchema.parse(f.input),sources:PAMarriedOrdinarySourcesSchema.parse(f.sources)};}
