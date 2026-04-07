/**
 * Tax Engine — public API
 */

export { calculateFederalTax } from "./engine/federal.js";
export {
  calculateGenericStateReturn,
  computeGraduatedTax,
  getAvailableStates,
  getStateConstants,
} from "./engine/state/generic-resident-return.js";
export { calculatePA40 } from "./engine/state/pa-40.js";
export { calculatePALocalEIT } from "./engine/state/pa-local-eit.js";
export { calculatePANonresidentReturn } from "./engine/state/pa-nonresident-orchestrator.js";
export { calculatePhiladelphiaWageTax } from "./engine/state/pa-philadelphia-wage-tax.js";
export { calculatePAReturn } from "./engine/state/pa-orchestrator.js";
export { calculateREV1630 } from "./engine/state/pa-rev-1630.js";
export { calculatePAScheduleA } from "./engine/state/pa-schedule-a.js";
export { calculatePAScheduleB } from "./engine/state/pa-schedule-b.js";
export { calculatePAScheduleC } from "./engine/state/pa-schedule-c.js";
export { calculatePAScheduleF } from "./engine/state/pa-schedule-f.js";
export { calculatePAScheduleD } from "./engine/state/pa-schedule-d.js";
export { calculateScheduleDC } from "./engine/state/pa-schedule-dc.js";
export { calculatePAScheduleE } from "./engine/state/pa-schedule-e.js";
export { calculateScheduleGL } from "./engine/state/pa-schedule-g-l.js";
export { calculateScheduleJ } from "./engine/state/pa-schedule-j.js";
export { calculatePAScheduleNRH } from "./engine/state/pa-schedule-nrh.js";
export { calculatePAScheduleO } from "./engine/state/pa-schedule-o.js";
export { calculateScheduleOC } from "./engine/state/pa-schedule-oc.js";
export { calculatePAScheduleRK1 } from "./engine/state/pa-schedule-rk1.js";
export { calculateScheduleSD } from "./engine/state/pa-schedule-sd.js";
export { calculateScheduleSP } from "./engine/state/pa-schedule-sp.js";
export { calculatePAScheduleT } from "./engine/state/pa-schedule-t.js";
export { calculateScheduleUE } from "./engine/state/pa-schedule-ue.js";
export { calculatePAUseTax } from "./engine/state/pa-use-tax.js";
export { calculatePAWorkingPennsylvaniansTaxCredit } from "./engine/state/pa-working-pennsylvanians-tax-credit.js";
export { calculateOhioResidentReturnFromFederal } from "./engine/state/oh-engine.js";
export { calculateOhioResidentReturn } from "./engine/state/oh-return.js";
export { calculateOhioScheduleOfWithholding } from "./engine/state/oh-schedule-of-withholding.js";
export { lookupOhioSchoolDistrictMetadata } from "./engine/state/oh-school-district-lookup.js";
export { buildNJ1040Input } from "./engine/state/nj-1040-adapter.js";
export { calculateNJ1040 } from "./engine/state/nj-1040.js";
export { calculateNJ1040HW } from "./engine/state/nj-1040-hw.js";
export { loadFromDirectory, parseInput } from "./ingest/loader.js";
export { TaxYearInputSchema } from "./models/inputs.js";
export type {
  PAPassThroughStatement,
  PANonresidentReturn,
  PAScheduleGLStatement,
  PAScheduleJStatement,
  PAResidentReturn,
  TaxYearInput,
} from "./models/inputs.js";
export type {
  PA40Input,
  PA40Result,
} from "./engine/state/pa-40.js";
export type {
  NonresidentEITCredit,
  PALocalEITInput,
  PALocalEITResult,
} from "./engine/state/pa-local-eit.js";
export type {
  PANonresidentOrchestratorOverrides,
  PANonresidentOrchestratorResult,
  PANonresidentResidencyStatus,
} from "./engine/state/pa-nonresident-orchestrator.js";
export type {
  PhiladelphiaWageTaxInput,
  PhiladelphiaWageTaxResidencyStatus,
  PhiladelphiaWageTaxResult,
} from "./engine/state/pa-philadelphia-wage-tax.js";
export type {
  PAOrchestratorOverrides,
  PAOrchestratorResult,
} from "./engine/state/pa-orchestrator.js";
export type {
  QuarterDetail,
  REV1630Input,
  REV1630Result,
} from "./engine/state/pa-rev-1630.js";
export type {
  PAScheduleAInput,
  PAScheduleAResult,
} from "./engine/state/pa-schedule-a.js";
export type {
  PAScheduleBInput,
  PAScheduleBResult,
} from "./engine/state/pa-schedule-b.js";
export type {
  PAScheduleCInput,
  PAScheduleCResult,
} from "./engine/state/pa-schedule-c.js";
export type {
  PAScheduleFInput,
  PAScheduleFResult,
} from "./engine/state/pa-schedule-f.js";
export type {
  PAScheduleDAdditionalTransaction,
  PAScheduleDInput,
  PAScheduleDLikeKindExchangeInput,
  PAScheduleDLikeKindExchangeResult,
  PAScheduleDResult,
} from "./engine/state/pa-schedule-d.js";
export type {
  ScheduleDCInput,
  ScheduleDCResult,
} from "./engine/state/pa-schedule-dc.js";
export type {
  PAScheduleEInput,
  PAScheduleEPropertyResult,
  PAScheduleEResult,
} from "./engine/state/pa-schedule-e.js";
export type {
  OtherStateCredit,
  PerStateResult,
  ScheduleGLInput,
  ScheduleGLResult,
} from "./engine/state/pa-schedule-g-l.js";
export type {
  ScheduleJInput,
  ScheduleJResult,
  ScheduleJStatementResult,
} from "./engine/state/pa-schedule-j.js";
export type {
  PAScheduleNRHApportionmentMethod,
  PAScheduleNRHBusinessApportionmentInput,
  PAScheduleNRHCompensationInput,
  PAScheduleNRHInput,
  PAScheduleNRHResult,
} from "./engine/state/pa-schedule-nrh.js";
export type {
  PAScheduleOContributionEntry,
  PAScheduleOInput,
  PAScheduleOResult,
} from "./engine/state/pa-schedule-o.js";
export type {
  PAOtherCreditEntry,
  PAOtherCreditType,
  PTECreditEntry,
  PTECreditResult,
  ScheduleOCInput,
  ScheduleOCResult,
} from "./engine/state/pa-schedule-oc.js";
export type {
  PAScheduleRK1Input,
  PAScheduleRK1Result,
  PAScheduleRK1StatementResult,
} from "./engine/state/pa-schedule-rk1.js";
export type {
  SchoolDistrictMethod,
  ScheduleSDInput,
  ScheduleSDResult,
} from "./engine/state/pa-schedule-sd.js";
export type {
  PAFilingCategory,
  ScheduleSPInput,
  ScheduleSPResult,
} from "./engine/state/pa-schedule-sp.js";
export type {
  PAScheduleTAccountHolder,
  PAScheduleTAdditionalEntry,
  PAScheduleTEntry,
  PAScheduleTEntrySource,
  PAScheduleTFormW2GEntry,
  PAScheduleTHolderResult,
  PAScheduleTInput,
  PAScheduleTPrizeType,
  PAScheduleTResult,
} from "./engine/state/pa-schedule-t.js";
export type {
  ScheduleUEInput,
  ScheduleUEResult,
  ScheduleUEOtherExpensesInput,
  ScheduleUETravelInput,
  ScheduleUEVehicleInput,
  VehicleMethod,
} from "./engine/state/pa-schedule-ue.js";
export type {
  PAUseTaxInput,
  PAUseTaxLocality,
  PAUseTaxResult,
  PAUseTaxSalesTaxPaidEntry,
} from "./engine/state/pa-use-tax.js";
export type {
  PAWorkingPennsylvaniansTaxCreditInput,
  PAWorkingPennsylvaniansTaxCreditResult,
} from "./engine/state/pa-working-pennsylvanians-tax-credit.js";
export type { TaxReturnResult, CalculatedLine } from "./models/outputs.js";
export {
  getConstants,
  getIllinoisConstants,
  getOhioConstants,
  TAX_CONSTANTS,
  ILLINOIS_TAX_CONSTANTS,
  OHIO_TAX_CONSTANTS,
  IL_1040_CONSTANTS,
  IL_SCHEDULE_E_EIC_CONSTANTS,
  IL_SCHEDULE_ICR_CONSTANTS,
  IL_SCHEDULE_M_CONSTANTS,
  IL_2210_CONSTANTS,
  IL_USE_TAX_CONSTANTS,
} from "./models/constants.js";
export type {
  FilingStatus,
  YearConstants,
  TaxBracket,
  IllinoisStateConstants,
  Illinois1040Constants,
  IllinoisScheduleEEICConstants,
  IllinoisScheduleICRConstants,
  IllinoisScheduleMConstants,
  Illinois2210Constants,
  IllinoisUseTaxConstants,
  IllinoisUseTaxTableBracket,
  OhioTaxBracket,
  OhioExemptionTier,
  OhioIT1040YearConstants,
  OhioScheduleOfAdjustmentsYearConstants,
  RetirementIncomeCreditTier,
  JointFilingCreditTier,
  OhioScheduleOfCreditsYearConstants,
  QuarterlyRateFactor,
  OhioITSD2210YearConstants,
  OhioSD100YearConstants,
  OhioYearConstants,
} from "./models/constants.js";
export { STATE_CONSTANTS } from "./models/state-constants.js";
export type {
  GenericStateReturnInput,
  GenericStateReturnResult,
} from "./engine/state/generic-resident-return.js";
export type {
  StateStandardDeductionRange,
  StateTaxBracket,
  StateYearConstants,
} from "./models/state-constants.js";

