/**
 * Tax constants organized by tax year.
 * When rules change, add/update the year entry — existing years remain immutable.
 */

import Decimal from "decimal.js";

export type FilingStatus =
  | "single"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "head_of_household"
  | "qualifying_surviving_spouse";

export interface TaxBracket {
  min: Decimal;
  max: Decimal | null; // null = no upper limit
  rate: Decimal;
}

export interface NJResidentYearConstants {
  filingThresholds: Record<FilingStatus, Decimal>;
  exemptionAmounts: {
    self: Decimal;
    spouse: Decimal;
    age65OrOlder: Decimal;
    blindOrDisabled: Decimal;
    veteran: Decimal;
    dependent: Decimal;
    collegeDependent: Decimal;
  };
  propertyTax: {
    deductionCap: Decimal;
    sharedHomeMFSDeductionCap: Decimal;
    rentToPropertyTaxRate: Decimal;
    creditAmount: Decimal;
    sharedHomeMFSCreditAmount: Decimal;
    creditIncomeLimit: Decimal;
  };
  taxRateTables: {
    tableA: TaxBracket[];
    tableB: TaxBracket[];
  };
}

export interface StateYearConstants {
  njResident?: NJResidentYearConstants;
}

export interface YearConstants {
  standardDeduction: Record<FilingStatus, Decimal>;
  taxBrackets: Record<FilingStatus, TaxBracket[]>;
  capitalGainsRates: {
    zero: { threshold: Record<FilingStatus, Decimal> };
    fifteen: { threshold: Record<FilingStatus, Decimal> };
    twenty: Record<string, never>; // remainder
  };
  saltCap: Decimal;
  childTaxCredit: {
    perChild: Decimal;
    otherDependentCredit: Decimal; // $500 per ODC-qualifying dependent
    phaseOutThreshold: Record<FilingStatus, Decimal>;
    phaseOutRate: Decimal; // reduction per $1000 over threshold
  };
  selfEmploymentTax: {
    socialSecurityRate: Decimal;
    medicareRate: Decimal;
    socialSecurityWageBase: Decimal;
    earningsMultiplier: Decimal; // 0.9235
    deductiblePortion: Decimal; // 0.5
  };
  additionalMedicareTax: {
    rate: Decimal;
    threshold: Record<FilingStatus, Decimal>;
  };
  niit: {
    rate: Decimal;
    threshold: Record<FilingStatus, Decimal>;
  };
  mortgageInterest: {
    debtLimit: Decimal;
  };
  capitalLossLimit: Decimal;
  estimatedTaxSafeHarbor: Decimal; // 110% of prior year for high income
  amt: {
    exemption: Record<FilingStatus, Decimal>;
    phaseOutThreshold: Record<FilingStatus, Decimal>;
    rate26Limit: Record<FilingStatus, Decimal>; // 26% rate applies up to this, 28% above
  };
  qbi: {
    /** Below this threshold, simplified Form 8995 applies (no W-2/basis limitations) */
    simplifiedThreshold: Record<FilingStatus, Decimal>;
    /** Width of phase-in range above threshold where W-2/UBIA limits and SSTB phase-out apply */
    phaseInRange: Record<FilingStatus, Decimal>;
  };
  studentLoanInterest: {
    maxDeduction: Decimal;
    /** MAGI above which phase-out begins (per IRC §221(b)(2)(B), Rev. Proc. 2024-40 §2.30) */
    phaseOutStart: Record<FilingStatus, Decimal>;
    /** Phase-out range width ($15K single, $30K MFJ — fixed by statute) */
    phaseOutRange: Record<FilingStatus, Decimal>;
  };
  studentLoanInterestDeduction: {
    phaseOutStart: Record<FilingStatus, Decimal>;
    phaseOutEnd: Record<FilingStatus, Decimal>;
  };
  hsa: {
    selfOnlyContributionLimit: Decimal;
    familyContributionLimit: Decimal;
    catchUpContribution: Decimal;
  };
  iraDeduction: {
    contributionLimit: Decimal;
    catchUpContribution: Decimal; // additional for age 50+
    /** Phase-out start for taxpayer who IS an active participant in an employer plan */
    activeParticipantPhaseOutStart: Record<FilingStatus, Decimal>;
    /** Phase-out range for active participants */
    activeParticipantPhaseOutRange: Record<FilingStatus, Decimal>;
    /** Phase-out start for non-participant whose spouse IS an active participant (MFJ only) */
    spouseActiveParticipantPhaseOutStart: Decimal;
    /** Phase-out range for non-participant married to active participant */
    spouseActiveParticipantPhaseOutRange: Decimal;
  };
  eitc: {
    /** Investment income ceiling — EIC = $0 if investment income exceeds this */
    investmentIncomeLimit: Decimal;
    /** Credit rate (phase-in percentage) by number of qualifying children (0–3+) */
    creditRate: Record<number, Decimal>;
    /** Phase-out rate by number of qualifying children (0–3+) */
    phaseOutRate: Record<number, Decimal>;
    /** Earned income amount (phase-in ceiling) by number of qualifying children */
    earnedIncomeAmount: Record<number, Decimal>;
    /** Phase-out start for single/HoH/QSS filers by number of qualifying children */
    phaseOutStartSingleHoH: Record<number, Decimal>;
    /** Phase-out start for MFJ filers by number of qualifying children */
    phaseOutStartMFJ: Record<number, Decimal>;
  };
  cleanVehicleCredit: {
    /** New clean vehicle (IRC §30D) */
    newVehicle: {
      criticalMineralsCredit: Decimal;
      batteryComponentsCredit: Decimal;
      msrpLimitSuvVanPickup: Decimal;
      msrpLimitOther: Decimal;
      magiLimit: Record<FilingStatus, Decimal>;
    };
    /** Previously owned clean vehicle (IRC §25E) */
    previouslyOwned: {
      maxCredit: Decimal;
      creditRate: Decimal;
      maxSalePrice: Decimal;
      magiLimit: Record<FilingStatus, Decimal>;
    };
  };
  /** Schedule H — Household Employment Taxes */
  householdEmployment: {
    /** Cash wage threshold per employee to trigger Schedule H (IRC §3121(a)(7)(B)) */
    cashWageThreshold: Decimal;
    /** Combined employer + employee Social Security rate (6.2% + 6.2%) */
    socialSecurityRate: Decimal;
    /** Combined employer + employee Medicare rate (1.45% + 1.45%) */
    medicareRate: Decimal;
    /** Additional Medicare Tax rate (employee only, on wages > $200K) */
    additionalMedicareRate: Decimal;
    /** Per-employee threshold for Additional Medicare Tax withholding */
    additionalMedicareThreshold: Decimal;
    /** Social Security wage base per employee */
    socialSecurityWageBase: Decimal;
    /** Gross FUTA rate */
    futaGrossRate: Decimal;
    /** Maximum FUTA credit for state unemployment taxes */
    futaMaxCredit: Decimal;
    /** Net FUTA rate after maximum credit (6.0% - 5.4% = 0.6%) */
    futaNetRate: Decimal;
    /** FUTA wage base per employee */
    futaWageBase: Decimal;
    /** Quarterly wage threshold to trigger FUTA obligation */
    futaQuarterlyThreshold: Decimal;
  };
  /** Form 2555 — Foreign Earned Income Exclusion (IRC §911) */
  foreignEarnedIncomeExclusion: {
    /** Maximum foreign earned income exclusion (IRC §911(b)(2)(D)(i)) */
    maximumExclusion: Decimal;
    /** Base housing percentage (16% of daily exclusion) */
    baseHousingPercentage: Decimal;
    /** Default maximum housing expense percentage (30% of exclusion for most locations) */
    defaultMaxHousingPercentage: Decimal;
  };
  /** Form 8615 — Kiddie Tax (IRC §1(g)) */
  kiddieTax: {
    /** Unearned income threshold for non-itemizing children (2 x minimum dependent standard deduction) */
    unearnedIncomeThreshold: Decimal;
    /** Threshold for itemizing children (minimum dependent standard deduction) */
    itemizingThreshold: Decimal;
  };
  /** Form 8814 — Parents' Election To Report Child's Interest and Dividends (IRC §1(g)(7)) */
  form8814: {
    /** Base amount: child's income up to this is not included in parent's return (Line 5) */
    baseAmount: Decimal;
    /** Amount not taxed: first tier of child's income exempt from tax (Line 13) */
    amountNotTaxed: Decimal;
    /** Maximum child gross income to use Form 8814 (if >= this, must use Form 8615) */
    maximumChildIncome: Decimal;
    /** Tax rate on the second tier (between amountNotTaxed and baseAmount) */
    taxRate: Decimal;
  };
  /** Form 8839 — Qualified Adoption Expenses (IRC §23, §137) */
  adoptionCredit: {
    /** Maximum adoption credit and exclusion per eligible child (Rev. Proc. 2024-40 §3.01) */
    maxCreditPerChild: Decimal;
    /** MAGI threshold above which credit/exclusion begins to phase out */
    phaseOutThreshold: Decimal;
    /** Phase-out range (statutory $40,000 — IRC §23(b)(2)(A)(ii), not indexed) */
    phaseOutRange: Decimal;
  };
  /** Form 461 — Excess Business Loss Limitation (IRC §461(l)) */
  excessBusinessLoss: {
    /** Threshold above which aggregate business losses are disallowed */
    threshold: Record<FilingStatus, Decimal>;
  };
  /** IRC §108(h) — Qualified Principal Residence Indebtedness Exclusion */
  qualifiedPrincipalResidenceExclusion: {
    /** Maximum excludable amount (IRC §108(h)(2)) */
    maxExclusion: Decimal;
    /** Maximum for MFS filers */
    maxExclusionMFS: Decimal;
  };
  /** IRC §121 — Exclusion of Gain from Sale of Principal Residence */
  homeSaleExclusion: {
    /** Maximum exclusion for single/HoH/MFS/QSS filers (IRC §121(b)(1)) */
    maxExclusionSingle: Decimal;
    /** Maximum exclusion for MFJ filers when both spouses qualify (IRC §121(b)(2)) */
    maxExclusionMFJ: Decimal;
  };
  /** Qualified Charitable Distribution annual limit per individual (IRC §408(d)(8)(A), SECURE 2.0 §307) */
  qcd: {
    /** Maximum excludable QCD amount per IRA owner per year */
    annualLimit: Decimal;
  };
  /** IRC §213(d)(10) — Qualified long-term care premium limits by attained age (Rev. Proc. 2024-40 §3.18) */
  longTermCarePremiumLimits: {
    age40OrUnder: Decimal;
    age41to50: Decimal;
    age51to60: Decimal;
    age61to70: Decimal;
    age71OrOlder: Decimal;
  };
  /** Schedule R — Credit for the Elderly or the Disabled (IRC §22) */
  elderlyOrDisabledCredit: {
    /** Initial amount when one person qualifies (single/HoH/QSS or MFJ-one) */
    initialAmountSingle: Decimal;
    /** Initial amount when both spouses qualify (MFJ-both) */
    initialAmountBoth: Decimal;
    /** Initial amount for MFS filers (must live apart all year) */
    initialAmountMFS: Decimal;
    /** AGI threshold above which half the excess reduces the credit base */
    agiThreshold: Record<FilingStatus, Decimal>;
    /** Credit rate applied to the remaining credit base */
    creditRate: Decimal;
  };
  state?: StateYearConstants;
}

