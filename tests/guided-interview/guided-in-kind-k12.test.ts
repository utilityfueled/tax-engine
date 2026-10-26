// Spec: spec/federal/form-1099-q-in-kind-k12.yaml.
import { expect, it } from 'vitest';
import { buildEducationDistributionInputs, educationCollectionFields, type EducationDistributionData } from '@/lib/guided-education-distributions';
import { inKindK12Fixture } from '../fixtures/education-in-kind-k12.js';

it('preserves original plan facts without backfilling confirmation', () => {
  const input = inKindK12Fixture(2025), facts = input.qualifiedEducationExpenses?.sourceFacts;
  if (!facts) throw new Error('Missing actual source');
  const data: EducationDistributionData = JSON.parse(JSON.stringify({ ...facts, taxYear: '2025', forms: input.form1099Q.map(({ transfer, ...fields }) => ({ fields: { ...fields, taxYear: '2025' }, transfer })) }));
  expect(educationCollectionFields.beneficiaries.find(field => field.key === 'outsideK12CashOnlyConfirmed')?.kind).toBe('boolean');
  expect(educationCollectionFields.inKindBenefits.find(field => field.key === 'prepaidPlanSponsor')?.choices?.map(row => row[0])).toEqual(['state', 'eligible_educational_institutions']);
  const before = JSON.stringify(data), converted = buildEducationDistributionInputs(data, 2025, 'single');
  expect(converted.form1099Q).toEqual(input.form1099Q);
  expect(converted.qualifiedEducationExpenses).toEqual(input.qualifiedEducationExpenses);
  expect(JSON.stringify(data)).toBe(before);
  for (const value of [undefined, null, false]) {
    const changed = structuredClone(data);
    changed.beneficiaries![0].outsideK12CashOnlyConfirmed = value;
    expect(() => buildEducationDistributionInputs(changed, 2025, 'single')).toThrow(/cash|source/);
    expect(changed.beneficiaries![0].outsideK12CashOnlyConfirmed).toBe(value);
  }
  const institution = structuredClone(data), benefit = institution.inKindBenefits![0];
  benefit.prepaidPlanSponsor = 'eligible_educational_institutions';
  expect(() => buildEducationDistributionInputs(institution, 2025, 'single')).toThrow(/trust|determination/);
  benefit.prepaidInstitutionQualifiedTrustConfirmed = true;
  benefit.prepaidInstitutionDeterminationReference = 'Original institutional determination';
  expect(buildEducationDistributionInputs(institution, 2025, 'single').qualifiedEducationExpenses?.sourceFacts?.inKindBenefits?.[0]).toMatchObject(benefit);
  benefit.prepaidPlanQualifiedConfirmed = null;
  expect(() => buildEducationDistributionInputs(institution, 2025, 'single')).toThrow(/program|source/);
});
