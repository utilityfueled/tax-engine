import type { Form1099Q } from '@/models/inputs.js';

function actualSourceDate(value: unknown, year: number): Date {
  if (typeof value !== 'string') throw new Error('Form1099Q actual distribution date is required');
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || date.getUTCFullYear() !== year) {
    throw new Error('Form1099Q actual distribution date must match its source year');
  }
  return date;
}

/** Source date eligibility for PL119-21 expanded expenses; no monetary calculation. */
export function isExpandedEducationDistributionAllowed(form: Form1099Q, category: string, year: number, providedDates?: readonly (string | undefined)[]): boolean {
  if (year !== 2025) return true;
  const expanded = (form.accountType === '529' && category.startsWith('k12_') && category !== 'k12_tuition') || category.startsWith('credential_');
  if (!expanded) return true;
  if (form.distributionMedium === 'in_kind_prepaid_tuition') {
    // IRC529(c)(3)(B)(iv): the furnished benefit is the distribution. Neither
    // a later statement date nor a blanket answer can replace original dates.
    if (!providedDates?.length) throw new Error('Expanded in-kind benefit requires its actual furnished distribution dates');
    const eligibility = providedDates.map(value => actualSourceDate(value, year).getTime() > Date.UTC(2025,6,4));
    const eligible = eligibility[0];
    if (eligibility.some(value => value !== eligible)) throw new Error('Mixed in-kind furnished dates require a separate timing allocation method');
    if (form.distributionDate !== undefined) {
      actualSourceDate(form.distributionDate, year);
      if (providedDates.some(value => value !== form.distributionDate)) throw new Error('In-kind furnished date conflicts with the actual statement distribution date');
    }
    if (form.allDistributionsAfterJuly42025 !== undefined && form.allDistributionsAfterJuly42025 !== eligible) {
      throw new Error('In-kind furnished dates conflict with the after-July4 source confirmation');
    }
    return eligible;
  }
  if (form.distributionDate !== undefined) {
    return actualSourceDate(form.distributionDate, year).getTime() > Date.UTC(2025,6,4);
  }
  if (typeof form.allDistributionsAfterJuly42025 !== 'boolean') throw new Error('Form1099Q actual all statement distributions after July4,2025, or actual distribution date is required');
  return form.allDistributionsAfterJuly42025;
}