export interface Illinois1040Constants {
  taxRate: Decimal;
  personalExemption: Decimal;
  additionalExemption65OrBlind: Decimal;
  exemptionAGIThreshold: Record<"mfj" | "other", Decimal>;
  eitcRate: Decimal;
  childTaxCreditRate: Decimal;
}

export interface IllinoisScheduleEEICConstants {
  eitcRate: Decimal;
  childTaxCreditRate: Decimal;
  expandedChildlessMinimumAge: number;
  expandedInvestmentIncomeLimit: Decimal;
  expandedIncomeLimit: Record<"mfj" | "other", Record<0 | 1 | 2 | 3, Decimal>>;
  expandedAgiThreshold: {
    noChildren: Record<"mfj" | "other", Decimal>;
    withChildren: Record<"mfj" | "other", Decimal>;
  };
}

export interface IllinoisScheduleICRConstants {
  propertyTaxCreditRate: Decimal;
  educationExpenseFloor: Decimal;
  educationCreditRate: Decimal;
  educationCreditMax: Decimal;
  volunteerCreditPerPerson: Decimal;
  agiThreshold: Record<"mfj" | "other", Decimal>;
}

export interface IllinoisScheduleMConstants {
  max529Subtraction: Record<"mfj" | "other", Decimal>;
  maxABLESubtraction: Record<"mfj" | "other", Decimal>;
}

export interface Illinois2210Constants {
  penaltyRate: Decimal;
  penaltyThreshold: Record<"mfs" | "other", Decimal>;
  currentYearSafeHarbor: Decimal;
  penaltyDays: [number, number, number, number];
  annualizationFactors: [Decimal, Decimal, Decimal, Decimal];
  applicablePercentages: [Decimal, Decimal, Decimal, Decimal];
}

export interface IllinoisUseTaxTableBracket {
  upperBound: Decimal;
  amount: Decimal;
}

export interface IllinoisUseTaxConstants {
  table: IllinoisUseTaxTableBracket[];
  formulaRate: Decimal;
  formulaThreshold: Decimal;
  generalMerchandiseRate: Decimal;
  qualifyingItemRate: Decimal;
  st44Threshold: Record<"mfj" | "other", Decimal>;
}

export interface IllinoisStateConstants {
  form1040: Illinois1040Constants;
  scheduleEEIC: IllinoisScheduleEEICConstants;
  scheduleICR: IllinoisScheduleICRConstants;
  scheduleM: IllinoisScheduleMConstants;
  form2210: Illinois2210Constants;
  useTax: IllinoisUseTaxConstants;
}

export interface OhioTaxBracket {
  lowerBound: Decimal;
  baseTax: Decimal;
  rate: Decimal;
}

export interface OhioExemptionTier {
  maxMagi: Decimal | null;
  amount: Decimal;
}

export interface OhioIT1040YearConstants {
  nonbusinessBrackets: OhioTaxBracket[];
  businessTaxRate: Decimal;
  businessIncomeDeduction: Record<"default" | "married_filing_separately", Decimal>;
  exemptionTiers: OhioExemptionTier[];
}

export interface OhioScheduleOfAdjustmentsYearConstants {
  businessIncomeDeductionCap: Record<"default" | "married_filing_separately", Decimal>;
  medicalSavingsAccountContributionCap: Decimal;
  stableMaxPerBeneficiary: Decimal;
  ohio529MaxPerBeneficiary: Decimal;
  homebuyerPlusMaxPerAccount: Decimal;
  pregnancyResourceCenterContributionWindow:
    | {
        startInclusive: string;
        endExclusive: string;
      }
    | null;
}

export interface RetirementIncomeCreditTier {
  maxIncome: Decimal | null;
  credit: Decimal;
}

export interface JointFilingCreditTier {
  maxMagiLessExemptions: Decimal | null;
  rate: Decimal;
}

export interface OhioScheduleOfCreditsYearConstants {
  lumpSumAgeMultiples: Record<number, Decimal>;
  lumpSumDistributionBaseAmount: Decimal;
  retirementIncomeCreditTiers: RetirementIncomeCreditTier[];
  retirementCreditMagiLessExemptionsLimit: Decimal;
  seniorCitizenCreditAmount: Decimal;
  seniorCreditMagiLessExemptionsLimit: Decimal;
  childCareMagiThresholdFull: Decimal;
  childCareMagiThresholdPartial: Decimal;
  childCarePartialRate: Decimal;
  displacedWorkerMaxCredit: Decimal;
  displacedWorkerRate: Decimal;
  campaignContributionMaxSingle: Decimal;
  campaignContributionMaxMfj: Decimal;
  exemptionCreditPerExemption: Decimal;
  exemptionCreditMagiLessExemptionsLimit: Decimal;
  jointFilingCreditTiers: JointFilingCreditTier[];
  jointFilingCreditMax: Decimal;
  jointFilingCreditMagiLessExemptionsLimit: Decimal;
  earnedIncomeCreditRate: Decimal;
  homeSchoolExpensesCreditMaxPerReturn: Decimal;
  homeSchoolExpensesCreditMaxPerStudent: Decimal;
  homeSchoolExpensesCreditUsesPerStudentCap: boolean;
  scholarshipDonationCreditMaxSingle: Decimal;
  scholarshipDonationCreditMaxMfj: Decimal;
  noncharteredSchoolTuitionCreditAgiThreshold: Decimal;
  noncharteredSchoolTuitionCreditMaxBelowThreshold: Decimal;
  noncharteredSchoolTuitionCreditMaxAtOrAboveThreshold: Decimal;
  grapeProductionCreditRate: Decimal;
}

export interface QuarterlyRateFactor {
  days: number;
  factor: Decimal;
}

export interface OhioITSD2210YearConstants {
  annualRate: Decimal;
  quarterlyFactors: [
    QuarterlyRateFactor,
    QuarterlyRateFactor,
    QuarterlyRateFactor,
    QuarterlyRateFactor,
  ];
}

export interface OhioSD100YearConstants {
  seniorCitizenCredit: Decimal;
}

export interface OhioYearConstants {
  it1040: OhioIT1040YearConstants;
  scheduleAdjustments: OhioScheduleOfAdjustmentsYearConstants;
  scheduleCredits: OhioScheduleOfCreditsYearConstants;
  itSd2210: OhioITSD2210YearConstants;
  sd100: OhioSD100YearConstants;
}

const d = (n: number | string) => new Decimal(n);

const pickIllinoisSection = <K extends keyof IllinoisStateConstants>(
  section: K,
): Record<number, IllinoisStateConstants[K]> =>
  Object.fromEntries(
    Object.entries(ILLINOIS_TAX_CONSTANTS).map(([year, constants]) => [
      Number(year),
      constants[section],
    ]),
  ) as Record<number, IllinoisStateConstants[K]>;

export const ILLINOIS_TAX_CONSTANTS: Record<number, IllinoisStateConstants> = {
  2025: {
    form1040: {
      taxRate: d("0.0495"),
      personalExemption: d(2850),
      additionalExemption65OrBlind: d(1000),
      exemptionAGIThreshold: {
        mfj: d(500000),
        other: d(250000),
      },
      eitcRate: d("0.20"),
      childTaxCreditRate: d("0.40"),
    },
    scheduleEEIC: {
      eitcRate: d("0.20"),
      childTaxCreditRate: d("0.40"),
      expandedChildlessMinimumAge: 18,
      expandedInvestmentIncomeLimit: d(11950),
      expandedIncomeLimit: {
        mfj: {
          0: d(26214),
          1: d(57554),
          2: d(64430),
          3: d(68675),
        },
        other: {
          0: d(19104),
          1: d(50434),
          2: d(57310),
          3: d(61555),
        },
      },
      expandedAgiThreshold: {
        noChildren: {
          mfj: d(17730),
          other: d(10620),
        },
        withChildren: {
          mfj: d(30470),
          other: d(23350),
        },
      },
    },
    scheduleICR: {
      propertyTaxCreditRate: d("0.05"),
      educationExpenseFloor: d(250),
      educationCreditRate: d("0.25"),
      educationCreditMax: d(750),
      volunteerCreditPerPerson: d(500),
      agiThreshold: {
        mfj: d(500000),
        other: d(250000),
      },
    },
    scheduleM: {
      max529Subtraction: {
        mfj: d(20000),
        other: d(10000),
      },
      maxABLESubtraction: {
        mfj: d(20000),
        other: d(10000),
      },
    },
    form2210: {
      penaltyRate: d("0.07"),
      penaltyThreshold: {
        mfs: d(500),
        other: d(1000),
      },
      currentYearSafeHarbor: d("0.90"),
      penaltyDays: [365, 304, 212, 90],
      annualizationFactors: [d(4), d("2.4"), d("1.5"), d(1)],
      applicablePercentages: [d("0.225"), d("0.45"), d("0.675"), d("0.90")],
    },
    useTax: {
      table: [
        { upperBound: d(10000), amount: d(3) },
        { upperBound: d(20000), amount: d(8) },
        { upperBound: d(30000), amount: d(13) },
        { upperBound: d(40000), amount: d(18) },
        { upperBound: d(50000), amount: d(23) },
        { upperBound: d(75000), amount: d(31) },
        { upperBound: d(100000), amount: d(44) },
      ],
      formulaRate: d("0.0005"),
      formulaThreshold: d(100000),
      generalMerchandiseRate: d("0.0625"),
      qualifyingItemRate: d("0.01"),
      st44Threshold: {
        mfj: d(1200),
        other: d(600),
      },
    },
  },
};

export const IL_1040_CONSTANTS = pickIllinoisSection("form1040");
export const IL_SCHEDULE_E_EIC_CONSTANTS = pickIllinoisSection("scheduleEEIC");
export const IL_SCHEDULE_ICR_CONSTANTS = pickIllinoisSection("scheduleICR");
export const IL_SCHEDULE_M_CONSTANTS: Record<number, IllinoisScheduleMConstants> = {
  2024: {
    max529Subtraction: {
      mfj: d(20000),
      other: d(10000),
    },
    maxABLESubtraction: {
      mfj: d(20000),
      other: d(10000),
    },
  },
  ...pickIllinoisSection("scheduleM"),
};
export const IL_2210_CONSTANTS = pickIllinoisSection("form2210");
export const IL_USE_TAX_CONSTANTS = pickIllinoisSection("useTax");

