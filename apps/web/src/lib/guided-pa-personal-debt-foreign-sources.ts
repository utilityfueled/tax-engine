import type {TaxYearInput} from '@/models/inputs';
import {
  PAPersonalDebtAndForeignBankSourcesSchema,
  type PAPersonalDebtDischargeSource,
  type PAForeignBankTaxSource,
} from '@/models/pa-personal-debt-foreign-sources';
import {calculatePAPersonalDebtAndForeignBankSources} from '@/engine/state/pa-personal-debt-foreign-sources';

export type GuidedPAPersonalDebtForeignSources = ReturnType<typeof PAPersonalDebtAndForeignBankSourcesSchema.parse>;

/** Starting a draft is an explicit action, never a statement that originals are absent. */
export function startGuidedPAPersonalDebtForeignSources(): GuidedPAPersonalDebtForeignSources {
  return {personalDebtDischarges: [], foreignBankTaxSources: []};
}

export function emptyGuidedPAPersonalDebtSource(): PAPersonalDebtDischargeSource {
  return {
    originalIndex: null, sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null,
    owner: {firstName: '', lastName: '', ssn: ''}, original: {},
    statement: {statementId: '', creditorTin: '', accountReference: '', dischargedOn: '', eventCode: '', originalTaxYear: null,
      sourceReference: '', principalCancelled: '', interestCancelled: '', feesCancelled: ''},
    qualification: {
      useSourceReference: '', legalSourceReference: '', deductionSourceReference: '', relationshipSourceReference: '', propertySourceReference: '',
      noCollateralOfAnyKindConfirmed: null, legallyDischargedConfirmed: null, noResidualGuarantyPaymentConfirmed: null,
      allCancelledChargesIncludedConfirmed: null, purelyPersonalLivingUseConfirmed: null,
      noBusinessRentalInvestmentUseOrSecurityConfirmed: null, noCurrentOrPriorPADeductionOffsetOrBasisConfirmed: null,
      noEmploymentOrServiceConsiderationConfirmed: null, noPropertyTransferConfirmed: null, noCashPropertyOrNewBorrowingAtDischargeConfirmed: null,
    },
  };
}

export function emptyGuidedPAForeignBankTaxSource(): PAForeignBankTaxSource {
  return {
    originalIndex: null, sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null,
    owner: {firstName: '', lastName: '', ssn: ''}, original: {}, originalTaxYear: null,
    foreignCountry: '', jurisdictionKind: '', ordinaryPersonalInterestOnlyConfirmed: null,
    allForeignTaxReceiptsIncludedConfirmed: null, payments: [],
  };
}

/** An edit revokes every child confirmation but retains the previous private originals. */
export function updateGuidedPAPersonalDebtForeignSources(
  data: GuidedPAPersonalDebtForeignSources, patch: Partial<GuidedPAPersonalDebtForeignSources>,
): GuidedPAPersonalDebtForeignSources {
  const next = {...data, ...patch};
  return {
    ...next,
    ...(next.personalDebtDischarges === undefined ? {} : {personalDebtDischarges: next.personalDebtDischarges.map(row => ({...row, sourceFactsConfirmed: null}))}),
    ...(next.foreignBankTaxSources === undefined ? {} : {foreignBankTaxSources: next.foreignBankTaxSources.map(row => ({...row, sourceFactsConfirmed: null}))}),
  };
}

/** Only the explicit confirmation action binds current canonical originals, after core replay. */
export function confirmGuidedPAPersonalDebtForeignSources(input: TaxYearInput, draft: unknown): GuidedPAPersonalDebtForeignSources {
  const data = PAPersonalDebtAndForeignBankSourcesSchema.parse(draft);
  const original = (index: number | null, sources: readonly unknown[]): Record<string, unknown> => {
    if (index === null || !Number.isInteger(index) || index < 0 || !sources[index]) {
      throw new Error('Select the actual current original index before confirming PA debt or foreign tax records.');
    }
    return structuredClone(sources[index]) as Record<string, unknown>;
  };
  const candidate: GuidedPAPersonalDebtForeignSources = {
    ...data,
    ...(data.personalDebtDischarges === undefined ? {} : {personalDebtDischarges: data.personalDebtDischarges.map(row => ({
      ...row, sourceFactsConfirmed: true, original: original(row.originalIndex, input.form1099C),
    }))}),
    ...(data.foreignBankTaxSources === undefined ? {} : {foreignBankTaxSources: data.foreignBankTaxSources.map(row => ({
      ...row, sourceFactsConfirmed: true, original: original(row.originalIndex, input.form1099Int),
    }))}),
  };
  calculatePAPersonalDebtAndForeignBankSources(input, candidate);
  return candidate;
}

/** Reading confirmed records validates the stored snapshots and never replaces them. */
export function buildGuidedPAPersonalDebtForeignSources(input: TaxYearInput, draft: unknown): GuidedPAPersonalDebtForeignSources {
  const data = PAPersonalDebtAndForeignBankSourcesSchema.parse(draft);
  calculatePAPersonalDebtAndForeignBankSources(input, data);
  return data;
}
