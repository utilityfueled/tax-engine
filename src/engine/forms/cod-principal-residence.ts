/** Spec: spec/federal/cod-principal-residence-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { Form982PrincipalResidenceSources } from '@/models/cod-principal-residence-sources.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';

type SourceInput = Pick<TaxYearInput, 'taxpayer' | 'form1099C' | 'codExclusion' | 'form982NolSources' | 'form982AttributeSources'> & {
  form982PrincipalResidenceSources?: Form982PrincipalResidenceSources;
};
function requireText(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`QPR requires the actual ${label}`);
  return value.trim();
}
function source(value: { sourceReference?: string; sourceFactsConfirmed?: boolean } | undefined, label: string) {
  if (value?.sourceFactsConfirmed !== true) throw new Error(`QPR requires confirmed actual ${label} sources`);
  requireText(value.sourceReference, `${label} reference`);
}
function actual(value: string | undefined, label: string): Decimal {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`QPR requires actual nonnegative ${label}, including known zero`);
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error(`QPR ${label} must be finite`);
  return result;
}
function date(value: string | undefined, label: string): string {
  const text = requireText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`QPR requires an actual ${label}`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0,10) !== text) throw new Error(`QPR requires a valid ${label}`);
  return text;
}
function normalized(value: string): string { return value.trim().replace(/\s+/g,' ').toUpperCase(); }

/** A retained original-acquisition mortgage method, not the personal insolvency waterfall. */
export function calculateCodPrincipalResidenceReduction(input: SourceInput) {
  const facts = input.form982PrincipalResidenceSources;
  if (!facts) return undefined;
  const year = input.taxpayer.taxYear;
  source(facts, 'residence exclusion');
  if (![2025,2026].includes(year) || facts.sourceTaxYear !== year || facts.allDischargesIncluded !== true
    || facts.allResidenceSecuredLoansIncluded !== true || facts.regularAndAlternativeExclusionSameConfirmed !== true) {
    throw new Error('QPR requires complete actual discharge-year sources and all residence loans');
  }
  if (input.form982NolSources || input.form982AttributeSources || input.taxpayer.filingStatus === 'married_filing_jointly'
    || facts.communityPropertyApplies !== false || facts.title11Case !== false || facts.electInsolvencyInstead !== false
    || facts.otherExclusionsOrExceptionsApply !== false || facts.solelyPrimaryOwnedConfirmed !== true
    || facts.retainedResidenceConfirmed !== true || facts.noPropertyTransferConfirmed !== true
    || facts.neverBusinessOrRentalUseConfirmed !== true) {
    throw new Error('QPR joint/community, bankruptcy, other exclusions, election, transfer or business/rental use require their separate actual method');
  }
  const debt = facts.debt, acquisition = facts.acquisition, basis = facts.basis, reason = facts.reason;
  source(debt,'original debt'); source(acquisition,'original acquisition'); source(basis,'residence basis'); source(reason,'cancellation reason');
  if (!debt || !acquisition || !basis || !reason) throw new Error('QPR requires original debt, acquisition, basis and reason');
  const original = input.form1099C[0];
  if (input.form1099C.length !== 1 || !original || debt.sourceId !== 'form1099C:0' || debt.sourceTaxYear !== year) {
    throw new Error('QPR requires the sole original cancellation statement exactly once in its actual year');
  }
  requireText(debt.statementId,'statement identity'); requireText(debt.accountReference,'loan account reference');
  if (!/^\d{9}$/.test(requireText(debt.creditorTin,'creditor TIN').replace(/-/g,''))) throw new Error('QPR requires the original creditor TIN');
  const primary = input.taxpayer.primary, primaryId = input.taxpayer.primary.ssn.replace(/-/g,'');
  if (!/^\d{9}$/.test(primaryId) || !/^\d{4}$/.test(debt.debtorSsnLast4 ?? '') || debt.accountHolder !== 'primary' || normalized(requireText(debt.debtorName,'original debtor name')) !== normalized(`${primary.firstName} ${primary.lastName}`)
    || debt.debtorSsnLast4 !== primaryId.slice(-4)) throw new Error('QPR original debtor must match the sole primary owner');
  const dischargeDate = date(debt.dischargeDate,'discharge date');
  if (!dischargeDate.startsWith(`${year}-`) || debt.personallyLiable !== true || original.personallyLiable !== true
    || debt.completePrincipalCancellationConfirmed !== true || debt.noDeductibleInterestDischargedConfirmed !== true
    || !['F','G'].includes(requireText(debt.identifiableEventCode,'original event code')) || debt.identifiableEventCode !== original.identifiableEventCode
    || requireText(debt.creditor,'original creditor') !== original.creditor.trim()
    || requireText(debt.debtDescription,'original debt description') !== original.debtDescription?.trim()) {
    throw new Error('QPR requires the actual retained-home recourse principal cancellation and original statement facts');
  }
  const canceled = actual(debt.actualDischargedPrincipal,'discharged principal'), reported = actual(debt.amountDischarged,'statement canceled amount');
  const interest = actual(debt.interestIncluded,'statement interest'), actualInterest = actual(debt.actualDischargedInterest,'actual discharged interest');
  const value = actual(debt.fmvOfProperty,'original property value');
  if (!reported.eq(canceled) || !reported.eq(d(original.amountDischarged)) || !interest.isZero() || !actualInterest.isZero()
    || !interest.eq(d(original.interestIncluded)) || original.interestIncluded === undefined
    || original.fmvOfProperty === undefined || !value.eq(d(original.fmvOfProperty))) {
    throw new Error('QPR principal, known-zero interest and original statement amounts must reconcile exactly');
  }
  if (acquisition.mainHomeConfirmed !== true || acquisition.securedByResidenceConfirmed !== true
    || acquisition.originalLoanNotRefinancedConfirmed !== true || acquisition.allProceedsAcquisitionUseConfirmed !== true
    || acquisition.acquisitionUse !== 'buy_build_substantially_improve' || acquisition.immediatelyBeforeDischargeConfirmed !== true
    || date(acquisition.balanceAsOfDate,'balance snapshot date') !== dischargeDate) {
    throw new Error('QPR requires the actual secured original acquisition loan immediately before discharge; refinance or other use needs a separate method');
  }
  const home = acquisition.residenceAddress, address = input.taxpayer.address;
  if (!home || ['street','city','state','zip'].some(key => {
    const field = key as keyof typeof home;
    return normalized(requireText(home[field],`main-home ${key}`)) !== normalized(address[field] ?? '');
  }) || normalized(home.apt ?? '') !== normalized(address.apt ?? '')) throw new Error('QPR actual retained main home must match the current original residence address');
  const balance = actual(acquisition.outstandingPrincipal,'immediately-before original principal');
  const originalPrincipal = actual(acquisition.originalAcquisitionPrincipal,'original acquisition borrowing');
  if (date(acquisition.originationDate,'original loan date') > dischargeDate || acquisition.noCapitalizedInterestOrAddedPrincipalConfirmed !== true
    || balance.gt(originalPrincipal)) throw new Error('QPR requires the actual original acquisition borrowing with no added or capitalized principal');
  if (canceled.gt(balance)) throw new Error('QPR principal cancellation cannot exceed the actual outstanding loan');
  if (!['decline_in_residence_value','taxpayer_financial_condition'].includes(reason.reason ?? '') || reason.noLenderServicesConsiderationConfirmed !== true) {
    throw new Error('QPR requires a cancellation related to value or financial condition, with no lender-services consideration');
  }
  if (year === 2026 || facts.arrangement) {
    const arrangement = facts.arrangement; source(arrangement,'written arrangement');
    if (!arrangement || arrangement.dischargeSubjectToArrangementConfirmed !== true) throw new Error('QPR requires this actual discharge to be subject to the written arrangement');
    const entered = date(arrangement.enteredDate,'arrangement entry date'), written = date(arrangement.evidencedInWritingDate,'written evidence date');
    if (entered >= '2026-01-01' || written >= '2026-01-01' || entered > dischargeDate || written > dischargeDate) {
      throw new Error('QPR requires an arrangement entered and evidenced in writing before2026 and before the discharge');
    }
  }
  if (basis.allBasisChangesIncluded !== true || date(basis.asOfDate,'basis date') !== dischargeDate) throw new Error('QPR requires complete actual residence basis through discharge');
  const grossBasis = sumSourceMoney(actual(basis.purchaseCost,'purchase cost'), actual(basis.acquisitionCosts,'basis acquisition costs'), actual(basis.capitalImprovements,'capital improvements'));
  const previousReduction = actual(basis.previousBasisReductions,'previous basis reductions');
  if (originalPrincipal.gt(grossBasis)) throw new Error('QPR original acquisition borrowing cannot exceed documented acquisition and improvement outlays');
  if (previousReduction.gt(grossBasis)) throw new Error('QPR previous basis reductions cannot exceed the actual original basis');
  const openingBasis = sumSourceMoney(grossBasis, previousReduction.negated()), cap = d(input.taxpayer.filingStatus === 'married_filing_separately' ? '375000' : '750000');
  const qualifiedPrincipal = Decimal.min(balance,cap), nonqualifiedPrincipal = sumSourceMoney(balance, qualifiedPrincipal.negated());
  const excluded = Decimal.max(0,sumSourceMoney(canceled, nonqualifiedPrincipal.negated())), taxable = sumSourceMoney(canceled, excluded.negated());
  const basisReduction = Decimal.min(openingBasis,excluded), closingBasis = sumSourceMoney(openingBasis, basisReduction.negated());
  const claim = input.codExclusion;
  if (claim && (claim.bankruptcy || claim.electBasisReductionFirst || claim.insolvency
    || !d(claim.qualifiedFarmExclusion).isZero() || !d(claim.qualifiedRealPropertyBusinessExclusion).isZero()
    || !d(claim.aggregateBasisOfProperty).isZero() || !d(claim.basisOfDepreciableProperty).isZero() || !d(claim.basisOfDepreciableRealProperty).isZero()
    || (claim.qualifiedPrincipalResidence && !d(claim.qualifiedPrincipalResidence.dischargedAmount).eq(excluded))
    || (claim.basisOfPrincipalResidence !== undefined && !d(claim.basisOfPrincipalResidence).eq(openingBasis)))) {
    throw new Error('QPR legacy summaries must equal actual source-derived exclusion and basis with no competing claim');
  }
  const audit = new AuditTrail();
  audit.record('Form982 Source Worksheet','qpr-original-loan','Qualified principal residence original debt',qualifiedPrincipal,
    'Original immediately-before acquisition balance capped by filing status; all original residence loans included', { 'Original balance': balance, 'Debt cap': cap });
  audit.record('Form982 Source Worksheet','qpr-nonqualified-first','Source-derived residence cancellation exclusion',excluded,
    'Canceled principal less nonqualified original loan balance, floored at zero', { 'Canceled principal': canceled, 'Nonqualified principal': nonqualifiedPrincipal, 'Taxable remainder': taxable });
  audit.record('Form982 Source Worksheet','qpr-basis-only','Retained residence closing basis',closingBasis,
    'Actual original basis less the smaller of that basis and excluded residence principal; unrelated attributes are unchanged', { 'Opening basis': openingBasis, 'Basis reduction': basisReduction });
  return { canceled, excluded, taxable, qualifiedPrincipal, nonqualifiedPrincipal, openingBasis, basisReduction, closingBasis, lines: audit.getLines(),
    codExclusion: { bankruptcy:false, electBasisReductionFirst:false, qualifiedPrincipalResidence:{ dischargedAmount:excluded.toFixed() },
      basisOfPrincipalResidence:openingBasis.toFixed(), qualifiedFarmExclusion:'0', qualifiedRealPropertyBusinessExclusion:'0',
      aggregateBasisOfProperty:'0', basisOfDepreciableProperty:'0', basisOfDepreciableRealProperty:'0' } };
}