const OHIO_LUMP_SUM_AGE_MULTIPLES: Record<number, Decimal> = {
  46: d("36.8"),
  47: d("35.9"),
  48: d("34.9"),
  49: d("34.0"),
  50: d("33.1"),
  51: d("32.2"),
  52: d("31.3"),
  53: d("30.4"),
  54: d("29.5"),
  55: d("28.6"),
  56: d("27.7"),
  57: d("26.8"),
  58: d("25.9"),
  59: d("25.0"),
  60: d("24.2"),
  61: d("23.3"),
  62: d("22.5"),
  63: d("21.6"),
  64: d("20.8"),
  65: d("20.0"),
  66: d("19.2"),
  67: d("18.4"),
  68: d("17.6"),
  69: d("16.8"),
  70: d("16.0"),
  71: d("15.3"),
  72: d("14.6"),
  73: d("13.9"),
  74: d("13.2"),
  75: d("12.5"),
  76: d("11.9"),
  77: d("11.2"),
  78: d("10.6"),
  79: d("10.0"),
  80: d("9.5"),
  81: d("8.9"),
  82: d("8.4"),
  83: d("7.9"),
  84: d("7.4"),
  85: d("6.9"),
  86: d("6.5"),
  87: d("6.1"),
  88: d("5.7"),
  89: d("5.3"),
  90: d("5.0"),
  91: d("4.7"),
  92: d("4.4"),
  93: d("4.1"),
  94: d("3.9"),
  95: d("3.7"),
  96: d("3.4"),
  97: d("3.2"),
  98: d("3.0"),
  99: d("2.8"),
  100: d("2.7"),
  101: d("2.5"),
  102: d("2.3"),
  103: d("2.1"),
  104: d("1.9"),
  105: d("1.8"),
};

export const OHIO_TAX_CONSTANTS: Record<number, OhioYearConstants> = {
  2024: {
    it1040: {
      nonbusinessBrackets: [
        { lowerBound: d(0), baseTax: d(0), rate: d(0) },
        { lowerBound: d(26050), baseTax: d("360.69"), rate: d("0.0275") },
        { lowerBound: d(100000), baseTax: d("2394.32"), rate: d("0.035") },
      ],
      businessTaxRate: d("0.03"),
      businessIncomeDeduction: {
        default: d(250000),
        married_filing_separately: d(125000),
      },
      exemptionTiers: [
        { maxMagi: d(40000), amount: d(2400) },
        { maxMagi: d(80000), amount: d(2150) },
        { maxMagi: d(749999), amount: d(1900) },
        { maxMagi: null, amount: d(0) },
      ],
    },
    scheduleAdjustments: {
      businessIncomeDeductionCap: {
        default: d(250000),
        married_filing_separately: d(125000),
      },
      medicalSavingsAccountContributionCap: d(5846),
      stableMaxPerBeneficiary: d(4000),
      ohio529MaxPerBeneficiary: d(4000),
      homebuyerPlusMaxPerAccount: d(5000),
      pregnancyResourceCenterContributionWindow: null,
    },
    scheduleCredits: {
      lumpSumAgeMultiples: OHIO_LUMP_SUM_AGE_MULTIPLES,
      lumpSumDistributionBaseAmount: d(50),
      retirementIncomeCreditTiers: [
        { maxIncome: d(500), credit: d(0) },
        { maxIncome: d(1500), credit: d(25) },
        { maxIncome: d(3000), credit: d(50) },
        { maxIncome: d(5000), credit: d(80) },
        { maxIncome: d(8000), credit: d(130) },
        { maxIncome: null, credit: d(200) },
      ],
      retirementCreditMagiLessExemptionsLimit: d(100000),
      seniorCitizenCreditAmount: d(50),
      seniorCreditMagiLessExemptionsLimit: d(100000),
      childCareMagiThresholdFull: d(20000),
      childCareMagiThresholdPartial: d(40000),
      childCarePartialRate: d("0.25"),
      displacedWorkerMaxCredit: d(500),
      displacedWorkerRate: d("0.50"),
      campaignContributionMaxSingle: d(50),
      campaignContributionMaxMfj: d(100),
      exemptionCreditPerExemption: d(20),
      exemptionCreditMagiLessExemptionsLimit: d(30000),
      jointFilingCreditTiers: [
        { maxMagiLessExemptions: d(25000), rate: d("0.20") },
        { maxMagiLessExemptions: d(50000), rate: d("0.15") },
        { maxMagiLessExemptions: d(75000), rate: d("0.10") },
        { maxMagiLessExemptions: null, rate: d("0.05") },
      ],
      jointFilingCreditMax: d(650),
      jointFilingCreditMagiLessExemptionsLimit: d(750000),
      earnedIncomeCreditRate: d("0.30"),
      homeSchoolExpensesCreditMaxPerReturn: d(250),
      homeSchoolExpensesCreditMaxPerStudent: d(250),
      homeSchoolExpensesCreditUsesPerStudentCap: false,
      scholarshipDonationCreditMaxSingle: d(750),
      scholarshipDonationCreditMaxMfj: d(1500),
      noncharteredSchoolTuitionCreditAgiThreshold: d(50000),
      noncharteredSchoolTuitionCreditMaxBelowThreshold: d(1000),
      noncharteredSchoolTuitionCreditMaxAtOrAboveThreshold: d(1500),
      grapeProductionCreditRate: d("0.10"),
    },
    itSd2210: {
      annualRate: d("0.08"),
      quarterlyFactors: [
        { days: 63, factor: d("0.013799") },
        { days: 91, factor: d("0.019932") },
        { days: 121, factor: d("0.026502") },
        { days: 90, factor: d("0.019713") },
      ],
    },
    sd100: {
      seniorCitizenCredit: d(50),
    },
  },
  2025: {
    it1040: {
      nonbusinessBrackets: [
        { lowerBound: d(0), baseTax: d(0), rate: d(0) },
        { lowerBound: d(26050), baseTax: d(342), rate: d("0.0275") },
        { lowerBound: d(100000), baseTax: d("2394.32"), rate: d("0.03125") },
      ],
      businessTaxRate: d("0.03"),
      businessIncomeDeduction: {
        default: d(250000),
        married_filing_separately: d(125000),
      },
      exemptionTiers: [
        { maxMagi: d(40000), amount: d(2400) },
        { maxMagi: d(80000), amount: d(2150) },
        { maxMagi: d(749999), amount: d(1900) },
        { maxMagi: null, amount: d(0) },
      ],
    },
    scheduleAdjustments: {
      businessIncomeDeductionCap: {
        default: d(250000),
        married_filing_separately: d(125000),
      },
      medicalSavingsAccountContributionCap: d(6003),
      stableMaxPerBeneficiary: d(4000),
      ohio529MaxPerBeneficiary: d(4000),
      homebuyerPlusMaxPerAccount: d(5000),
      pregnancyResourceCenterContributionWindow: {
        startInclusive: "2025-09-30",
        endExclusive: "2026-01-01",
      },
    },
    scheduleCredits: {
      lumpSumAgeMultiples: OHIO_LUMP_SUM_AGE_MULTIPLES,
      lumpSumDistributionBaseAmount: d(50),
      retirementIncomeCreditTiers: [
        { maxIncome: d(500), credit: d(0) },
        { maxIncome: d(1500), credit: d(25) },
        { maxIncome: d(3000), credit: d(50) },
        { maxIncome: d(5000), credit: d(80) },
        { maxIncome: d(8000), credit: d(130) },
        { maxIncome: null, credit: d(200) },
      ],
      retirementCreditMagiLessExemptionsLimit: d(100000),
      seniorCitizenCreditAmount: d(50),
      seniorCreditMagiLessExemptionsLimit: d(100000),
      childCareMagiThresholdFull: d(20000),
      childCareMagiThresholdPartial: d(40000),
      childCarePartialRate: d("0.25"),
      displacedWorkerMaxCredit: d(500),
      displacedWorkerRate: d("0.50"),
      campaignContributionMaxSingle: d(50),
      campaignContributionMaxMfj: d(100),
      exemptionCreditPerExemption: d(20),
      exemptionCreditMagiLessExemptionsLimit: d(30000),
      jointFilingCreditTiers: [
        { maxMagiLessExemptions: d(25000), rate: d("0.20") },
        { maxMagiLessExemptions: d(50000), rate: d("0.15") },
        { maxMagiLessExemptions: d(75000), rate: d("0.10") },
        { maxMagiLessExemptions: null, rate: d("0.05") },
      ],
      jointFilingCreditMax: d(650),
      jointFilingCreditMagiLessExemptionsLimit: d(750000),
      earnedIncomeCreditRate: d("0.30"),
      homeSchoolExpensesCreditMaxPerReturn: d(250),
      homeSchoolExpensesCreditMaxPerStudent: d(250),
      homeSchoolExpensesCreditUsesPerStudentCap: true,
      scholarshipDonationCreditMaxSingle: d(750),
      scholarshipDonationCreditMaxMfj: d(1500),
      noncharteredSchoolTuitionCreditAgiThreshold: d(50000),
      noncharteredSchoolTuitionCreditMaxBelowThreshold: d(1000),
      noncharteredSchoolTuitionCreditMaxAtOrAboveThreshold: d(1500),
      grapeProductionCreditRate: d("0.10"),
    },
    itSd2210: {
      annualRate: d("0.08"),
      quarterlyFactors: [
        { days: 62, factor: d("0.013580") },
        { days: 91, factor: d("0.019932") },
        { days: 122, factor: d("0.026311") },
        { days: 90, factor: d("0.017248") },
      ],
    },
    sd100: {
      seniorCitizenCredit: d(50),
    },
  },
};

export type NYIT201BracketGroup = "mfj_qss" | "single_mfs" | "hoh";

export interface NYIT201TaxBracket {
  lowerBound: Decimal;
  upperBound: Decimal | null;
  baseTax: Decimal;
  rate: Decimal;
}

export interface NYIT201RecaptureWorksheet {
  worksheetNumber: number;
  agiFloor: Decimal;
  agiCeiling: Decimal | null;
  maxTaxableIncome: Decimal | null;
  minTaxableIncome: Decimal;
  simpleRate: Decimal | null;
  simpleRateStopAgi: Decimal | null;
  recaptureBase: Decimal;
  incrementalBenefit: Decimal;
  excessAgiThreshold: Decimal;
  isFlatRate: boolean;
}

export interface NYIT201ResidentYearConstants {
  standardDeduction: Record<FilingStatus, Decimal>;
  singleDependentStandardDeduction: Decimal;
  dependentExemption: Decimal;
  taxTableMaxIncome: Decimal;
  recaptureAgiThreshold: Decimal;
  taxBrackets: Record<NYIT201BracketGroup, NYIT201TaxBracket[]>;
  recaptureWorksheets: Record<NYIT201BracketGroup, NYIT201RecaptureWorksheet[]>;
  it217: {
    baseAcreage: Decimal;
    modifiedAgiPhaseoutStart: Decimal;
    modifiedAgiEligibilityCeiling: Decimal;
    modifiedAgiPhaseoutRange: Decimal;
  };
  it270: {
    investmentIncomeLimit: Decimal;
    maxExcessFederalAgi: Decimal;
    incomeThresholds: {
      mfj_qss: Record<number, Decimal>;
      single_mfs_hoh: Record<number, Decimal>;
    };
  };
}

function nyBracket(
  lowerBound: number,
  upperBound: number | null,
  baseTax: string,
  rate: string
): NYIT201TaxBracket {
  return {
    lowerBound: d(lowerBound),
    upperBound: upperBound === null ? null : d(upperBound),
    baseTax: d(baseTax),
    rate: d(rate),
  };
}

