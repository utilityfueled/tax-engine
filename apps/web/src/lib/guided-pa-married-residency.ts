/** Spec: state/pa-married-residency-native.yaml. Explicit documentary intake only. */
import type { TaxYearInput } from '@/models/inputs';
import { PAMarriedOrdinarySourcesSchema, type PAMarriedOrdinarySources } from '@/models/pa-married-ordinary-sources';
import { PAMarriedResidencySourcesSchema, type PAMarriedResidencySources } from '@/models/pa-married-residency-sources';
import { calculatePAMarriedResidencySources } from '@/engine/state/pa-married-residency-sources';
import { updateGuidedPAMarriedOrdinarySources } from '@/lib/guided-pa-married-ordinary-sources';
export const emptyGuidedPAMarriedDomicilePeriod = () => ({ state: '', from: '', through: '', daysInPA: null as number | null });
export const emptyGuidedPAMarriedAbodePeriod = () => ({ from: '', through: '' });
export function emptyGuidedPAMarriedResidency(): PAMarriedResidencySources { return { methodVersion: 'pa-married-residency-sources-v1', sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null, owners: [] }; }
export function emptyGuidedPAMarriedResidencyOwner(accountHolder: 'primary' | 'spouse'): PAMarriedResidencySources['owners'][number] { return { accountHolder, allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed: null, originalTaxpayer: { firstName: '', lastName: '', ssn: '' }, residency: { status: '', sourceReference: '', factsConfirmed: null, domicilePeriods: [], paPermanentAbodePeriods: [], outsidePAPermanentAbodePeriods: [], moveAbandonmentNewDomicileAndPresenceConfirmed: null, dec31PrincipalResidenceState: '', schoolDistrictCode: '', schoolDistrictName: '' } }; }
/** Exact lexical no-op only. Actual edits keep prior captured originals. */
export function updateGuidedPAMarriedResidency(sources: PAMarriedOrdinarySources, raw: PAMarriedResidencySources): PAMarriedOrdinarySources { const packet = PAMarriedResidencySourcesSchema.parse(raw); if (JSON.stringify(packet) === JSON.stringify(sources.residencySources))
    return sources; return updateGuidedPAMarriedOrdinarySources(sources, { residencySources: packet }); }
/** Capture selected current identities only, never dates, days or wages. */
export function captureGuidedPAMarriedResidencyOwner(input: TaxYearInput, raw: PAMarriedOrdinarySources, index: number): PAMarriedOrdinarySources {
    const sources = PAMarriedOrdinarySourcesSchema.parse(raw), packet = sources.residencySources, row = packet?.owners[index];
    if (!packet || !Number.isSafeInteger(index) || index < 0 || !row || !['primary', 'spouse'].includes(row.accountHolder) || packet.sourceTaxYear !== input.taxpayer.taxYear || input.taxpayer.taxYear !== 2025 || sources.filingMode !== 'M' || input.taxpayer.filingStatus !== 'married_filing_jointly')
        throw Error('Select the actual current-year separate PA calendar owner first.');
    if (packet.owners.filter(owner => owner.accountHolder === row.accountHolder).length !== 1)
        throw Error('Each actual calendar owner must be selected once.');
    const person = row.accountHolder === 'primary' ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person || !person.firstName.trim() || !person.lastName.trim() || !/^\d{9}$/u.test(person.ssn.replace(/[-\s]/gu, '')))
        throw Error('Actual current taxpayer identity is unavailable.');
    return updateGuidedPAMarriedOrdinarySources(sources, { residencySources: { ...packet, owners: packet.owners.map((owner, i) => i === index ? { ...owner, originalTaxpayer: { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn } } : owner) } });
}
/** Confirms existing originals; a changed taxpayer is never silently recaptured. */
export function confirmGuidedPAMarriedResidency(input: TaxYearInput, raw: PAMarriedOrdinarySources): PAMarriedOrdinarySources {
    const sources = PAMarriedOrdinarySourcesSchema.parse(raw);
    if (!sources.residencySources)
        throw Error('Enter the actual separate spouse calendar records first.');
    if (input.taxpayer.taxYear !== 2025 || sources.residencySources.sourceTaxYear !== 2025)
        throw Error('This native calendar method requires actual2025 originals; later-year methods remain separately gated.');
    const candidate = { ...sources, sourceFactsConfirmed: null, residencySources: { ...sources.residencySources, sourceFactsConfirmed: true } };
    calculatePAMarriedResidencySources(input, candidate);
    return candidate;
}
