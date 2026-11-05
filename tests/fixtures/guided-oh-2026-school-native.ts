/** Fictional retained actual originals; expected projections are separate test literals. */
import { TaxYearInputSchema } from '@/models/inputs';
import { Ohio2026SchoolSourcesSchema } from '@/models/ohio-2026-school-sources';
const original = {
    "input": {
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
            "taxYear": 2026,
            "filingStatus": "single",
            "primary": {
                "firstName": "Private",
                "lastName": "Employee",
                "ssn": "900-70-0901",
                "dateOfBirth": "1990-01-15"
            },
            "address": {
                "street": "101 Fictional School Road",
                "city": "Fictional Town",
                "state": "OH",
                "zip": "44805"
            },
            "dependents": []
        },
        "w2s": [
            {
                "accountHolder": "primary",
                "taxYear": 2026,
                "employer": {
                    "name": "Fictional Corporation 1",
                    "ein": "90-7000901"
                },
                "wages": "50000",
                "federalWithheld": "0",
                "socialSecurityWages": "50000",
                "socialSecurityTips": "0",
                "allocatedTips": "0",
                "socialSecurityWithheld": "3100.00",
                "medicareWages": "50000",
                "medicareWithheld": "725.00",
                "box10DependentCareBenefits": "0",
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
                "state": "OH",
                "stateWages": "50000",
                "stateTaxWithheld": "1000",
                "localWages": "50000",
                "localTaxWithheld": "625.25",
                "localityName": "0302 Hillsdale LSD",
                "stateLocalSources": {
                    "sourceTaxYear": 2026,
                    "sourceReference": "PRIVATE-CURRENT-W2-0",
                    "sourceFactsConfirmed": true,
                    "owner": {
                        "accountHolder": "primary",
                        "originalTaxpayer": {
                            "firstName": "Private",
                            "lastName": "Employee",
                            "ssn": "900-70-0901"
                        }
                    },
                    "originalW2": {
                        "accountHolder": "primary",
                        "taxYear": 2026,
                        "employer": {
                            "name": "Fictional Corporation 1",
                            "ein": "90-7000901"
                        },
                        "wages": "50000",
                        "federalWithheld": "0",
                        "socialSecurityWages": "50000",
                        "socialSecurityTips": "0",
                        "allocatedTips": "0",
                        "socialSecurityWithheld": "3100.00",
                        "medicareWages": "50000",
                        "medicareWithheld": "725.00",
                        "box10DependentCareBenefits": "0",
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
                        "state": "OH",
                        "stateWages": "50000",
                        "stateTaxWithheld": "1000",
                        "localWages": "50000",
                        "localTaxWithheld": "625.25",
                        "localityName": "0302 Hillsdale LSD"
                    },
                    "currentUncorrectedNonvoidOriginalConfirmed": true,
                    "allOriginalBoxesKnownConfirmed": true,
                    "singleOriginalWithoutContinuationConfirmed": true,
                    "allOriginalPagesAndCopiesCheckedConfirmed": true,
                    "stateReporting": "single",
                    "localReporting": "single",
                    "legacyScalarProjection": "first_entered_rows",
                    "stateRows": [
                        {
                            "printedRow": 1,
                            "sourceReference": "PRIVATE-OH-ROW-0",
                            "state": "OH",
                            "employerStateIDStatus": "reported",
                            "employerStateID": "PRIVATE-ID-0",
                            "wages": "50000",
                            "withheld": "1000"
                        }
                    ],
                    "localRows": [
                        {
                            "printedRow": 1,
                            "sourceReference": "PRIVATE-LOCAL-ORIGINAL-1",
                            "localityNameStatus": "reported",
                            "localityName": "0302 Hillsdale LSD",
                            "wages": "50000",
                            "withheld": "625.25"
                        }
                    ]
                }
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
        "donations": [],
        "ohioResidency": {
            "taxYear": 2026,
            "sourceReference": "PRIVATE-ALL-CURRENT-DOMICILE-ORIGINALS",
            "sourceFactsConfirmed": true,
            "allFederalSourcesIncludedConfirmed": true,
            "noBusinessIncomeConfirmed": true,
            "schoolDistrictStatus": "actual_district_sources_required",
            "owners": [
                {
                    "accountHolder": "primary",
                    "status": "full_year_resident",
                    "sourceReference": "PRIVATE-DOMICILE-0",
                    "periods": [
                        {
                            "from": "2026-01-01",
                            "to": "2026-12-31",
                            "domicileState": "OH"
                        }
                    ],
                    "amounts": {
                        "wages": {
                            "federalAmount": "50000",
                            "residentAmount": "50000",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-wages"
                        },
                        "capitalGains": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-capitalGains"
                        },
                        "rentsRoyalties": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-rentsRoyalties"
                        },
                        "gambling": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-gambling"
                        },
                        "interestDividends": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-interestDividends"
                        },
                        "pensions": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-pensions"
                        },
                        "unemployment": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-unemployment"
                        },
                        "otherIncome": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-otherIncome"
                        },
                        "federalAdjustments": {
                            "federalAmount": "0",
                            "residentAmount": "0",
                            "nonresidentOhioAmount": "0",
                            "sourceReference": "PRIVATE-CATEGORY-0-federalAdjustments"
                        }
                    },
                    "stateAdditions": [],
                    "stateDeductions": []
                }
            ],
            "originalFederalSources": {
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
                    "taxYear": 2026,
                    "filingStatus": "single",
                    "primary": {
                        "firstName": "Private",
                        "lastName": "Employee",
                        "ssn": "900-70-0901",
                        "dateOfBirth": "1990-01-15"
                    },
                    "address": {
                        "street": "101 Fictional School Road",
                        "city": "Fictional Town",
                        "state": "OH",
                        "zip": "44805"
                    },
                    "dependents": []
                },
                "w2s": [
                    {
                        "accountHolder": "primary",
                        "taxYear": 2026,
                        "employer": {
                            "name": "Fictional Corporation 1",
                            "ein": "90-7000901"
                        },
                        "wages": "50000",
                        "federalWithheld": "0",
                        "socialSecurityWages": "50000",
                        "socialSecurityTips": "0",
                        "allocatedTips": "0",
                        "socialSecurityWithheld": "3100.00",
                        "medicareWages": "50000",
                        "medicareWithheld": "725.00",
                        "box10DependentCareBenefits": "0",
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
                        "state": "OH",
                        "stateWages": "50000",
                        "stateTaxWithheld": "1000",
                        "localWages": "50000",
                        "localTaxWithheld": "625.25",
                        "localityName": "0302 Hillsdale LSD",
                        "stateLocalSources": {
                            "sourceTaxYear": 2026,
                            "sourceReference": "PRIVATE-CURRENT-W2-0",
                            "sourceFactsConfirmed": true,
                            "owner": {
                                "accountHolder": "primary",
                                "originalTaxpayer": {
                                    "firstName": "Private",
                                    "lastName": "Employee",
                                    "ssn": "900-70-0901"
                                }
                            },
                            "originalW2": {
                                "accountHolder": "primary",
                                "taxYear": 2026,
                                "employer": {
                                    "name": "Fictional Corporation 1",
                                    "ein": "90-7000901"
                                },
                                "wages": "50000",
                                "federalWithheld": "0",
                                "socialSecurityWages": "50000",
                                "socialSecurityTips": "0",
                                "allocatedTips": "0",
                                "socialSecurityWithheld": "3100.00",
                                "medicareWages": "50000",
                                "medicareWithheld": "725.00",
                                "box10DependentCareBenefits": "0",
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
                                "state": "OH",
                                "stateWages": "50000",
                                "stateTaxWithheld": "1000",
                                "localWages": "50000",
                                "localTaxWithheld": "625.25",
                                "localityName": "0302 Hillsdale LSD"
                            },
                            "currentUncorrectedNonvoidOriginalConfirmed": true,
                            "allOriginalBoxesKnownConfirmed": true,
                            "singleOriginalWithoutContinuationConfirmed": true,
                            "allOriginalPagesAndCopiesCheckedConfirmed": true,
                            "stateReporting": "single",
                            "localReporting": "single",
                            "legacyScalarProjection": "first_entered_rows",
                            "stateRows": [
                                {
                                    "printedRow": 1,
                                    "sourceReference": "PRIVATE-OH-ROW-0",
                                    "state": "OH",
                                    "employerStateIDStatus": "reported",
                                    "employerStateID": "PRIVATE-ID-0",
                                    "wages": "50000",
                                    "withheld": "1000"
                                }
                            ],
                            "localRows": [
                                {
                                    "printedRow": 1,
                                    "sourceReference": "PRIVATE-LOCAL-ORIGINAL-1",
                                    "localityNameStatus": "reported",
                                    "localityName": "0302 Hillsdale LSD",
                                    "wages": "50000",
                                    "withheld": "625.25"
                                }
                            ]
                        }
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
            }
        },
        "ohioPayments": {
            "taxYear": 2026,
            "sourceReference": "PRIVATE-COMPLETE-2026-OH-ACCOUNT",
            "sourceFactsConfirmed": true,
            "originalFederalSources": {
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
                    "taxYear": 2026,
                    "filingStatus": "single",
                    "primary": {
                        "firstName": "Private",
                        "lastName": "Employee",
                        "ssn": "900-70-0901",
                        "dateOfBirth": "1990-01-15"
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
                        "accountHolder": "primary",
                        "taxYear": 2026,
                        "employer": {
                            "name": "Fictional Corporation 1",
                            "ein": "90-7000901"
                        },
                        "wages": "50000",
                        "federalWithheld": "0",
                        "socialSecurityWages": "50000",
                        "socialSecurityTips": "0",
                        "allocatedTips": "0",
                        "socialSecurityWithheld": "3100.00",
                        "medicareWages": "50000",
                        "medicareWithheld": "725.00",
                        "box10DependentCareBenefits": "0",
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
                        "state": "OH",
                        "stateWages": "50000",
                        "stateTaxWithheld": "1000",
                        "localWages": "0",
                        "localTaxWithheld": "0",
                        "localityName": "",
                        "stateLocalSources": {
                            "sourceTaxYear": 2026,
                            "sourceReference": "PRIVATE-CURRENT-W2-0",
                            "sourceFactsConfirmed": true,
                            "owner": {
                                "accountHolder": "primary",
                                "originalTaxpayer": {
                                    "firstName": "Private",
                                    "lastName": "Employee",
                                    "ssn": "900-70-0901"
                                }
                            },
                            "originalW2": {
                                "accountHolder": "primary",
                                "taxYear": 2026,
                                "employer": {
                                    "name": "Fictional Corporation 1",
                                    "ein": "90-7000901"
                                },
                                "wages": "50000",
                                "federalWithheld": "0",
                                "socialSecurityWages": "50000",
                                "socialSecurityTips": "0",
                                "allocatedTips": "0",
                                "socialSecurityWithheld": "3100.00",
                                "medicareWages": "50000",
                                "medicareWithheld": "725.00",
                                "box10DependentCareBenefits": "0",
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
                                "state": "OH",
                                "stateWages": "50000",
                                "stateTaxWithheld": "1000",
                                "localWages": "0",
                                "localTaxWithheld": "0",
                                "localityName": ""
                            },
                            "currentUncorrectedNonvoidOriginalConfirmed": true,
                            "allOriginalBoxesKnownConfirmed": true,
                            "singleOriginalWithoutContinuationConfirmed": true,
                            "allOriginalPagesAndCopiesCheckedConfirmed": true,
                            "stateReporting": "single",
                            "localReporting": "none",
                            "legacyScalarProjection": "first_entered_rows",
                            "stateRows": [
                                {
                                    "printedRow": 1,
                                    "sourceReference": "PRIVATE-OH-ROW-0",
                                    "state": "OH",
                                    "employerStateIDStatus": "reported",
                                    "employerStateID": "PRIVATE-ID-0",
                                    "wages": "50000",
                                    "withheld": "1000"
                                }
                            ],
                            "localRows": []
                        }
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
            },
            "calendarYearConfirmed": true,
            "allPaymentsIncludedConfirmed": true,
            "withholdingTreatment": "equal_quarters",
            "paymentRows": [],
            "priorReturn": {
                "status": "no_return",
                "sourceReference": "PRIVATE-ACTUAL-PRIOR-RETURN-SEARCH"
            },
            "priorCreditCarryforward": {
                "status": "none",
                "sourceReference": "PRIVATE-ACTUAL-ACCOUNT-NO-CREDIT"
            },
            "remainingTaxPayment": {
                "status": "no_remaining_tax",
                "sourceReference": "PRIVATE-CURRENT-PAYMENT-COVERAGE",
                "sourceFactsConfirmed": true
            },
            "currentTiming": {
                "kind": "expected",
                "expectedDate": "2027-04-15",
                "asOfDate": "2027-03-01"
            },
            "filingExtension": {
                "kind": "none"
            },
            "paymentExtension": {
                "kind": "none"
            },
            "returnKind": "original",
            "specialMethod": "regular",
            "balanceFacts": {
                "sourceReference": "PRIVATE-KNOWN-USE-TAX-AND-ELECTIONS",
                "useTax": "0",
                "outgoingCarryforward": "0",
                "donations": "0"
            }
        }
    },
    "sources": {
        "taxYear": 2026,
        "sourceReference": "PRIVATE-COMPLETE-SCHOOL-SOURCE",
        "sourceFactsConfirmed": true,
        "originalTaxInput": {
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
                "taxYear": 2026,
                "filingStatus": "single",
                "primary": {
                    "firstName": "Private",
                    "lastName": "Employee",
                    "ssn": "900-70-0901",
                    "dateOfBirth": "1990-01-15"
                },
                "address": {
                    "street": "101 Fictional School Road",
                    "city": "Fictional Town",
                    "state": "OH",
                    "zip": "44805"
                },
                "dependents": []
            },
            "w2s": [
                {
                    "accountHolder": "primary",
                    "taxYear": 2026,
                    "employer": {
                        "name": "Fictional Corporation 1",
                        "ein": "90-7000901"
                    },
                    "wages": "50000",
                    "federalWithheld": "0",
                    "socialSecurityWages": "50000",
                    "socialSecurityTips": "0",
                    "allocatedTips": "0",
                    "socialSecurityWithheld": "3100.00",
                    "medicareWages": "50000",
                    "medicareWithheld": "725.00",
                    "box10DependentCareBenefits": "0",
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
                    "state": "OH",
                    "stateWages": "50000",
                    "stateTaxWithheld": "1000",
                    "localWages": "50000",
                    "localTaxWithheld": "625.25",
                    "localityName": "0302 Hillsdale LSD",
                    "stateLocalSources": {
                        "sourceTaxYear": 2026,
                        "sourceReference": "PRIVATE-CURRENT-W2-0",
                        "sourceFactsConfirmed": true,
                        "owner": {
                            "accountHolder": "primary",
                            "originalTaxpayer": {
                                "firstName": "Private",
                                "lastName": "Employee",
                                "ssn": "900-70-0901"
                            }
                        },
                        "originalW2": {
                            "accountHolder": "primary",
                            "taxYear": 2026,
                            "employer": {
                                "name": "Fictional Corporation 1",
                                "ein": "90-7000901"
                            },
                            "wages": "50000",
                            "federalWithheld": "0",
                            "socialSecurityWages": "50000",
                            "socialSecurityTips": "0",
                            "allocatedTips": "0",
                            "socialSecurityWithheld": "3100.00",
                            "medicareWages": "50000",
                            "medicareWithheld": "725.00",
                            "box10DependentCareBenefits": "0",
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
                            "state": "OH",
                            "stateWages": "50000",
                            "stateTaxWithheld": "1000",
                            "localWages": "50000",
                            "localTaxWithheld": "625.25",
                            "localityName": "0302 Hillsdale LSD"
                        },
                        "currentUncorrectedNonvoidOriginalConfirmed": true,
                        "allOriginalBoxesKnownConfirmed": true,
                        "singleOriginalWithoutContinuationConfirmed": true,
                        "allOriginalPagesAndCopiesCheckedConfirmed": true,
                        "stateReporting": "single",
                        "localReporting": "single",
                        "legacyScalarProjection": "first_entered_rows",
                        "stateRows": [
                            {
                                "printedRow": 1,
                                "sourceReference": "PRIVATE-OH-ROW-0",
                                "state": "OH",
                                "employerStateIDStatus": "reported",
                                "employerStateID": "PRIVATE-ID-0",
                                "wages": "50000",
                                "withheld": "1000"
                            }
                        ],
                        "localRows": [
                            {
                                "printedRow": 1,
                                "sourceReference": "PRIVATE-LOCAL-ORIGINAL-1",
                                "localityNameStatus": "reported",
                                "localityName": "0302 Hillsdale LSD",
                                "wages": "50000",
                                "withheld": "625.25"
                            }
                        ]
                    }
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
            "donations": [],
            "ohioResidency": {
                "taxYear": 2026,
                "sourceReference": "PRIVATE-ALL-CURRENT-DOMICILE-ORIGINALS",
                "sourceFactsConfirmed": true,
                "allFederalSourcesIncludedConfirmed": true,
                "noBusinessIncomeConfirmed": true,
                "schoolDistrictStatus": "actual_district_sources_required",
                "owners": [
                    {
                        "accountHolder": "primary",
                        "status": "full_year_resident",
                        "sourceReference": "PRIVATE-DOMICILE-0",
                        "periods": [
                            {
                                "from": "2026-01-01",
                                "to": "2026-12-31",
                                "domicileState": "OH"
                            }
                        ],
                        "amounts": {
                            "wages": {
                                "federalAmount": "50000",
                                "residentAmount": "50000",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-wages"
                            },
                            "capitalGains": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-capitalGains"
                            },
                            "rentsRoyalties": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-rentsRoyalties"
                            },
                            "gambling": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-gambling"
                            },
                            "interestDividends": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-interestDividends"
                            },
                            "pensions": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-pensions"
                            },
                            "unemployment": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-unemployment"
                            },
                            "otherIncome": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-otherIncome"
                            },
                            "federalAdjustments": {
                                "federalAmount": "0",
                                "residentAmount": "0",
                                "nonresidentOhioAmount": "0",
                                "sourceReference": "PRIVATE-CATEGORY-0-federalAdjustments"
                            }
                        },
                        "stateAdditions": [],
                        "stateDeductions": []
                    }
                ],
                "originalFederalSources": {
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
                        "taxYear": 2026,
                        "filingStatus": "single",
                        "primary": {
                            "firstName": "Private",
                            "lastName": "Employee",
                            "ssn": "900-70-0901",
                            "dateOfBirth": "1990-01-15"
                        },
                        "address": {
                            "street": "101 Fictional School Road",
                            "city": "Fictional Town",
                            "state": "OH",
                            "zip": "44805"
                        },
                        "dependents": []
                    },
                    "w2s": [
                        {
                            "accountHolder": "primary",
                            "taxYear": 2026,
                            "employer": {
                                "name": "Fictional Corporation 1",
                                "ein": "90-7000901"
                            },
                            "wages": "50000",
                            "federalWithheld": "0",
                            "socialSecurityWages": "50000",
                            "socialSecurityTips": "0",
                            "allocatedTips": "0",
                            "socialSecurityWithheld": "3100.00",
                            "medicareWages": "50000",
                            "medicareWithheld": "725.00",
                            "box10DependentCareBenefits": "0",
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
                            "state": "OH",
                            "stateWages": "50000",
                            "stateTaxWithheld": "1000",
                            "localWages": "50000",
                            "localTaxWithheld": "625.25",
                            "localityName": "0302 Hillsdale LSD",
                            "stateLocalSources": {
                                "sourceTaxYear": 2026,
                                "sourceReference": "PRIVATE-CURRENT-W2-0",
                                "sourceFactsConfirmed": true,
                                "owner": {
                                    "accountHolder": "primary",
                                    "originalTaxpayer": {
                                        "firstName": "Private",
                                        "lastName": "Employee",
                                        "ssn": "900-70-0901"
                                    }
                                },
                                "originalW2": {
                                    "accountHolder": "primary",
                                    "taxYear": 2026,
                                    "employer": {
                                        "name": "Fictional Corporation 1",
                                        "ein": "90-7000901"
                                    },
                                    "wages": "50000",
                                    "federalWithheld": "0",
                                    "socialSecurityWages": "50000",
                                    "socialSecurityTips": "0",
                                    "allocatedTips": "0",
                                    "socialSecurityWithheld": "3100.00",
                                    "medicareWages": "50000",
                                    "medicareWithheld": "725.00",
                                    "box10DependentCareBenefits": "0",
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
                                    "state": "OH",
                                    "stateWages": "50000",
                                    "stateTaxWithheld": "1000",
                                    "localWages": "50000",
                                    "localTaxWithheld": "625.25",
                                    "localityName": "0302 Hillsdale LSD"
                                },
                                "currentUncorrectedNonvoidOriginalConfirmed": true,
                                "allOriginalBoxesKnownConfirmed": true,
                                "singleOriginalWithoutContinuationConfirmed": true,
                                "allOriginalPagesAndCopiesCheckedConfirmed": true,
                                "stateReporting": "single",
                                "localReporting": "single",
                                "legacyScalarProjection": "first_entered_rows",
                                "stateRows": [
                                    {
                                        "printedRow": 1,
                                        "sourceReference": "PRIVATE-OH-ROW-0",
                                        "state": "OH",
                                        "employerStateIDStatus": "reported",
                                        "employerStateID": "PRIVATE-ID-0",
                                        "wages": "50000",
                                        "withheld": "1000"
                                    }
                                ],
                                "localRows": [
                                    {
                                        "printedRow": 1,
                                        "sourceReference": "PRIVATE-LOCAL-ORIGINAL-1",
                                        "localityNameStatus": "reported",
                                        "localityName": "0302 Hillsdale LSD",
                                        "wages": "50000",
                                        "withheld": "625.25"
                                    }
                                ]
                            }
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
                }
            },
            "ohioPayments": {
                "taxYear": 2026,
                "sourceReference": "PRIVATE-COMPLETE-2026-OH-ACCOUNT",
                "sourceFactsConfirmed": true,
                "originalFederalSources": {
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
                        "taxYear": 2026,
                        "filingStatus": "single",
                        "primary": {
                            "firstName": "Private",
                            "lastName": "Employee",
                            "ssn": "900-70-0901",
                            "dateOfBirth": "1990-01-15"
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
                            "accountHolder": "primary",
                            "taxYear": 2026,
                            "employer": {
                                "name": "Fictional Corporation 1",
                                "ein": "90-7000901"
                            },
                            "wages": "50000",
                            "federalWithheld": "0",
                            "socialSecurityWages": "50000",
                            "socialSecurityTips": "0",
                            "allocatedTips": "0",
                            "socialSecurityWithheld": "3100.00",
                            "medicareWages": "50000",
                            "medicareWithheld": "725.00",
                            "box10DependentCareBenefits": "0",
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
                            "state": "OH",
                            "stateWages": "50000",
                            "stateTaxWithheld": "1000",
                            "localWages": "0",
                            "localTaxWithheld": "0",
                            "localityName": "",
                            "stateLocalSources": {
                                "sourceTaxYear": 2026,
                                "sourceReference": "PRIVATE-CURRENT-W2-0",
                                "sourceFactsConfirmed": true,
                                "owner": {
                                    "accountHolder": "primary",
                                    "originalTaxpayer": {
                                        "firstName": "Private",
                                        "lastName": "Employee",
                                        "ssn": "900-70-0901"
                                    }
                                },
                                "originalW2": {
                                    "accountHolder": "primary",
                                    "taxYear": 2026,
                                    "employer": {
                                        "name": "Fictional Corporation 1",
                                        "ein": "90-7000901"
                                    },
                                    "wages": "50000",
                                    "federalWithheld": "0",
                                    "socialSecurityWages": "50000",
                                    "socialSecurityTips": "0",
                                    "allocatedTips": "0",
                                    "socialSecurityWithheld": "3100.00",
                                    "medicareWages": "50000",
                                    "medicareWithheld": "725.00",
                                    "box10DependentCareBenefits": "0",
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
                                    "state": "OH",
                                    "stateWages": "50000",
                                    "stateTaxWithheld": "1000",
                                    "localWages": "0",
                                    "localTaxWithheld": "0",
                                    "localityName": ""
                                },
                                "currentUncorrectedNonvoidOriginalConfirmed": true,
                                "allOriginalBoxesKnownConfirmed": true,
                                "singleOriginalWithoutContinuationConfirmed": true,
                                "allOriginalPagesAndCopiesCheckedConfirmed": true,
                                "stateReporting": "single",
                                "localReporting": "none",
                                "legacyScalarProjection": "first_entered_rows",
                                "stateRows": [
                                    {
                                        "printedRow": 1,
                                        "sourceReference": "PRIVATE-OH-ROW-0",
                                        "state": "OH",
                                        "employerStateIDStatus": "reported",
                                        "employerStateID": "PRIVATE-ID-0",
                                        "wages": "50000",
                                        "withheld": "1000"
                                    }
                                ],
                                "localRows": []
                            }
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
                },
                "calendarYearConfirmed": true,
                "allPaymentsIncludedConfirmed": true,
                "withholdingTreatment": "equal_quarters",
                "paymentRows": [],
                "priorReturn": {
                    "status": "no_return",
                    "sourceReference": "PRIVATE-ACTUAL-PRIOR-RETURN-SEARCH"
                },
                "priorCreditCarryforward": {
                    "status": "none",
                    "sourceReference": "PRIVATE-ACTUAL-ACCOUNT-NO-CREDIT"
                },
                "remainingTaxPayment": {
                    "status": "no_remaining_tax",
                    "sourceReference": "PRIVATE-CURRENT-PAYMENT-COVERAGE",
                    "sourceFactsConfirmed": true
                },
                "currentTiming": {
                    "kind": "expected",
                    "expectedDate": "2027-04-15",
                    "asOfDate": "2027-03-01"
                },
                "filingExtension": {
                    "kind": "none"
                },
                "paymentExtension": {
                    "kind": "none"
                },
                "returnKind": "original",
                "specialMethod": "regular",
                "balanceFacts": {
                    "sourceReference": "PRIVATE-KNOWN-USE-TAX-AND-ELECTIONS",
                    "useTax": "0",
                    "outgoingCarryforward": "0",
                    "donations": "0"
                }
            }
        },
        "owner": {
            "accountHolder": "primary",
            "originalTaxpayer": {
                "firstName": "Private",
                "lastName": "Employee",
                "ssn": "900-70-0901",
                "dateOfBirth": "1990-01-15"
            }
        },
        "residence": {
            "sourceReference": "PRIVATE-ACTUAL-RESIDENCE",
            "originalAddress": {
                "street": "101 Fictional School Road",
                "city": "Fictional Town",
                "state": "OH",
                "zip": "44805"
            },
            "from": "2026-01-01",
            "through": "2026-12-31",
            "districtCode": "0302",
            "finder": {
                "sourceReference": "PRIVATE-ACTUAL-FINDER-RESULT",
                "taxYear": 2026,
                "lookupDate": "2026-11-05",
                "originalAddress": {
                    "street": "101 Fictional School Road",
                    "city": "Fictional Town",
                    "state": "OH",
                    "zip": "44805"
                },
                "districtCode": "0302",
                "districtName": "Hillsdale LSD",
                "taxBase": "earned",
                "rate": "0.0125",
                "officialResultMatchedConfirmed": true
            }
        },
        "income": {
            "allIncomeOriginalsIncludedConfirmed": true,
            "noOtherIncomeOrAdjustmentsConfirmed": true,
            "noSelfEmploymentConfirmed": true,
            "noSpecialCompensationConfirmed": true
        },
        "employmentOriginals": [
            {
                "w2Index": 0,
                "sourceReference": "PRIVATE-EMPLOYER-0",
                "sourceTaxYear": 2026,
                "accountHolder": "primary",
                "employerTin": "90-7000901",
                "employerName": "Fictional Corporation 1",
                "entityType": "c_corporation",
                "ordinaryEmployeeCompensationConfirmed": true,
                "allServiceAndPaymentPeriodsIncludedConfirmed": true,
                "serviceRows": [
                    {
                        "sourceId": "PRIVATE-PAYROLL-0-0",
                        "sourceReference": "PRIVATE-PAYROLL-ORIGINAL-0-0",
                        "from": "2026-01-01",
                        "to": "2026-12-31",
                        "paymentDate": "2026-12-31",
                        "serviceState": "OH",
                        "wages": "50000"
                    }
                ]
            }
        ],
        "w2Sources": [
            {
                "w2Index": 0,
                "sourceReference": "PRIVATE-COMPLETE-LOCAL-SOURCE",
                "box14SchoolDistrictReporting": "none",
                "localRows": [
                    {
                        "printedRow": 1,
                        "sourceReference": "PRIVATE-LOCAL-CLASSIFICATION-1",
                        "classification": "school_district",
                        "districtCode": "0302"
                    }
                ]
            }
        ]
    }
};
export function ohio2026NativeOriginalFixture() {
    const input = TaxYearInputSchema.parse(structuredClone(original.input));
    for (const w of input.w2s) {
        const { stateLocalSources: s, ...raw } = w;
        if (s)
            s.originalW2 = structuredClone(raw);
    }
    const { ohioResidency: residency, ohioPayments: _payments, ...baseInput } = input;
    if (!residency)
        throw Error('Explicit fictional residence required');
    residency.originalFederalSources = structuredClone(baseInput);
    const canonical = { ...baseInput, ohioResidency: residency };
    const sources = Ohio2026SchoolSourcesSchema.parse({ ...structuredClone(original.sources), owner: { accountHolder: 'primary', originalTaxpayer: structuredClone(canonical.taxpayer.primary) }, originalTaxInput: structuredClone(canonical) });
    return { baseInput, residency, sources, canonical };
}
import { emptyOhio2026SchoolDraft, type Ohio2026SchoolDraft } from '@/lib/guided-ohio-2026-school-sources';
export function enteredOhio2026SchoolDraft(): Ohio2026SchoolDraft {
    const { residency, sources } = ohio2026NativeOriginalFixture();
    if (residency.businessSources || residency.residentCreditSources)
        throw Error('Fictional source-only fixture has no other Ohio method');
    if (residency.allFederalSourcesIncludedConfirmed !== true || residency.noBusinessIncomeConfirmed !== true)
        throw Error('Actual fictional complete source inventory required');
    const enteredResidency = { sourceReference: residency.sourceReference, sourceFactsConfirmed: residency.sourceFactsConfirmed, schoolDistrictStatus: residency.schoolDistrictStatus, owners: residency.owners.map(owner => { if (!Array.isArray(owner.stateAdditions) || !Array.isArray(owner.stateDeductions))
            throw Error('Actual fictional empty adjustment inventories required'); return { ...structuredClone(owner), stateAdditions: structuredClone(owner.stateAdditions), stateDeductions: structuredClone(owner.stateDeductions) }; }), allFederalSourcesIncludedConfirmed: residency.allFederalSourcesIncludedConfirmed, noBusinessIncomeConfirmed: residency.noBusinessIncomeConfirmed };
    return { ...emptyOhio2026SchoolDraft(), taxYear: String(sources.taxYear), sourceReference: sources.sourceReference,
        owner: structuredClone(sources.owner), residence: { ...structuredClone(sources.residence), finder: { ...structuredClone(sources.residence.finder), taxYear: String(sources.residence.finder.taxYear) } },
        residency: { ...structuredClone(enteredResidency), taxYear: String(residency.taxYear) }, noStateAdjustmentsConfirmed: true, income: structuredClone(sources.income),
        employmentOriginals: sources.employmentOriginals.map(e => ({ ...structuredClone(e), sourceTaxYear: String(e.sourceTaxYear) })), w2Sources: structuredClone(sources.w2Sources) };
}