function nyWorksheet(params: {
  num: number;
  agiFloor: number;
  agiCeiling: number | null;
  minTI: number;
  maxTI: number | null;
  simpleRate: string | null;
  simpleRateStopAgi: number | null;
  recaptureBase: string;
  incrementalBenefit: string;
  excessAgiThreshold: number;
  isFlatRate?: boolean;
}): NYIT201RecaptureWorksheet {
  return {
    worksheetNumber: params.num,
    agiFloor: d(params.agiFloor),
    agiCeiling: params.agiCeiling === null ? null : d(params.agiCeiling),
    minTaxableIncome: d(params.minTI),
    maxTaxableIncome: params.maxTI === null ? null : d(params.maxTI),
    simpleRate: params.simpleRate === null ? null : d(params.simpleRate),
    simpleRateStopAgi:
      params.simpleRateStopAgi === null ? null : d(params.simpleRateStopAgi),
    recaptureBase: d(params.recaptureBase),
    incrementalBenefit: d(params.incrementalBenefit),
    excessAgiThreshold: d(params.excessAgiThreshold),
    isFlatRate: params.isFlatRate ?? false,
  };
}

export const NY_IT201_RESIDENT_CONSTANTS: Record<number, NYIT201ResidentYearConstants> = {
  2025: {
    standardDeduction: {
      single: d(8000),
      married_filing_jointly: d(16050),
      married_filing_separately: d(8000),
      head_of_household: d(11200),
      qualifying_surviving_spouse: d(16050),
    },
    singleDependentStandardDeduction: d(3100),
    dependentExemption: d(1000),
    taxTableMaxIncome: d(65000),
    recaptureAgiThreshold: d(107650),
    it217: {
      baseAcreage: d(350),
      modifiedAgiPhaseoutStart: d(200000),
      modifiedAgiEligibilityCeiling: d(300000),
      modifiedAgiPhaseoutRange: d(100000),
    },
    it270: {
      investmentIncomeLimit: d(10000),
      maxExcessFederalAgi: d(5000),
      incomeThresholds: {
        mfj_qss: {
          1: d(36789),
          2: d(46350),
          3: d(54545),
          4: d(61071),
          5: d(68403),
          6: d(75204),
          7: d(91902),
        },
        single_mfs_hoh: {
          1: d(31503),
          2: d(36824),
          3: d(46512),
          4: d(53711),
          5: d(59928),
          6: d(65712),
          7: d(74565),
          8: d(88361),
        },
      },
    },
    taxBrackets: {
      mfj_qss: [
        nyBracket(0, 17150, "0", "0.04"),
        nyBracket(17150, 23600, "686", "0.045"),
        nyBracket(23600, 27900, "976", "0.0525"),
        nyBracket(27900, 161550, "1202", "0.055"),
        nyBracket(161550, 323200, "8553", "0.06"),
        nyBracket(323200, 2155350, "18252", "0.0685"),
        nyBracket(2155350, 5000000, "143754", "0.0965"),
        nyBracket(5000000, 25000000, "418263", "0.103"),
        nyBracket(25000000, null, "2478263", "0.109"),
      ],
      single_mfs: [
        nyBracket(0, 8500, "0", "0.04"),
        nyBracket(8500, 11700, "340", "0.045"),
        nyBracket(11700, 13900, "484", "0.0525"),
        nyBracket(13900, 80650, "600", "0.055"),
        nyBracket(80650, 215400, "4271", "0.06"),
        nyBracket(215400, 1077550, "12356", "0.0685"),
        nyBracket(1077550, 5000000, "71413", "0.0965"),
        nyBracket(5000000, 25000000, "449929", "0.103"),
        nyBracket(25000000, null, "2509929", "0.109"),
      ],
      hoh: [
        nyBracket(0, 12800, "0", "0.04"),
        nyBracket(12800, 17650, "512", "0.045"),
        nyBracket(17650, 20900, "730", "0.0525"),
        nyBracket(20900, 107650, "901", "0.055"),
        nyBracket(107650, 269300, "5672", "0.06"),
        nyBracket(269300, 1616450, "15371", "0.0685"),
        nyBracket(1616450, 5000000, "107651", "0.0965"),
        nyBracket(5000000, 25000000, "434163", "0.103"),
        nyBracket(25000000, null, "2494163", "0.109"),
      ],
    },
    recaptureWorksheets: {
      mfj_qss: [
        nyWorksheet({
          num: 1,
          agiFloor: 107650,
          agiCeiling: 25000000,
          minTI: 0,
          maxTI: 161550,
          simpleRate: "0.055",
          simpleRateStopAgi: 157650,
          recaptureBase: "0",
          incrementalBenefit: "0",
          excessAgiThreshold: 107650,
        }),
        nyWorksheet({
          num: 2,
          agiFloor: 161550,
          agiCeiling: 25000000,
          minTI: 161550,
          maxTI: 323200,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "333",
          incrementalBenefit: "807",
          excessAgiThreshold: 161550,
        }),
        nyWorksheet({
          num: 3,
          agiFloor: 323200,
          agiCeiling: 25000000,
          minTI: 323200,
          maxTI: 2155350,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "1140",
          incrementalBenefit: "2747",
          excessAgiThreshold: 323200,
        }),
        nyWorksheet({
          num: 4,
          agiFloor: 2155350,
          agiCeiling: 25000000,
          minTI: 2155350,
          maxTI: 5000000,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "3887",
          incrementalBenefit: "60350",
          excessAgiThreshold: 2155350,
        }),
        nyWorksheet({
          num: 5,
          agiFloor: 5000000,
          agiCeiling: 25000000,
          minTI: 5000000,
          maxTI: null,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "64237",
          incrementalBenefit: "32500",
          excessAgiThreshold: 5000000,
        }),
        nyWorksheet({
          num: 6,
          agiFloor: 25000000,
          agiCeiling: null,
          minTI: 0,
          maxTI: null,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "0",
          incrementalBenefit: "0",
          excessAgiThreshold: 25000000,
          isFlatRate: true,
        }),
      ],
      single_mfs: [
        nyWorksheet({
          num: 7,
          agiFloor: 107650,
          agiCeiling: 25000000,
          minTI: 0,
          maxTI: 215400,
          simpleRate: "0.06",
          simpleRateStopAgi: 157650,
          recaptureBase: "0",
          incrementalBenefit: "0",
          excessAgiThreshold: 107650,
        }),
        nyWorksheet({
          num: 8,
          agiFloor: 215400,
          agiCeiling: 25000000,
          minTI: 215400,
          maxTI: 1077550,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "568",
          incrementalBenefit: "1831",
          excessAgiThreshold: 215400,
        }),
        nyWorksheet({
          num: 9,
          agiFloor: 1077550,
          agiCeiling: 25000000,
          minTI: 1077550,
          maxTI: 5000000,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "2399",
          incrementalBenefit: "30172",
          excessAgiThreshold: 1077550,
        }),
        nyWorksheet({
          num: 10,
          agiFloor: 5000000,
          agiCeiling: 25000000,
          minTI: 5000000,
          maxTI: null,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "32571",
          incrementalBenefit: "32500",
          excessAgiThreshold: 5000000,
        }),
        nyWorksheet({
          num: 11,
          agiFloor: 25000000,
          agiCeiling: null,
          minTI: 0,
          maxTI: null,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "0",
          incrementalBenefit: "0",
          excessAgiThreshold: 25000000,
          isFlatRate: true,
        }),
      ],
      hoh: [
        nyWorksheet({
          num: 12,
          agiFloor: 107650,
          agiCeiling: 25000000,
          minTI: 0,
          maxTI: 269300,
          simpleRate: "0.06",
          simpleRateStopAgi: 157650,
          recaptureBase: "0",
          incrementalBenefit: "0",
          excessAgiThreshold: 107650,
        }),
        nyWorksheet({
          num: 13,
          agiFloor: 269300,
          agiCeiling: 25000000,
          minTI: 269300,
          maxTI: 1616450,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "787",
          incrementalBenefit: "2289",
          excessAgiThreshold: 269300,
        }),
        nyWorksheet({
          num: 14,
          agiFloor: 1616450,
          agiCeiling: 25000000,
          minTI: 1616450,
          maxTI: 5000000,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "3076",
          incrementalBenefit: "45261",
          excessAgiThreshold: 1616450,
        }),
        nyWorksheet({
          num: 15,
          agiFloor: 5000000,
          agiCeiling: 25000000,
          minTI: 5000000,
          maxTI: null,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "48337",
          incrementalBenefit: "32500",
          excessAgiThreshold: 5000000,
        }),
        nyWorksheet({
          num: 16,
          agiFloor: 25000000,
          agiCeiling: null,
          minTI: 0,
          maxTI: null,
          simpleRate: null,
          simpleRateStopAgi: null,
          recaptureBase: "0",
          incrementalBenefit: "0",
          excessAgiThreshold: 25000000,
          isFlatRate: true,
        }),
      ],
    },
  },
};

