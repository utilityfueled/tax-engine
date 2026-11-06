/** Native facts and retained originals only; the canonical allocator owns all monetary arithmetic. */
import { MortgageInsurancePrepaidSourcesSchema, type MortgageInsurancePrepaidSources } from '@/models/mortgage-insurance-prepaid-sources';
import type { MortgageEntryData } from './guided-interview-flow';
import { parseGuidedCurrency } from './guided-currency';

export interface GuidedMortgageInsurancePrepaidData {
  sourceReference?: string;
  provider?: '' | 'fha' | 'private' | 'va' | 'rhs';
  privateInsuranceMeetsHpaDefinition?: boolean | null;
  allPremiumsIncluded?: boolean | null;
  premiumAllocableBeyondYearEnd?: boolean | null;
  prepaidPremiumPaid?: string;
  paymentMethod?: '' | 'cash' | 'financed';
  paidDate?: string;
  insuranceObtainedDate?: string;
  statedTermMonths?: string;
  mortgageOutstandingAtYearEnd?: boolean | null;
  mortgageSatisfied?: boolean | null;
  mortgageSatisfiedDate?: string;
  refinanced?: boolean | null;
  premiumsRefunded?: boolean | null;
  insuranceCancelled?: boolean | null;
  otherBorrowerPayments?: boolean | null;
  otherPremiumPayments?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
  capturedOriginal?: {
    source: MortgageInsurancePrepaidSources;
    draftValues: string;
    parentValues: string;
  };
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)]));
  return value;
}
export function mortgagePrepaidParentValues(parent: unknown): string { return JSON.stringify(ordered(parent)); }
export function mortgagePrepaidDraftValues(draft: GuidedMortgageInsurancePrepaidData): string {
  const { capturedOriginal: _original, sourceFactsConfirmed: _confirmation, ...facts } = draft;
  return mortgagePrepaidParentValues(facts);
}
export function invalidateMortgagePrepaid(draft: GuidedMortgageInsurancePrepaidData | undefined) {
  return draft ? { ...draft, sourceFactsConfirmed: null } : undefined;
}
/** Used only by explicit capture/confirm or the guarded actual source build. Missing remains missing. */
export function mortgagePrepaidSource(entry: MortgageEntryData): MortgageInsurancePrepaidSources {
  const draft = entry.insurancePrepaid;
  if (!draft || entry.insuranceAllocationMethod !== 'current-original-prepaid' || entry.hasMortgageInsuranceAllocation !== true) throw new Error('Select and complete the actual original prepaid mortgage insurance method.');
  if (draft.mortgageSatisfied !== false || draft.mortgageSatisfiedDate?.trim()) throw new Error('The finite original method requires an actual unsatisfied mortgage with no satisfaction date.');
  if (!draft.statedTermMonths || !/^[1-9]\d*$/.test(draft.statedTermMonths) || !Number.isSafeInteger(Number(draft.statedTermMonths))) throw new Error('Enter the actual stated whole-month mortgage term.');
  const premium = draft.prepaidPremiumPaid?.trim();
  if (!premium) throw new Error('Enter the actual original prepaid premium, including an explicit zero.');
  const amount = parseGuidedCurrency(premium).toFixed();
  const identity = `${entry.lender.trim()}:${entry.accountReference?.trim() ?? ''}`;
  return MortgageInsurancePrepaidSourcesSchema.parse({
    method:'current-original-prepaid', sourceTaxYear: Number(entry.sourceTaxYear), sourceReference:draft.sourceReference,
    sourceFactsConfirmed:true, allPremiumsIncluded:draft.allPremiumsIncluded,
    form1098SourceId:identity, mortgageLoanSourceId:identity, lenderName:entry.lender.trim(), loanAccountReference:entry.accountReference?.trim(),
    payer:entry.accountHolder, provider:draft.provider,
    ...(draft.privateInsuranceMeetsHpaDefinition == null ? {} : {privateInsuranceMeetsHpaDefinition:draft.privateInsuranceMeetsHpaDefinition}),
    premiumAllocableBeyondYearEnd:draft.premiumAllocableBeyondYearEnd, prepaidPremiumPaid:amount,
    paymentMethod:draft.paymentMethod, paidDate:draft.paidDate, insuranceObtainedDate:draft.insuranceObtainedDate,
    statedTermMonths:Number(draft.statedTermMonths), mortgageOutstandingAtYearEnd:draft.mortgageOutstandingAtYearEnd,
    mortgageSatisfiedDate:null, refinanced:draft.refinanced, premiumsRefunded:draft.premiumsRefunded,
    insuranceCancelled:draft.insuranceCancelled, otherBorrowerPayments:draft.otherBorrowerPayments,
    rentalOrBusinessUse:entry.rentalOrBusinessUse, otherPremiumPayments:draft.otherPremiumPayments,
  });
}
export function assertMortgagePrepaidSnapshot(entry: MortgageEntryData, source: MortgageInsurancePrepaidSources, parentValues: string, requireConfirmation = true): void {
  const draft = entry.insurancePrepaid;
  const original = draft?.capturedOriginal;
  if (!draft || !original || (requireConfirmation && draft.sourceFactsConfirmed !== true)
    || original.draftValues !== mortgagePrepaidDraftValues(draft)
    || original.parentValues !== parentValues
    || mortgagePrepaidParentValues(original.source) !== mortgagePrepaidParentValues(source)) {
    throw new Error('Capture and confirm the actual original premium records against the complete current mortgage sources after the last edit.');
  }
}