// Illinois state engine
export { calculateIllinoisReturn } from "./engine/state/il-orchestrator.js";
export type { ILStateInput } from "./engine/state/il-orchestrator.js";
export { calculateIL1040 } from "./engine/state/il-1040.js";
export type {
  IL1040Input,
  IL1040Result,
  ILConstants,
  ILRefundMethod,
  ILDirectDepositInput,
  ILDirectDepositDetails,
  ILDirectDepositAccountType,
  ILDirectDepositDestination,
  ILHealthInsuranceCheckboxInput,
  ILHealthInsuranceCheckboxResult,
} from "./engine/state/il-1040.js";
export { calculateScheduleEEIC } from "./engine/state/il-schedule-e-eic.js";
export type { ScheduleEEICInput, ScheduleEEICResult, ILDependent } from "./engine/state/il-schedule-e-eic.js";
export {
  calculateIllinoisExpandedEITCWorksheet,
} from "./engine/state/il-expanded-eitc-worksheet.js";
export type {
  IllinoisExpandedEITCWorksheetInput,
  IllinoisExpandedEITCWorksheetResult,
} from "./engine/state/il-expanded-eitc-worksheet.js";
export { calculateILK12EducationExpenseWorksheet } from "./engine/state/il-k12-education-expense-worksheet.js";
export type {
  ILK12EducationExpenseSchoolType,
  ILK12EducationExpenseStudent,
  ILK12EducationExpenseWorksheetInput,
  ILK12EducationExpenseWorksheetResult,
} from "./engine/state/il-k12-education-expense-worksheet.js";
export { calculateScheduleM } from "./engine/state/il-schedule-m.js";
export type { ScheduleMInput, ScheduleMResult } from "./engine/state/il-schedule-m.js";
export { calculateScheduleICR } from "./engine/state/il-schedule-icr.js";
export type { ScheduleICRInput, ScheduleICRResult } from "./engine/state/il-schedule-icr.js";
export { calculateScheduleG } from "./engine/state/il-schedule-g.js";
export type { ScheduleGInput, ScheduleGResult } from "./engine/state/il-schedule-g.js";
export { calculateScheduleCR } from "./engine/state/il-schedule-cr.js";
export type { ScheduleCRInput, ScheduleCRResult } from "./engine/state/il-schedule-cr.js";
export { calculateSchedule1299C, IL_SCHEDULE_1299_C_CREDIT_NAMES } from "./engine/state/il-schedule-1299-c.js";
export type {
  ILSchedule1299CCarryforwardPeriodYears,
  ILSchedule1299CCreditCode,
  Schedule1299CAttachmentInput,
  Schedule1299CCreditInput,
  Schedule1299CInput,
  Schedule1299CResult,
  Schedule1299CComputedCredit,
} from "./engine/state/il-schedule-1299-c.js";
export { calculateScheduleNR, computeISEDecimal, computeIRAAllocationDecimal } from "./engine/state/il-schedule-nr.js";
export type { ScheduleNRInput, ScheduleNRResult, DualColumnAmount } from "./engine/state/il-schedule-nr.js";
export { calculateILScheduleWIT, IL_SCHEDULE_IL_WIT_FORM_CODES } from "./engine/state/il-schedule-il-wit.js";
export type { ILScheduleWITInput, ILScheduleWITResult, ILScheduleWITRecord, ILScheduleWITOutputRecord, ILScheduleWITFormType } from "./engine/state/il-schedule-il-wit.js";
export { calculateIL2210 } from "./engine/state/il-2210.js";
export type { IL2210Input, IL2210Result } from "./engine/state/il-2210.js";
export { lookupUseTaxTable, calculateUseTaxWorksheet } from "./engine/state/il-use-tax.js";
export type { UseTaxWorksheetInput, UseTaxWorksheetResult } from "./engine/state/il-use-tax.js";