export const TAX_CONSTANTS: Record<number, YearConstants> = {
  2025: {
    standardDeduction: {
      single: d(15750),
      married_filing_jointly: d(31500),
      married_filing_separately: d(15750),
      head_of_household: d(23625),
      qualifying_surviving_spouse: d(31500),
    },
    taxBrackets: {
      married_filing_jointly: [
        { min: d(0), max: d(23850), rate: d(0.10) },
        { min: d(23850), max: d(96950), rate: d(0.12) },
        { min: d(96950), max: d(206700), rate: d(0.22) },
        { min: d(206700), max: d(394600), rate: d(0.24) },
        { min: d(394600), max: d(501050), rate: d(0.32) },
        { min: d(501050), max: d(751600), rate: d(0.35) },
        { min: d(751600), max: null, rate: d(0.37) },
      ],
      single: [
        { min: d(0), max: d(11925), rate: d(0.10) },
        { min: d(11925), max: d(48475), rate: d(0.12) },
        { min: d(48475), max: d(103350), rate: d(0.22) },
        { min: d(103350), max: d(197300), rate: d(0.24) },
        { min: d(197300), max: d(250525), rate: d(0.32) },
        { min: d(250525), max: d(626350), rate: d(0.35) },
        { min: d(626350), max: null, rate: d(0.37) },
      ],
      married_filing_separately: [
        { min: d(0), max: d(11925), rate: d(0.10) },
        { min: d(11925), max: d(48475), rate: d(0.12) },
        { min: d(48475), max: d(103350), rate: d(0.22) },
        { min: d(103350), max: d(197300), rate: d(0.24) },
        { min: d(197300), max: d(250525), rate: d(0.32) },
        { min: d(250525), max: d(375800), rate: d(0.35) },
        { min: d(375800), max: null, rate: d(0.37) },
      ],
      head_of_household: [
        { min: d(0), max: d(17000), rate: d(0.10) },
        { min: d(17000), max: d(64850), rate: d(0.12) },
        { min: d(64850), max: d(103350), rate: d(0.22) },
        { min: d(103350), max: d(197300), rate: d(0.24) },
        { min: d(197300), max: d(250500), rate: d(0.32) },
        { min: d(250500), max: d(626350), rate: d(0.35) },
        { min: d(626350), max: null, rate: d(0.37) },
      ],
      qualifying_surviving_spouse: [
        { min: d(0), max: d(23850), rate: d(0.10) },
        { min: d(23850), max: d(96950), rate: d(0.12) },
        { min: d(96950), max: d(206700), rate: d(0.22) },
        { min: d(206700), max: d(394600), rate: d(0.24) },
        { min: d(394600), max: d(501050), rate: d(0.32) },
        { min: d(501050), max: d(751600), rate: d(0.35) },
        { min: d(751600), max: null, rate: d(0.37) },
      ],
    },
    capitalGainsRates: {
      zero: {
        threshold: {
          single: d(48350),
          married_filing_jointly: d(96700),
          married_filing_separately: d(48350),
          head_of_household: d(64750),
          qualifying_surviving_spouse: d(96700),
        },
      },
      fifteen: {
        threshold: {
          single: d(533400),
          married_filing_jointly: d(600050),
          married_filing_separately: d(300025),
          head_of_household: d(566700),
          qualifying_surviving_spouse: d(600050),
        },
      },
      twenty: {},
    },
    saltCap: d(10000),
    childTaxCredit: {
      perChild: d(2000),
      otherDependentCredit: d(500),
      phaseOutThreshold: {
        single: d(200000),
        married_filing_jointly: d(400000),
        married_filing_separately: d(200000),
        head_of_household: d(200000),
        qualifying_surviving_spouse: d(200000),
      },
      phaseOutRate: d(50), // $50 per $1000 over threshold
    },
    selfEmploymentTax: {
      socialSecurityRate: d(0.124),
      medicareRate: d(0.029),
      socialSecurityWageBase: d(176100),
      earningsMultiplier: d(0.9235),
      deductiblePortion: d(0.5),
    },
    additionalMedicareTax: {
      rate: d(0.009),
      threshold: {
        single: d(200000),
        married_filing_jointly: d(250000),
        married_filing_separately: d(125000),
        head_of_household: d(200000),
        qualifying_surviving_spouse: d(200000),
      },
    },
    niit: {
      rate: d(0.038),
      threshold: {
        single: d(200000),
        married_filing_jointly: d(250000),
        married_filing_separately: d(125000),
        head_of_household: d(200000),
        qualifying_surviving_spouse: d(250000),
      },
    },
    mortgageInterest: {
      debtLimit: d(750000),
    },
    capitalLossLimit: d(3000),
    estimatedTaxSafeHarbor: d(1.1),
    amt: {
      exemption: {
        single: d(88100),
        married_filing_jointly: d(137000),
        married_filing_separately: d(68500),
        head_of_household: d(88100),
        qualifying_surviving_spouse: d(137000),
      },
      phaseOutThreshold: {
        single: d(609350),
        married_filing_jointly: d(1252700),
        married_filing_separately: d(626350),
        head_of_household: d(609350),
        qualifying_surviving_spouse: d(1252700),
      },
      rate26Limit: {
        single: d(239100),
        married_filing_jointly: d(239100),
        married_filing_separately: d(119550),
        head_of_household: d(239100),
        qualifying_surviving_spouse: d(239100),
      },
    },
    qbi: {
      simplifiedThreshold: {
        single: d(197300),
        married_filing_jointly: d(394600),
        married_filing_separately: d(197300),
        head_of_household: d(197300),
        qualifying_surviving_spouse: d(197300),
      },
      phaseInRange: {
        single: d(50000),
        married_filing_jointly: d(100000),
        married_filing_separately: d(50000),
        head_of_household: d(50000),
        qualifying_surviving_spouse: d(50000),
      },
    },
    studentLoanInterest: {
      maxDeduction: d(2500),
      // Rev. Proc. 2024-40 §2.30: $85K single ($170K MFJ), fully phased out at $100K ($200K MFJ)
      // MFS: cannot claim (IRC §221(e)(2)) — handled in federal.ts, not here
      // QSS: "all other returns" = $85K (IRC §221(b)(2)(B) says "joint returns" only for higher threshold)
      phaseOutStart: {
        single: d(85000),
        married_filing_jointly: d(170000),
        married_filing_separately: d(0), // MFS cannot claim — threshold irrelevant
        head_of_household: d(85000),
        qualifying_surviving_spouse: d(85000),
      },
      phaseOutRange: {
        single: d(15000),
        married_filing_jointly: d(30000),
        married_filing_separately: d(0), // MFS cannot claim
        head_of_household: d(15000),
        qualifying_surviving_spouse: d(15000),
      },
    },
    studentLoanInterestDeduction: {
      phaseOutStart: {
        single: d(85000),
        married_filing_jointly: d(170000),
        married_filing_separately: d(0),
        head_of_household: d(85000),
        qualifying_surviving_spouse: d(85000),
      },
      phaseOutEnd: {
        single: d(100000),
        married_filing_jointly: d(200000),
        married_filing_separately: d(0),
        head_of_household: d(100000),
        qualifying_surviving_spouse: d(100000),
      },
    },
    hsa: {
      selfOnlyContributionLimit: d(4300),
      familyContributionLimit: d(8550),
      catchUpContribution: d(1000),
    },
    iraDeduction: {
      contributionLimit: d(7000),
      catchUpContribution: d(1000), // age 50+ gets $8,000 total
      // Rev. Proc. 2024-40 §3.20
      activeParticipantPhaseOutStart: {
        single: d(79000),
        married_filing_jointly: d(126000),
        married_filing_separately: d(0),
        head_of_household: d(79000),
        qualifying_surviving_spouse: d(126000),
      },
      activeParticipantPhaseOutRange: {
        single: d(10000),
        married_filing_jointly: d(20000),
        married_filing_separately: d(10000),
        head_of_household: d(10000),
        qualifying_surviving_spouse: d(20000),
      },
      // Non-participant married to active participant: $236K-$246K
      spouseActiveParticipantPhaseOutStart: d(236000),
      spouseActiveParticipantPhaseOutRange: d(10000),
    },
    eitc: {
      investmentIncomeLimit: d(11950),
      // Statutory rates — IRC §32(b)(1), unchanged year to year
      creditRate: { 0: d("0.0765"), 1: d("0.34"), 2: d("0.40"), 3: d("0.45") },
      phaseOutRate: { 0: d("0.0765"), 1: d("0.1598"), 2: d("0.2106"), 3: d("0.2106") },
      // Inflation-adjusted per Rev. Proc. 2024-40 §3.06
      earnedIncomeAmount: { 0: d(8490), 1: d(12730), 2: d(17880), 3: d(17880) },
      phaseOutStartSingleHoH: { 0: d(10620), 1: d(23350), 2: d(23350), 3: d(23350) },
      phaseOutStartMFJ: { 0: d(17730), 1: d(30470), 2: d(30470), 3: d(30470) },
    },
    // Statutory limits — IRC §30D, §25E (not inflation-adjusted)
    cleanVehicleCredit: {
      newVehicle: {
        criticalMineralsCredit: d(3750),
        batteryComponentsCredit: d(3750),
        msrpLimitSuvVanPickup: d(80000),
        msrpLimitOther: d(55000),
        magiLimit: {
          single: d(150000),
          married_filing_jointly: d(300000),
          married_filing_separately: d(150000),
          head_of_household: d(225000),
          qualifying_surviving_spouse: d(300000),
        },
      },
      previouslyOwned: {
        maxCredit: d(4000),
        creditRate: d("0.30"),
        maxSalePrice: d(25000),
        magiLimit: {
          single: d(75000),
          married_filing_jointly: d(150000),
          married_filing_separately: d(75000),
          head_of_household: d(112500),
          qualifying_surviving_spouse: d(150000),
        },
      },
    },
    householdEmployment: {
      cashWageThreshold: d(2800),
      socialSecurityRate: d("0.124"),
      medicareRate: d("0.029"),
      additionalMedicareRate: d("0.009"),
      additionalMedicareThreshold: d(200000),
      socialSecurityWageBase: d(176100),
      futaGrossRate: d("0.06"),
      futaMaxCredit: d("0.054"),
      futaNetRate: d("0.006"),
      futaWageBase: d(7000),
      futaQuarterlyThreshold: d(1000),
    },
    foreignEarnedIncomeExclusion: {
      maximumExclusion: d(130000),
      baseHousingPercentage: d("0.16"),
      defaultMaxHousingPercentage: d("0.30"),
    },
    kiddieTax: {
      unearnedIncomeThreshold: d(2700),
      itemizingThreshold: d(1350),
    },
    form8814: {
      baseAmount: d(2700),
      amountNotTaxed: d(1350),
      maximumChildIncome: d(13500),
      taxRate: d("0.10"),
    },
    adoptionCredit: {
      maxCreditPerChild: d(17280),
      phaseOutThreshold: d(259190),
      phaseOutRange: d(40000),
    },
    // Rev. Proc. 2024-40 §3.36: $313,000 ($626,000 for joint returns)
    excessBusinessLoss: {
      threshold: {
        single: d(313000),
        married_filing_jointly: d(626000),
        married_filing_separately: d(313000),
        head_of_household: d(313000),
        qualifying_surviving_spouse: d(313000),
      },
    },
    elderlyOrDisabledCredit: {
      initialAmountSingle: d(5000),
      initialAmountBoth: d(7500),
      initialAmountMFS: d(3750),
      agiThreshold: {
        single: d(7500),
        married_filing_jointly: d(10000),
        married_filing_separately: d(5000),
        head_of_household: d(7500),
        qualifying_surviving_spouse: d(7500),
      },
      creditRate: d("0.15"),
    },
    // IRC §121(b)(1)-(2): statutory amounts, not indexed for inflation
    homeSaleExclusion: {
      maxExclusionSingle: d(250000),
      maxExclusionMFJ: d(500000),
    },
    qualifiedPrincipalResidenceExclusion: {
      maxExclusion: d(750000),
      maxExclusionMFS: d(375000),
    },
    // IRC §408(d)(8)(A), SECURE 2.0 Act §307 — indexed for inflation starting 2024
    // Rev. Proc. 2024-40 §3.27: $105,000 for 2025
    qcd: {
      annualLimit: d(105000),
    },
    // IRC §213(d)(10) — Qualified long-term care insurance premium limits by attained age
    // Rev. Proc. 2024-40 §3.18 for 2025
    longTermCarePremiumLimits: {
      age40OrUnder: d(480),
      age41to50: d(890),
      age51to60: d(1790),
      age61to70: d(4770),
      age71OrOlder: d(5960),
    },
    state: {
      njResident: {
        filingThresholds: {
          single: d(10000),
          married_filing_jointly: d(20000),
          married_filing_separately: d(10000),
          head_of_household: d(20000),
          qualifying_surviving_spouse: d(20000),
        },
        exemptionAmounts: {
          self: d(1000),
          spouse: d(1000),
          age65OrOlder: d(1000),
          blindOrDisabled: d(1000),
          veteran: d(6000),
          dependent: d(1500),
          collegeDependent: d(1000),
        },
        propertyTax: {
          deductionCap: d(15000),
          sharedHomeMFSDeductionCap: d(7500),
          rentToPropertyTaxRate: d("0.18"),
          creditAmount: d(50),
          sharedHomeMFSCreditAmount: d(25),
          creditIncomeLimit: d(250000),
        },
        taxRateTables: {
          tableA: [
            { min: d(0), max: d(20000), rate: d("0.014") },
            { min: d(20000), max: d(35000), rate: d("0.0175") },
            { min: d(35000), max: d(40000), rate: d("0.035") },
            { min: d(40000), max: d(75000), rate: d("0.05525") },
            { min: d(75000), max: d(500000), rate: d("0.0637") },
            { min: d(500000), max: d(1000000), rate: d("0.0897") },
            { min: d(1000000), max: null, rate: d("0.1075") },
          ],
          tableB: [
            { min: d(0), max: d(20000), rate: d("0.014") },
            { min: d(20000), max: d(50000), rate: d("0.0175") },
            { min: d(50000), max: d(70000), rate: d("0.0245") },
            { min: d(70000), max: d(80000), rate: d("0.035") },
            { min: d(80000), max: d(150000), rate: d("0.05525") },
            { min: d(150000), max: d(500000), rate: d("0.0637") },
            { min: d(500000), max: d(1000000), rate: d("0.0897") },
            { min: d(1000000), max: null, rate: d("0.1075") },
          ],
        },
      },
    },
  },
};

