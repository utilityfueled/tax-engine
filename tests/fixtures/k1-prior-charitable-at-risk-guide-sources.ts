import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';

/** Fictional original filed records shared by browser and source tests; no calculated allowance. */
export function guidedK1PriorRiskSources(): { charity: K1CharitableSourcesData; qualifiedLoss: K1LossSourcesData } {
    return {
      "charity": {
        "sourceTaxYear": "2025",
        "sourceReference": "Fictional complete K1 attachments",
        "sourceFactsConfirmed": true,
        "allK1CharitableSourcesIncluded": true,
        "statements": [
          {
            "k1SourceId": "scheduleK1:0",
            "sameRegularAmtTreatmentConfirmed": true,
            "basis": {
              "sourceTaxYear": "2025",
              "statementYearStart": "2025-01-01",
              "statementYearEnd": "2025-12-31",
              "sourceReference": "Fictional original basis worksheet",
              "sourceFactsConfirmed": true,
              "entityName": "Actual ordinary activity",
              "entityEIN": "12-3456789",
              "entityType": "partnership",
              "accountHolder": "primary",
              "recipientName": "Jordan Source",
              "recipientTaxpayerIdLast4": "6789",
              "basisFactsConfirmed": true,
              "noOtherBasisChangesConfirmed": true,
              "cashDistributionsOnlyConfirmed": true,
              "priorBasisHistoryComplete": true,
              "currentContributions": [
                {
                  "sourceId": "gift-1",
                  "category": "cash_60",
                  "contributionDate": "2025-06-01",
                  "contributionShare": "10000",
                  "adjustedBasisShare": "10000",
                  "sourceReference": "Fictional allocated gift statement"
                }
              ],
              "priorBasisSuspensions": []
            },
            "receipts": [
              {
                "basisSourceId": "gift-1",
                "originalBox": "13",
                "originalCode": "A",
                "recipientName": "Fictional Public Charity",
                "recipientCategory": "fifty-percent",
                "qualifiedOrganization": true,
                "donorAdvisedFund": false,
                "supportingOrganization": false,
                "sourceReference": "Fictional original receipt",
                "contributionDate": "2025-06-01"
              }
            ],
            "atRisk": {
              "sourceTaxYear": "2025",
              "sourceReference": "Fictional complete activity worksheet",
              "sourceFactsConfirmed": true,
              "simplifiedMethodEligible": true,
              "allActivityDeductionsIncluded": true,
              "computation": "subsequent_year",
              "adjustedBasisAtEffectiveDate": "0",
              "priorYearAmountAtRisk": "20000",
              "currentYearIncreases": "0",
              "currentYearDecreases": "0",
              "priorLossHistory": {
                "sourceTaxYear": "2024",
                "sourceReference": "Fictional original2024 Form6198 totals",
                "sourceFactsConfirmed": true,
                "vintages": [
                  {
                    "taxYear": "2022",
                    "amount": "20000"
                  },
                  {
                    "taxYear": "2024",
                    "amount": "10000"
                  }
                ],
                "characterSources": {
                  "sourceTaxYear": "2024",
                  "sourceReference": "Fictional character and use attachment",
                  "sourceFactsConfirmed": true,
                  "sameOwnerAndActivityConfirmed": true,
                  "recipientName": "Jordan Source",
                  "recipientTaxpayerIdLast4": "6789",
                  "entityName": "Actual ordinary activity",
                  "entityEIN": "12-3456789",
                  "records": [
                    {
                      "sourceId": "old-ordinary",
                      "taxYear": "2022",
                      "character": "ordinary",
                      "sourceReference": "Fictional2022 original ordinary deduction",
                      "basisLimitationAlreadyAppliedConfirmed": true,
                      "originalPostBasisDeduction": "60000",
                      "originalDisallowedAmount": "40000",
                      "useHistory": [
                        {
                          "taxYear": "2023",
                          "amountAllowed": "10000"
                        },
                        {
                          "taxYear": "2024",
                          "amountAllowed": "10000"
                        }
                      ]
                    },
                    {
                      "sourceId": "old-cash-risk",
                      "taxYear": "2024",
                      "character": "charitable",
                      "sourceReference": "Fictional2024 original cash deduction",
                      "basisLimitationAlreadyAppliedConfirmed": true,
                      "originalPostBasisDeduction": "10000",
                      "originalDisallowedAmount": "10000",
                      "useHistory": [],
                      "gift": {
                        "basisSourceId": "old-cash",
                        "basisOriginTaxYear": "2024",
                        "category": "cash_60",
                        "contributionShare": "10000",
                        "receipt": {
                          "basisSourceId": "old-cash",
                          "originalBox": "13",
                          "originalCode": "A",
                          "recipientName": "Fictional Public Charity",
                          "recipientCategory": "fifty-percent",
                          "qualifiedOrganization": true,
                          "donorAdvisedFund": false,
                          "supportingOrganization": false,
                          "sourceReference": "Fictional original receipt",
                          "contributionDate": "2024-06-01"
                        }
                      }
                    }
                  ]
                }
              },
              "activityAllocation": {
                "sourceTaxYear": "2025",
                "sourceReference": "Fictional item-by-item original activity assignment",
                "sourceFactsConfirmed": true,
                "allOriginalItemsBelongToActivityConfirmed": true,
                "charitableSourceIds": [
                  "old-cash"
                ]
              }
            },
            "original": {
              "taxYear": "2025",
              "partnershipName": "Actual ordinary activity",
              "partnershipEIN": "12-3456789",
              "accountHolder": "primary",
              "ordinaryIncome": "-40000",
              "njPassThroughBusinessAlternativeIncomeTaxCredit": "0",
              "netRentalIncome": "0",
              "otherNetRentalIncome": "0",
              "guaranteedPayments": "0",
              "interestIncome": "0",
              "ordinaryDividends": "0",
              "qualifiedDividends": "0",
              "royalties": "0",
              "netShortTermCapitalGain": "0",
              "netLongTermCapitalGain": "20000",
              "unrecapturedSection1250Gain": "0",
              "collectiblesGain": "0",
              "section1231Gain": "0",
              "otherIncome": "0",
              "section179Deduction": "0",
              "otherDeductions": "0",
              "charitableCash": "10000",
              "charitableCapitalGain30": "0",
              "charitableCapitalGain20": "0",
              "investmentInterestExpense": "0",
              "excessBusinessInterest": "0",
              "selfEmploymentEarnings": "0",
              "selfEmploymentFactsConfirmed": true,
              "selfEmploymentNetEarningsAfterAdjustments": "0",
              "selfEmploymentIncomeType": "nonfarm",
              "foreignTaxPaid": "0",
              "foreignTaxCategory": "general",
              "amtDepreciationAdjustment": "0",
              "amtAdjustedGainOrLoss": "0",
              "amtDepletion": "0",
              "amtOtherItems": "0",
              "taxExemptInterest": "0",
              "otherTaxExemptIncome": "0",
              "nondeductibleExpenses": "0",
              "distributions": "0",
              "investmentIncome": "0",
              "investmentExpenses": "0",
              "excessTaxableIncome": "0",
              "excessBusinessInterestIncome": "0",
              "qbiMateriallyParticipated": true,
              "section199AQBI": "0",
              "section199AW2Wages": "0",
              "section199AUBIA": "0",
              "section199AIsSST": false,
              "section199AQualifiedReitDividends": "0",
              "section199AQualifiedPTPIncome": "0",
              "section199APTPW2Wages": "0",
              "section199APTPUBIA": "0",
              "section199APTPIsSST": false,
              "lowIncomeHousingCredit42j5": "0",
              "lowIncomeHousingCreditOther": "0",
              "qualifiedRehabilitationExpenditures": "0",
              "otherRentalRealEstateCredits": "0",
              "otherRentalCredits": "0",
              "otherCredits": "0",
              "isPassiveActivity": false,
              "isPubliclyTradedPartnership": false,
              "ptpFullyDisposedInTaxableTransaction": false,
              "ptpDispositionGainOrLoss": "0",
              "isForeignPartnership": false,
              "form6198": {
                "activityName": "Actual ordinary activity",
                "ordinaryIncome": "-60000",
                "gainLossFromDispositions": "20000",
                "otherIncomeGains": "0",
                "otherDeductionsLosses": "10000",
                "adjustedBasisAtEffectiveDate": "0",
                "currentYearIncreases": "0",
                "currentYearDecreases": "0",
                "priorYearAmountAtRisk": "20000"
              },
              "entityType": "partnership",
              "beginningBasis": "50000",
              "priorSuspendedLosses": {
                "ordinary": "0",
                "charitable": "0"
              },
              "election1367": false,
              "federalIncomeTaxWithheld": "0"
            },
            "link": "qbi",
            "qbiSourceId": "scheduleK1:0",
            "originalSourceReference": "Fictional original K1 with separate prior history",
            "allUnlistedAmountsZeroConfirmed": true,
            "domesticContinuingNonPtpConfirmed": true
          }
        ]
      },
      "qualifiedLoss": {
        "sourceTaxYear": "2025",
        "sourceReference": "Complete actual K1 source set",
        "sourceFactsConfirmed": true,
        "allK1ActivitiesIncluded": true,
        "activities": [
          {
            "k1SourceId": "scheduleK1:0",
            "sourceTaxYear": "2025",
            "sourceReference": "Original K1 and199A attachment",
            "accountHolder": "primary",
            "entityType": "partnership",
            "entityName": "Actual ordinary activity",
            "entityEIN": "12-3456789",
            "recipientName": "Jordan Source",
            "recipientTaxpayerIdLast4": "6789",
            "ordinaryBusinessOnlyConfirmed": true,
            "continuingActivityConfirmed": true,
            "statement": {
              "ordinaryIncome": "-40000",
              "section199AQBI": "0",
              "section199AW2Wages": "0",
              "section199AUBIA": "0",
              "selfEmploymentEarnings": "0",
              "selfEmploymentNetEarningsAfterAdjustments": "0",
              "selfEmploymentIncomeType": "nonfarm",
              "section199AIsSST": false,
              "isPassiveActivity": false,
              "qbiMateriallyParticipated": true
            },
            "basis": {
              "sourceTaxYear": "2024",
              "sourceReference": "Actual year-end outside-basis worksheet",
              "sourceFactsConfirmed": true,
              "beginningBasis": "50000",
              "noOtherBasisChangesConfirmed": true,
              "priorSuspendedLoss": "0"
            },
            "atRisk": {
              "sourceTaxYear": "2025",
              "sourceReference": "Actual simplified6198 source worksheet",
              "sourceFactsConfirmed": true,
              "simplifiedMethodEligible": true,
              "adjustedBasisAtEffectiveDate": "0",
              "priorYearAmountAtRisk": "20000",
              "currentYearIncreases": "0",
              "currentYearDecreases": "0",
              "priorSuspendedLoss": "20000",
              "priorLossHistory": {
                "sourceTaxYear": "2024",
                "sourceReference": "Fictional filed QBI465 character ledger",
                "sourceFactsConfirmed": true,
                "vintages": [
                  {
                    "taxYear": "2022",
                    "originalLoss": "40000",
                    "qualifiedOriginalLoss": "40000",
                    "remainingLoss": "20000",
                    "qualifiedRemainingLoss": "20000",
                    "materiallyParticipatedInCurrentYear": true
                  }
                ]
              }
            },
            "priorPassiveLoss": "0",
            "sameOwnerHistoryConfirmed": true,
            "sameRegularAmtTreatmentConfirmed": true,
            "allOtherAmountsZeroConfirmed": false,
            "allOtherNonCharitableAmountsZeroConfirmed": false,
            "domesticNonPtpConfirmed": true,
            "passiveHistory": {
              "sourceTaxYear": "2024",
              "sourceReference": "Prior filed passive/QBI worksheet",
              "sourceFactsConfirmed": true,
              "vintages": []
            },
            "selfEmploymentTreatment": {
              "sourceTaxYear": "2025",
              "sourceReference": "Fictional current zero partner earnings record",
              "sourceFactsConfirmed": true,
              "method": "ordinary_current",
              "noOtherPartnerAdjustmentsConfirmed": true,
              "priorLossHistory": {
                "sourceTaxYear": "2024",
                "sourceReference": "Fictional independent zero prior SE record",
                "sourceFactsConfirmed": true,
                "amount": "0"
              }
            }
          }
        ],
        "form461Classification": {
          "method": "ordinary_k1_only",
          "sourceTaxYear": "2025",
          "sourceReference": "Actual complete business classification",
          "sourceFactsConfirmed": true,
          "allNonEmployeeBusinessSourcesIncluded": true,
          "capitalIncomeIsNonbusiness": true,
          "otherBusinessIncome": "0",
          "otherBusinessDeductions": "0"
        },
        "excessBusinessLossHistories": [],
        "allExcessBusinessLossHistoriesIncluded": true,
        "priorQbiCarry": {
          "sourceTaxYear": "2024", "sourceReference": "Fictional completed2024 Form8995 ordinary carry record", "sourceFactsConfirmed": true,
          "returnSourceId": "fictional-jordan-source-2024", "formKind": "form_8995_line_16", "primaryName": "Jordan Source", "primaryTaxpayerIdLast4": "6789",
          "sameFilingUnit": { "priorFilingStatus": "single", "sameTaxpayersConfirmed": true }, "lossCarryforward": "0"
        }
      }
    };
}