// New York state engine
export { calculateNYIT201AdditionsSubtractions } from "./engine/state/ny-it201-additions-subtractions.js";
export { calculateNYIT201Credits } from "./engine/state/ny-it201-credits.js";
export { calculateNYIT201Deduction } from "./engine/state/ny-it201-standard-deduction.js";
export { calculateNYIT201FullReturn } from "./engine/state/ny-it201-full-return.js";
export { calculateNYIT201NYCTax } from "./engine/state/ny-it201-nyc-tax.js";
export { calculateNYIT201Tax } from "./engine/state/ny-it201-tax-computation.js";
export { calculateNYIT201Withholding } from "./engine/state/ny-it201-withholding.js";
export { calculateNYIT201YonkersTax } from "./engine/state/ny-it201-yonkers-tax.js";
export { calculateNYIT217 } from "./engine/state/ny-it217-farmers-school-tax-credit.js";
export { calculateNYIT249 } from "./engine/state/ny-it249-long-term-care-insurance-credit.js";
export { NYIT201FullReturnInputSchema } from "./models/inputs.js";
export type { NYIT201FullReturnInputDocument } from "./models/inputs.js";
export {
  getNYIT201ResidentConstants,
  NY_IT201_RESIDENT_CONSTANTS,
} from "./models/constants.js";
export type {
  NYIT201ResidentYearConstants,
  NYIT201BracketGroup,
  NYIT201TaxBracket,
  NYIT201RecaptureWorksheet,
} from "./models/constants.js";

// New Jersey state engine
export type { NJStateConfig } from "./engine/state/nj-1040-adapter.js";
export type { NJ1040Input, NJ1040Result } from "./engine/state/nj-1040.js";
export type { NJ1040HWInput, NJ1040HWResult } from "./engine/state/nj-1040-hw.js";