TAX_CONSTANTS[2026] = TAX_CONSTANTS[2025];

// ---------------------------------------------------------------------------
// MACRS Depreciation Tables — IRS Publication 946
// ---------------------------------------------------------------------------

export type MACRSRecoveryPeriod = 3 | 5 | 7 | 10 | 15 | 20 | 25 | 27.5 | 39;
export type MACRSConvention = "halfYear" | "midQuarter" | "midMonth";
export type MACRSMethod = "200DB" | "150DB" | "SL";

/**
 * Table A-1: GDS 200% Declining Balance, Half-Year Convention.
 * Index 0 = year 1 (placed-in-service year), index N = year N+1.
 * Percentages are expressed as Decimals (e.g., 33.33 means 33.33%).
 */
export const MACRS_GDS_200DB_HALF_YEAR: Record<number, Decimal[]> = {
  3: [d("33.33"), d("44.45"), d("14.81"), d("7.41")],
  5: [d("20.00"), d("32.00"), d("19.20"), d("11.52"), d("11.52"), d("5.76")],
  7: [d("14.29"), d("24.49"), d("17.49"), d("12.49"), d("8.93"), d("8.92"), d("8.93"), d("4.46")],
  10: [d("10.00"), d("18.00"), d("14.40"), d("11.52"), d("9.22"), d("7.37"), d("6.55"), d("6.55"), d("6.56"), d("6.55"), d("3.28")],
  15: [d("5.00"), d("9.50"), d("8.55"), d("7.70"), d("6.93"), d("6.23"), d("5.90"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("2.95")],
  20: [d("3.750"), d("7.219"), d("6.677"), d("6.177"), d("5.713"), d("5.285"), d("4.888"), d("4.522"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("2.231")],
};

/**
 * Table A-5: GDS 150% Declining Balance, Half-Year Convention.
 * Used for farm property (3, 5, 7, 10, 15, 20 year) under GDS 150% DB.
 */
export const MACRS_GDS_150DB_HALF_YEAR: Record<number, Decimal[]> = {
  3: [d("25.00"), d("37.50"), d("25.00"), d("12.50")],
  5: [d("15.00"), d("25.50"), d("17.85"), d("16.66"), d("16.66"), d("8.33")],
  7: [d("10.71"), d("19.13"), d("15.03"), d("12.25"), d("12.25"), d("12.25"), d("12.25"), d("6.13")],
  10: [d("7.50"), d("13.88"), d("11.79"), d("10.02"), d("8.74"), d("8.74"), d("8.74"), d("8.74"), d("8.74"), d("8.74"), d("4.37")],
  15: [d("5.00"), d("9.50"), d("8.55"), d("7.70"), d("6.93"), d("6.23"), d("5.90"), d("5.90"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("2.95")],
  20: [d("3.750"), d("7.219"), d("6.677"), d("6.177"), d("5.713"), d("5.285"), d("4.888"), d("4.522"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("4.462"), d("4.461"), d("2.231")],
};

/**
 * Table A-6: Residential Rental Property (27.5-Year), Mid-Month Convention.
 * Outer key = month placed in service (1–12).
 * Inner array = percentage for each recovery year (index 0 = year 1).
 * Straight-line method over 27.5 years.
 */
export const MACRS_RESIDENTIAL_RENTAL_MID_MONTH: Record<number, Decimal[]> = {
  1:  [d("3.485"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("1.970")],
  2:  [d("3.182"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("2.273")],
  3:  [d("2.879"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("2.576")],
  4:  [d("2.576"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("2.879")],
  5:  [d("2.273"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.182")],
  6:  [d("1.970"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.485")],
  7:  [d("1.667"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.788")],
  8:  [d("1.364"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("4.091")],
  9:  [d("1.061"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("4.394")],
  10: [d("0.758"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("4.697")],
  11: [d("0.455"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("5.000")],
  12: [d("0.152"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("3.636"), d("5.303")],
};

/**
 * Table A-7a: Nonresidential Real Property (39-Year), Mid-Month Convention.
 * Outer key = month placed in service (1–12).
 * Inner array = percentage for each recovery year (index 0 = year 1).
 * Straight-line method over 39 years.
 */
export const MACRS_NONRESIDENTIAL_REAL_MID_MONTH: Record<number, Decimal[]> = {
  1:  [d("2.461"), ...Array(38).fill(null).map(() => d("2.564")), d("0.107")],
  2:  [d("2.247"), ...Array(38).fill(null).map(() => d("2.564")), d("0.321")],
  3:  [d("2.033"), ...Array(38).fill(null).map(() => d("2.564")), d("0.535")],
  4:  [d("1.819"), ...Array(38).fill(null).map(() => d("2.564")), d("0.749")],
  5:  [d("1.605"), ...Array(38).fill(null).map(() => d("2.564")), d("0.963")],
  6:  [d("1.391"), ...Array(38).fill(null).map(() => d("2.564")), d("1.177")],
  7:  [d("1.177"), ...Array(38).fill(null).map(() => d("2.564")), d("1.391")],
  8:  [d("0.963"), ...Array(38).fill(null).map(() => d("2.564")), d("1.605")],
  9:  [d("0.749"), ...Array(38).fill(null).map(() => d("2.564")), d("1.819")],
  10: [d("0.535"), ...Array(38).fill(null).map(() => d("2.564")), d("2.033")],
  11: [d("0.321"), ...Array(38).fill(null).map(() => d("2.564")), d("2.247")],
  12: [d("0.107"), ...Array(38).fill(null).map(() => d("2.564")), d("2.461")],
};

/**
 * GDS Straight-Line, Half-Year Convention (ADS or elective SL under GDS).
 * Used when the taxpayer elects straight-line or ADS applies.
 */
export const MACRS_GDS_SL_HALF_YEAR: Record<number, Decimal[]> = {
  3:  [d("16.67"), d("33.33"), d("33.33"), d("16.67")],
  5:  [d("10.00"), d("20.00"), d("20.00"), d("20.00"), d("20.00"), d("10.00")],
  7:  [d("7.14"), d("14.29"), d("14.29"), d("14.28"), d("14.29"), d("14.28"), d("14.29"), d("7.14")],
  10: [d("5.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("5.00")],
  15: [d("3.33"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.66"), d("6.67"), d("6.66"), d("6.67"), d("6.66"), d("6.67"), d("6.66"), d("6.67"), d("6.66"), d("3.33")],
  20: [d("2.500"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("2.500")],
  25: [d("2.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("4.00"), d("2.00")],
};

/**
 * Tables A-2 through A-5: GDS 200% Declining Balance, Mid-Quarter Convention.
 * Outer key = quarter placed in service (1–4). Inner key = recovery period.
 * IRS Publication 946, Appendix A.
 */
export const MACRS_GDS_200DB_MID_QUARTER: Record<number, Record<number, Decimal[]>> = {
  1: {
    3:  [d("58.33"), d("27.78"), d("12.35"), d("1.54")],
    5:  [d("35.00"), d("26.00"), d("15.60"), d("11.01"), d("11.01"), d("1.38")],
    7:  [d("25.00"), d("21.43"), d("15.31"), d("10.93"), d("8.75"), d("8.74"), d("8.75"), d("1.09")],
    10: [d("17.50"), d("16.50"), d("13.20"), d("10.56"), d("8.45"), d("6.76"), d("6.55"), d("6.55"), d("6.56"), d("6.55"), d("0.82")],
    15: [d("11.67"), d("11.78"), d("10.21"), d("8.85"), d("7.67"), d("6.64"), d("5.76"), d("4.99"), d("4.55"), d("4.55"), d("4.55"), d("4.55"), d("4.55"), d("4.56"), d("4.55"), d("0.57")],
    20: [d("8.750"), d("9.125"), d("8.213"), d("7.391"), d("6.652"), d("5.987"), d("5.388"), d("4.849"), d("4.365"), d("3.928"), d("3.535"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.486"), d("3.487"), d("3.486"), d("0.436")],
  },
  2: {
    3:  [d("41.67"), d("38.89"), d("14.14"), d("5.30")],
    5:  [d("25.00"), d("30.00"), d("18.00"), d("11.37"), d("11.37"), d("4.26")],
    7:  [d("17.86"), d("23.47"), d("16.76"), d("11.97"), d("8.87"), d("8.87"), d("8.87"), d("3.33")],
    10: [d("12.50"), d("17.50"), d("14.00"), d("11.20"), d("8.96"), d("7.17"), d("6.55"), d("6.55"), d("6.56"), d("6.55"), d("2.46")],
    15: [d("8.33"), d("12.22"), d("10.59"), d("9.18"), d("7.96"), d("6.90"), d("5.98"), d("5.18"), d("4.56"), d("4.56"), d("4.57"), d("4.56"), d("4.57"), d("4.56"), d("4.57"), d("1.71")],
    20: [d("6.250"), d("9.375"), d("8.438"), d("7.594"), d("6.834"), d("6.151"), d("5.536"), d("4.982"), d("4.484"), d("4.036"), d("3.632"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.486"), d("3.487"), d("3.486"), d("3.487"), d("1.307")],
  },
  3: {
    3:  [d("25.00"), d("50.00"), d("16.67"), d("8.33")],
    5:  [d("15.00"), d("34.00"), d("20.40"), d("12.24"), d("11.30"), d("7.06")],
    7:  [d("10.71"), d("25.51"), d("18.22"), d("13.02"), d("9.30"), d("8.85"), d("8.86"), d("5.53")],
    10: [d("7.50"), d("18.50"), d("14.80"), d("11.84"), d("9.47"), d("7.58"), d("6.55"), d("6.55"), d("6.56"), d("6.55"), d("4.10")],
    15: [d("5.00"), d("12.67"), d("10.98"), d("9.51"), d("8.25"), d("7.15"), d("6.19"), d("5.37"), d("4.65"), d("4.56"), d("4.56"), d("4.56"), d("4.57"), d("4.56"), d("4.57"), d("2.85")],
    20: [d("3.750"), d("9.625"), d("8.663"), d("7.796"), d("7.017"), d("6.315"), d("5.683"), d("5.115"), d("4.604"), d("4.143"), d("3.729"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.486"), d("3.487"), d("3.486"), d("3.487"), d("2.179")],
  },
  4: {
    3:  [d("8.33"), d("61.11"), d("20.37"), d("10.19")],
    5:  [d("5.00"), d("38.00"), d("22.80"), d("13.68"), d("10.94"), d("9.58")],
    7:  [d("3.57"), d("27.55"), d("19.68"), d("14.06"), d("10.04"), d("8.73"), d("8.73"), d("7.64")],
    10: [d("2.50"), d("19.50"), d("15.60"), d("12.48"), d("9.98"), d("7.99"), d("6.55"), d("6.55"), d("6.56"), d("6.55"), d("5.74")],
    15: [d("1.67"), d("13.11"), d("11.36"), d("9.85"), d("8.53"), d("7.40"), d("6.41"), d("5.56"), d("4.81"), d("4.55"), d("4.55"), d("4.55"), d("4.55"), d("4.56"), d("4.55"), d("3.99")],
    20: [d("1.250"), d("9.875"), d("8.888"), d("7.999"), d("7.199"), d("6.479"), d("5.831"), d("5.248"), d("4.723"), d("4.251"), d("3.826"), d("3.487"), d("3.487"), d("3.487"), d("3.487"), d("3.486"), d("3.487"), d("3.486"), d("3.487"), d("3.486"), d("3.051")],
  },
};

/**
 * GDS 150% Declining Balance, Mid-Quarter Convention.
 * Outer key = quarter placed in service (1–4). Inner key = recovery period.
 * IRS Publication 946, Appendix A.
 */
export const MACRS_GDS_150DB_MID_QUARTER: Record<number, Record<number, Decimal[]>> = {
  1: {
    3:  [d("43.75"), d("28.13"), d("25.00"), d("3.12")],
    5:  [d("26.25"), d("22.13"), d("16.52"), d("16.52"), d("16.52"), d("2.06")],
    7:  [d("18.75"), d("17.41"), d("13.68"), d("12.16"), d("12.16"), d("12.16"), d("12.16"), d("1.52")],
    10: [d("13.13"), d("13.03"), d("11.08"), d("9.41"), d("8.71"), d("8.71"), d("8.71"), d("8.71"), d("8.71"), d("8.71"), d("1.09")],
    15: [d("8.75"), d("9.13"), d("8.21"), d("7.39"), d("6.65"), d("5.99"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("0.74")],
    20: [d("6.563"), d("7.008"), d("6.482"), d("5.996"), d("5.546"), d("5.130"), d("4.746"), d("4.459"), d("4.459"), d("4.459"), d("4.459"), d("4.460"), d("4.459"), d("4.460"), d("4.459"), d("4.460"), d("4.459"), d("4.460"), d("4.459"), d("4.460"), d("0.557")],
  },
  2: {
    3:  [d("31.25"), d("34.38"), d("25.00"), d("9.37")],
    5:  [d("18.75"), d("24.38"), d("17.06"), d("16.76"), d("16.76"), d("6.29")],
    7:  [d("13.39"), d("18.56"), d("14.58"), d("12.22"), d("12.22"), d("12.22"), d("12.23"), d("4.58")],
    10: [d("9.38"), d("13.59"), d("11.55"), d("9.82"), d("8.73"), d("8.73"), d("8.73"), d("8.73"), d("8.73"), d("8.73"), d("3.28")],
    15: [d("6.25"), d("9.38"), d("8.44"), d("7.59"), d("6.83"), d("6.15"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("2.21")],
    20: [d("4.688"), d("7.148"), d("6.612"), d("6.116"), d("5.658"), d("5.233"), d("4.841"), d("4.478"), d("4.463"), d("4.463"), d("4.463"), d("4.463"), d("4.463"), d("4.463"), d("4.462"), d("4.463"), d("4.462"), d("4.463"), d("4.462"), d("4.463"), d("1.673")],
  },
  3: {
    3:  [d("18.75"), d("40.63"), d("25.00"), d("15.62")],
    5:  [d("11.25"), d("26.63"), d("18.64"), d("16.56"), d("16.57"), d("10.35")],
    7:  [d("8.04"), d("19.71"), d("15.48"), d("12.27"), d("12.28"), d("12.27"), d("12.28"), d("7.67")],
    10: [d("5.63"), d("14.16"), d("12.03"), d("10.23"), d("8.75"), d("8.75"), d("8.75"), d("8.74"), d("8.75"), d("8.74"), d("5.47")],
    15: [d("3.75"), d("9.63"), d("8.66"), d("7.80"), d("7.02"), d("6.31"), d("5.90"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("3.69")],
    20: [d("2.813"), d("7.289"), d("6.742"), d("6.237"), d("5.769"), d("5.336"), d("4.936"), d("4.566"), d("4.460"), d("4.460"), d("4.460"), d("4.460"), d("4.461"), d("4.460"), d("4.461"), d("4.460"), d("4.461"), d("4.460"), d("4.461"), d("4.460"), d("2.788")],
  },
  4: {
    3:  [d("6.25"), d("46.88"), d("25.00"), d("21.87")],
    5:  [d("3.75"), d("28.88"), d("20.21"), d("16.40"), d("16.41"), d("14.35")],
    7:  [d("2.68"), d("20.85"), d("16.39"), d("12.87"), d("12.18"), d("12.18"), d("12.19"), d("10.66")],
    10: [d("1.88"), d("14.72"), d("12.51"), d("10.63"), d("9.04"), d("8.72"), d("8.72"), d("8.72"), d("8.72"), d("8.71"), d("7.63")],
    15: [d("1.25"), d("9.88"), d("8.89"), d("8.00"), d("7.20"), d("6.48"), d("5.90"), d("5.90"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.91"), d("5.90"), d("5.17")],
    20: [d("0.938"), d("7.430"), d("6.872"), d("6.357"), d("5.880"), d("5.439"), d("5.031"), d("4.654"), d("4.458"), d("4.458"), d("4.458"), d("4.458"), d("4.458"), d("4.458"), d("4.458"), d("4.458"), d("4.458"), d("4.459"), d("4.458"), d("4.459"), d("3.901")],
  },
};

/**
 * GDS Straight-Line, Mid-Quarter Convention.
 * Outer key = quarter placed in service (1–4). Inner key = recovery period.
 * IRS Publication 946, Appendix A.
 */
export const MACRS_GDS_SL_MID_QUARTER: Record<number, Record<number, Decimal[]>> = {
  1: {
    3:  [d("29.16"), d("33.33"), d("33.33"), d("4.18")],
    5:  [d("17.50"), d("20.00"), d("20.00"), d("20.00"), d("20.00"), d("2.50")],
    7:  [d("12.50"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("1.76")],
    10: [d("8.75"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("1.25")],
    15: [d("5.84"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("0.78")],
    20: [d("4.375"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("0.625")],
  },
  2: {
    3:  [d("20.83"), d("33.33"), d("33.33"), d("12.51")],
    5:  [d("12.50"), d("20.00"), d("20.00"), d("20.00"), d("20.00"), d("7.50")],
    7:  [d("8.93"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("5.33")],
    10: [d("6.25"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("3.75")],
    15: [d("4.17"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("2.45")],
    20: [d("3.125"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("1.875")],
  },
  3: {
    3:  [d("12.50"), d("33.33"), d("33.33"), d("20.84")],
    5:  [d("7.50"), d("20.00"), d("20.00"), d("20.00"), d("20.00"), d("12.50")],
    7:  [d("5.36"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("8.90")],
    10: [d("3.75"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("6.25")],
    15: [d("2.50"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("4.12")],
    20: [d("1.875"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("3.125")],
  },
  4: {
    3:  [d("4.17"), d("33.33"), d("33.33"), d("29.17")],
    5:  [d("2.50"), d("20.00"), d("20.00"), d("20.00"), d("20.00"), d("17.50")],
    7:  [d("1.79"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("14.29"), d("12.47")],
    10: [d("1.25"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("10.00"), d("8.75")],
    15: [d("0.83"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("6.67"), d("5.79")],
    20: [d("0.625"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("5.000"), d("4.375")],
  },
};

// ---------------------------------------------------------------------------
// IRC §280F Passenger Automobile Depreciation Limits
// ---------------------------------------------------------------------------

/**
 * Annual depreciation caps for passenger automobiles under IRC §280F(a).
 *
 * Index 0 = year 1 (placed-in-service year), index 1 = year 2, etc.
 * Year 4+ uses the final entry (index 3) for all subsequent recovery years.
 *
 * `withBonus[0]` is the year-1 limit when first-year bonus depreciation is claimed.
 * `withoutBonus[0]` is the year-1 limit without bonus depreciation.
 * Years 2+ are the same regardless of bonus election.
 *
 * Reference: Rev. Proc. 2024-13, §5.01 (2025 tax year limits).
 */
export const SECTION_280F_LIMITS: Record<number, { withBonus: Decimal[]; withoutBonus: Decimal[] }> = {
  2025: {
    withBonus:    [d("20400"), d("19800"), d("11900"), d("7160")],
    withoutBonus: [d("12400"), d("19800"), d("11900"), d("7160")],
  },
};

/** ADS recovery period for passenger automobiles: 5 years per IRC §280F(a)(1)(B). */
export const SECTION_280F_ADS_RECOVERY_PERIOD = 5;

// ---------------------------------------------------------------------------
// Schedule J Base-Year Tax Constants (IRC §1301 — Farm Income Averaging)
// Only tax brackets and capital gains thresholds are needed for base years.
// ---------------------------------------------------------------------------

export interface BaseYearTaxConstants {
  taxBrackets: Record<FilingStatus, TaxBracket[]>;
  capitalGainsRates: {
    zero: { threshold: Record<FilingStatus, Decimal> };
    fifteen: { threshold: Record<FilingStatus, Decimal> };
  };
}

export interface PATaxConstants {
  /** PA flat personal income tax rate */
  personalIncomeTaxRate: Decimal;
}

export interface StateTaxConstants {
  pa: Record<number, PATaxConstants>;
}

/**
 * Base-year tax constants for Schedule J farm income averaging.
 * For tax year 2025, base years are 2022, 2023, and 2024.
 * Sources: Rev. Proc. 2021-45 (2022), Rev. Proc. 2022-38 (2023), Rev. Proc. 2023-34 (2024).
 */
export const BASE_YEAR_TAX_CONSTANTS: Record<number, BaseYearTaxConstants> = {
  // ── 2022 (Rev. Proc. 2021-45) ─────────────────────────────
  2022: {
    taxBrackets: {
      single: [
        { min: d(0), max: d(10275), rate: d(0.10) },
        { min: d(10275), max: d(41775), rate: d(0.12) },
        { min: d(41775), max: d(89075), rate: d(0.22) },
        { min: d(89075), max: d(170050), rate: d(0.24) },
        { min: d(170050), max: d(215950), rate: d(0.32) },
        { min: d(215950), max: d(539900), rate: d(0.35) },
        { min: d(539900), max: null, rate: d(0.37) },
      ],
      married_filing_jointly: [
        { min: d(0), max: d(20550), rate: d(0.10) },
        { min: d(20550), max: d(83550), rate: d(0.12) },
        { min: d(83550), max: d(178150), rate: d(0.22) },
        { min: d(178150), max: d(340100), rate: d(0.24) },
        { min: d(340100), max: d(431900), rate: d(0.32) },
        { min: d(431900), max: d(647850), rate: d(0.35) },
        { min: d(647850), max: null, rate: d(0.37) },
      ],
      married_filing_separately: [
        { min: d(0), max: d(10275), rate: d(0.10) },
        { min: d(10275), max: d(41775), rate: d(0.12) },
        { min: d(41775), max: d(89075), rate: d(0.22) },
        { min: d(89075), max: d(170050), rate: d(0.24) },
        { min: d(170050), max: d(215950), rate: d(0.32) },
        { min: d(215950), max: d(323925), rate: d(0.35) },
        { min: d(323925), max: null, rate: d(0.37) },
      ],
      head_of_household: [
        { min: d(0), max: d(14650), rate: d(0.10) },
        { min: d(14650), max: d(55900), rate: d(0.12) },
        { min: d(55900), max: d(89050), rate: d(0.22) },
        { min: d(89050), max: d(170050), rate: d(0.24) },
        { min: d(170050), max: d(215950), rate: d(0.32) },
        { min: d(215950), max: d(539900), rate: d(0.35) },
        { min: d(539900), max: null, rate: d(0.37) },
      ],
      qualifying_surviving_spouse: [
        { min: d(0), max: d(20550), rate: d(0.10) },
        { min: d(20550), max: d(83550), rate: d(0.12) },
        { min: d(83550), max: d(178150), rate: d(0.22) },
        { min: d(178150), max: d(340100), rate: d(0.24) },
        { min: d(340100), max: d(431900), rate: d(0.32) },
        { min: d(431900), max: d(647850), rate: d(0.35) },
        { min: d(647850), max: null, rate: d(0.37) },
      ],
    },
    capitalGainsRates: {
      zero: {
        threshold: {
          single: d(41675),
          married_filing_jointly: d(83350),
          married_filing_separately: d(41675),
          head_of_household: d(55800),
          qualifying_surviving_spouse: d(83350),
        },
      },
      fifteen: {
        threshold: {
          single: d(459750),
          married_filing_jointly: d(517200),
          married_filing_separately: d(258600),
          head_of_household: d(488500),
          qualifying_surviving_spouse: d(517200),
        },
      },
    },
  },

  // ── 2023 (Rev. Proc. 2022-38) ─────────────────────────────
  2023: {
    taxBrackets: {
      single: [
        { min: d(0), max: d(11000), rate: d(0.10) },
        { min: d(11000), max: d(44725), rate: d(0.12) },
        { min: d(44725), max: d(95375), rate: d(0.22) },
        { min: d(95375), max: d(182100), rate: d(0.24) },
        { min: d(182100), max: d(231250), rate: d(0.32) },
        { min: d(231250), max: d(578125), rate: d(0.35) },
        { min: d(578125), max: null, rate: d(0.37) },
      ],
      married_filing_jointly: [
        { min: d(0), max: d(22000), rate: d(0.10) },
        { min: d(22000), max: d(89450), rate: d(0.12) },
        { min: d(89450), max: d(190750), rate: d(0.22) },
        { min: d(190750), max: d(364200), rate: d(0.24) },
        { min: d(364200), max: d(462500), rate: d(0.32) },
        { min: d(462500), max: d(693750), rate: d(0.35) },
        { min: d(693750), max: null, rate: d(0.37) },
      ],
      married_filing_separately: [
        { min: d(0), max: d(11000), rate: d(0.10) },
        { min: d(11000), max: d(44725), rate: d(0.12) },
        { min: d(44725), max: d(95375), rate: d(0.22) },
        { min: d(95375), max: d(182100), rate: d(0.24) },
        { min: d(182100), max: d(231250), rate: d(0.32) },
        { min: d(231250), max: d(346875), rate: d(0.35) },
        { min: d(346875), max: null, rate: d(0.37) },
      ],
      head_of_household: [
        { min: d(0), max: d(15700), rate: d(0.10) },
        { min: d(15700), max: d(59850), rate: d(0.12) },
        { min: d(59850), max: d(95350), rate: d(0.22) },
        { min: d(95350), max: d(182100), rate: d(0.24) },
        { min: d(182100), max: d(231250), rate: d(0.32) },
        { min: d(231250), max: d(578100), rate: d(0.35) },
        { min: d(578100), max: null, rate: d(0.37) },
      ],
      qualifying_surviving_spouse: [
        { min: d(0), max: d(22000), rate: d(0.10) },
        { min: d(22000), max: d(89450), rate: d(0.12) },
        { min: d(89450), max: d(190750), rate: d(0.22) },
        { min: d(190750), max: d(364200), rate: d(0.24) },
        { min: d(364200), max: d(462500), rate: d(0.32) },
        { min: d(462500), max: d(693750), rate: d(0.35) },
        { min: d(693750), max: null, rate: d(0.37) },
      ],
    },
    capitalGainsRates: {
      zero: {
        threshold: {
          single: d(44625),
          married_filing_jointly: d(89250),
          married_filing_separately: d(44625),
          head_of_household: d(59750),
          qualifying_surviving_spouse: d(89250),
        },
      },
      fifteen: {
        threshold: {
          single: d(492300),
          married_filing_jointly: d(553850),
          married_filing_separately: d(276900),
          head_of_household: d(523050),
          qualifying_surviving_spouse: d(553850),
        },
      },
    },
  },

  // ── 2024 (Rev. Proc. 2023-34) ─────────────────────────────
  2024: {
    taxBrackets: {
      single: [
        { min: d(0), max: d(11600), rate: d(0.10) },
        { min: d(11600), max: d(47150), rate: d(0.12) },
        { min: d(47150), max: d(100525), rate: d(0.22) },
        { min: d(100525), max: d(191950), rate: d(0.24) },
        { min: d(191950), max: d(243725), rate: d(0.32) },
        { min: d(243725), max: d(609350), rate: d(0.35) },
        { min: d(609350), max: null, rate: d(0.37) },
      ],
      married_filing_jointly: [
        { min: d(0), max: d(23200), rate: d(0.10) },
        { min: d(23200), max: d(94300), rate: d(0.12) },
        { min: d(94300), max: d(201050), rate: d(0.22) },
        { min: d(201050), max: d(383900), rate: d(0.24) },
        { min: d(383900), max: d(487450), rate: d(0.32) },
        { min: d(487450), max: d(731200), rate: d(0.35) },
        { min: d(731200), max: null, rate: d(0.37) },
      ],
      married_filing_separately: [
        { min: d(0), max: d(11600), rate: d(0.10) },
        { min: d(11600), max: d(47150), rate: d(0.12) },
        { min: d(47150), max: d(100525), rate: d(0.22) },
        { min: d(100525), max: d(191950), rate: d(0.24) },
        { min: d(191950), max: d(243725), rate: d(0.32) },
        { min: d(243725), max: d(365600), rate: d(0.35) },
        { min: d(365600), max: null, rate: d(0.37) },
      ],
      head_of_household: [
        { min: d(0), max: d(16550), rate: d(0.10) },
        { min: d(16550), max: d(63100), rate: d(0.12) },
        { min: d(63100), max: d(100500), rate: d(0.22) },
        { min: d(100500), max: d(191950), rate: d(0.24) },
        { min: d(191950), max: d(243700), rate: d(0.32) },
        { min: d(243700), max: d(609350), rate: d(0.35) },
        { min: d(609350), max: null, rate: d(0.37) },
      ],
      qualifying_surviving_spouse: [
        { min: d(0), max: d(23200), rate: d(0.10) },
        { min: d(23200), max: d(94300), rate: d(0.12) },
        { min: d(94300), max: d(201050), rate: d(0.22) },
        { min: d(201050), max: d(383900), rate: d(0.24) },
        { min: d(383900), max: d(487450), rate: d(0.32) },
        { min: d(487450), max: d(731200), rate: d(0.35) },
        { min: d(731200), max: null, rate: d(0.37) },
      ],
    },
    capitalGainsRates: {
      zero: {
        threshold: {
          single: d(47025),
          married_filing_jointly: d(94050),
          married_filing_separately: d(47025),
          head_of_household: d(63000),
          qualifying_surviving_spouse: d(94050),
        },
      },
      fifteen: {
        threshold: {
          single: d(518900),
          married_filing_jointly: d(583750),
          married_filing_separately: d(291850),
          head_of_household: d(551350),
          qualifying_surviving_spouse: d(583750),
        },
      },
    },
  },
};

export const STATE_TAX_CONSTANTS: StateTaxConstants = {
  pa: {
    2024: {
      personalIncomeTaxRate: d("0.0307"),
    },
    2025: {
      personalIncomeTaxRate: d("0.0307"),
    },
    2026: {
      personalIncomeTaxRate: d("0.0307"),
    },
  },
};

/**
 * Get base year tax constants for Schedule J farm income averaging.
 * These are lighter-weight constants containing only tax brackets and capital gains thresholds.
 */
export function getBaseYearConstants(year: number): BaseYearTaxConstants {
  const constants = BASE_YEAR_TAX_CONSTANTS[year];
  if (!constants) {
    throw new Error(
      `Base year tax constants not available for year ${year}. Available years: ${Object.keys(BASE_YEAR_TAX_CONSTANTS).join(", ")}`
    );
  }
  return constants;
}

export function getNYIT201ResidentConstants(
  year: number
): NYIT201ResidentYearConstants {
  const constants = NY_IT201_RESIDENT_CONSTANTS[year];
  if (!constants) {
    throw new Error(
      `NY IT-201 resident constants not available for year ${year}. Available years: ${Object.keys(NY_IT201_RESIDENT_CONSTANTS).join(", ")}`
    );
  }
  return constants;
}

export function getConstants(year: number): YearConstants {
  const constants = TAX_CONSTANTS[year];
  if (!constants) {
    throw new Error(
      `Tax constants not available for year ${year}. Available years: ${Object.keys(TAX_CONSTANTS).join(", ")}`
    );
  }
  return constants;
}

export function getIllinoisConstants(year: number): IllinoisStateConstants {
  const constants = ILLINOIS_TAX_CONSTANTS[year];
  if (!constants) {
    throw new Error(
      `Illinois tax constants not available for year ${year}. Available years: ${Object.keys(ILLINOIS_TAX_CONSTANTS).join(", ")}`
    );
  }
  return constants;
}

export function getOhioConstants(year: number): OhioYearConstants {
  const constants = OHIO_TAX_CONSTANTS[year];
  if (!constants) {
    throw new Error(
      `Ohio tax constants not available for year ${year}. Available years: ${Object.keys(OHIO_TAX_CONSTANTS).join(", ")}`
    );
  }
  return constants;
}

export function getNJResidentConstants(year: number): NJResidentYearConstants {
  const constants = TAX_CONSTANTS[year]?.state?.njResident;
  if (!constants) {
    const availableYears = Object.keys(TAX_CONSTANTS)
      .filter((key) => TAX_CONSTANTS[Number(key)]?.state?.njResident)
      .join(", ");
    throw new Error(
      `NJ resident tax constants not available for year ${year}. Available years: ${availableYears}`
    );
  }
  return constants;
}
