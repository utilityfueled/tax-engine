import type { Form982PrincipalResidenceSources } from '@/models/cod-principal-residence-sources';

type Editable<T> = T extends number ? string : T extends boolean ? boolean | null
  : T extends object ? { [K in keyof T]: Editable<T[K]> } : T;
export type CodPrincipalResidenceDebtData = Omit<Editable<NonNullable<Form982PrincipalResidenceSources['debt']>>, 'sourceId'>;
/** Actual editable facts. Canonical aliases are generated only after the real statement is entered. */
export type CodPrincipalResidenceData = Omit<Editable<Form982PrincipalResidenceSources>, 'debt'> & { debt?: CodPrincipalResidenceDebtData };
