import type { CodPrincipalResidenceData } from '@/lib/guided-cod-principal-residence-types';
import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { guidedCodPartialPersonalState } from './guided-cod-partial-personal';
import { principalResidenceCodInput } from './cod-principal-residence';

/** Actual fictional source conversion only; no application answer defaults. */
export function guidedPrincipalResidenceState(year = 2025) {
  const original = principalResidenceCodInput(year), state = guidedCodPartialPersonalState();
  const editable = (value: unknown): unknown => value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key,child]) => [key,editable(child)]))
    : typeof value === 'number' ? String(value) : value;
  const facts = editable(original.form982PrincipalResidenceSources) as CodPrincipalResidenceData;
  const { sourceId: _sourceId, ...debt } = original.form982PrincipalResidenceSources.debt;
  facts.debt = { ...debt, sourceTaxYear:String(debt.sourceTaxYear) };
  state.taxYear = year; state.segmentation.incomeTypes = [];
  state.sectionData['income-w2'] = {entries:[]};
  const personal=state.sectionData['personal-info']; if(!personal)throw Error('Missing fictional household prerequisite');
  Object.assign(personal, { firstName:original.taxpayer.primary.firstName,lastName:original.taxpayer.primary.lastName,
    middleName:'',ssn:original.taxpayer.primary.ssn,dateOfBirth:original.taxpayer.primary.dateOfBirth,
    addressLine1:original.taxpayer.address.street,addressLine2:'',city:original.taxpayer.address.city,state:original.taxpayer.address.state,zip:original.taxpayer.address.zip });
  return { ...state, sectionData:{ ...state.sectionData,adjustments:{ ...emptyAdjustmentData,codPrincipalResidenceSources:facts } } };
}
