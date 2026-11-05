/** Original-bound finite RRTA source proof. Spec: spec/federal/rrta-tip-payroll.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput, Form4137Input } from '@/models/inputs.js';
import type { YearConstants } from '@/models/constants.js';
import { RRTAPayrollSourcesSchema } from '@/models/rrta-payroll-sources.js';
type Owner = 'primary' | 'spouse';
function original(value: unknown): string {
    if (Array.isArray(value))
        return `a[${value.map(original).join(',')}]`;
    if (value !== null && typeof value === 'object')
        return `o{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${original(v)}`).join(',')}}`;
    return `${typeof value}:${JSON.stringify(value)}`;
}
function text(value: string | undefined): asserts value is string {
    if (!value?.trim())
        throw Error('RRTA requires actual original source references.');
}
function amount(value: string | undefined): Decimal {
    if (value === undefined || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value))
        throw Error('RRTA requires actual bounded nonnegative cents; unknown is not zero.');
    return new Decimal(value);
}
/** No source references, document snapshots or taxpayer identity enter the result. */
export function calculateRRTAPayrollSources(input: TaxYearInput, constants: YearConstants) {
    if (input.rrtaPayrollSources === undefined)
        return undefined;
    const packet = RRTAPayrollSourcesSchema.parse(input.rrtaPayrollSources), year = input.taxpayer.taxYear, joint = input.taxpayer.filingStatus === 'married_filing_jointly';
    if (![2025, 2026].includes(year) || constants.taxYear !== year || !['single', 'married_filing_jointly'].includes(input.taxpayer.filingStatus) || joint !== Boolean(input.taxpayer.spouse))
        throw Error('RRTA requires matching supported actual year and single or joint household.');
    text(packet.sourceReference);
    if (packet.methodVersion !== 'ordinary-w2-rrta-v1' || packet.sourceTaxYear !== year || packet.sourceFactsConfirmed !== true || packet.allRRTASourcesIncludedConfirmed !== true || packet.noEmployeeRepresentativeCompensationConfirmed !== true || packet.noCorrectionsConfirmed !== true || packet.noOtherRRTATaxAdjustmentsConfirmed !== true || packet.noSelfEmploymentIncomeConfirmed !== true || original(packet.originalTaxpayer) !== original(input.taxpayer))
        throw Error('RRTA requires complete current original household and ordinary payroll eligibility.');
    if (input.taxpayer.dependents.length || input.form8919)
        throw Error('RRTA dependents/ACTC or Form8919 require separately sourced payroll methods.');
    if (input.scheduleC || input.scheduleF || input.form1099Nec.length || input.scheduleK1.length || input.cryptoIncome)
        throw Error('RRTA self-employment source routes require a separately supported payroll method.');
    if (input.form4137 && input.form4137ByOwner)
        throw Error('RRTA duplicate Form4137 representations are unsupported.');
    const records: Form4137Input[] = input.form4137 ? [input.form4137] : Object.values(input.form4137ByOwner ?? {}).filter((x): x is Form4137Input => x !== undefined);
    const tips = new Map<Owner, Form4137Input>();
    for (const record of records) {
        if (!record.accountHolder || tips.has(record.accountHolder) || !record.sourceFacts || record.sourceFacts.sourceTaxYear !== year)
            throw Error('RRTA requires actual unique owner Form4137 sources.');
        tips.set(record.accountHolder, record);
    }
    if (!tips.size || !packet.originalTipForms || packet.originalTipForms.length !== tips.size || new Set(packet.originalTipForms.map(row => row.owner)).size !== tips.size)
        throw Error('RRTA requires complete original Form4137 inventory.');
    for (const saved of packet.originalTipForms)
        if (!tips.has(saved.owner) || original(saved.original) !== original(tips.get(saved.owner)))
            throw Error('RRTA actual original tip payroll changed; reconfirm sources.');
    if (!packet.sources?.length)
        throw Error('RRTA requires actual original compensation sources, including documented zero amounts.');
    const ids = new Set<string>(), w2ids = new Set<string>(), owners = new Set<Owner>();
    const byOwner: Partial<Record<Owner, Decimal>> = {};
    let medicareCompensation = new Decimal(0), additionalMedicareWithheld = new Decimal(0);
    for (const row of packet.sources) {
        text(row.sourceId);
        text(row.sourceReference);
        const owner = row.owner;
        if (!owner || !tips.has(owner) || (owner === 'spouse' && !joint) || owners.has(owner))
            throw Error('RRTA requires one ordinary railroad employer per actual tip owner; excess Tier1 methods remain unsupported.');
        owners.add(owner);
        if (ids.has(row.sourceId.trim()))
            throw Error('RRTA duplicate source identity.');
        ids.add(row.sourceId.trim());
        if (!row.w2SourceId || !/^formW2:(0|[1-9][0-9]*)$/.test(row.w2SourceId) || w2ids.has(row.w2SourceId))
            throw Error('RRTA requires a unique actual W2 source.');
        w2ids.add(row.w2SourceId);
        const index = Number(row.w2SourceId.slice(7));
        if (!Number.isSafeInteger(index))
            throw Error('RRTA W2 index is invalid.');
        const w2 = input.w2s[index];
        if (!w2 || w2.accountHolder !== owner || w2.taxYear !== year || row.sourceTaxYear !== year || original(row.originalW2) !== original(w2) || !w2.employer.name.trim() || !/^\d{2}-?\d{7}$/.test(w2.employer.ein))
            throw Error('RRTA original W2 employer/year/owner does not match current payroll.');
        if (row.sourceFactsConfirmed !== true || row.ordinaryBox1EqualsMedicareCompensationConfirmed !== true || row.nonRRTAPayrollBoxesKnownZeroConfirmed !== true || row.noRailroadTipsConfirmed !== true)
            throw Error('RRTA ordinary actual compensation and original payroll-box eligibility are unknown.');
        for (const field of ['socialSecurityWages', 'socialSecurityTips', 'socialSecurityWithheld', 'medicareWages', 'medicareWithheld', 'allocatedTips'] as const)
            if (!amount(w2[field]).isZero())
                throw Error('RRTA source W2 cannot double-count ordinary FICA wages/tips/tax; separate method required.');
        const ss = amount(row.tier1SocialSecurityCompensation), med = amount(row.tier1MedicareCompensation), withheld = amount(row.additionalMedicareTaxWithheld);
        if (!med.eq(amount(w2.wages)) || ss.gt(med) || withheld.gt(med))
            throw Error('RRTA original ordinary Box1/Medicare/SS/withholding facts do not reconcile.');
        const record = tips.get(owner);
        if (!record || !amount(record.sourceFacts?.railroadRetirementCompensation).eq(ss))
            throw Error('RRTA Form4137 SocialSecurity compensation must reconcile to the actual owner source.');
        for (const employer of record.sourceFacts?.employers ?? [])
            if (employer.w2SourceIds?.includes(row.w2SourceId) || employer.employerEin?.replace(/-/g, '') === w2.employer.ein.replace(/-/g, ''))
                throw Error('RRTA-covered railroad tips remain employer-reported, not Form4137.');
        const ordinaryReported = input.w2s.filter(w => w.accountHolder === owner).reduce((sum, w) => sum.plus(amount(w.socialSecurityWages)).plus(amount(w.socialSecurityTips)), new Decimal(0));
        if (ordinaryReported.plus(Decimal.min(ss, constants.selfEmploymentTax.socialSecurityWageBase)).gt(constants.selfEmploymentTax.socialSecurityWageBase))
            throw Error('RRTA combined reported SocialSecurity/Tier1 excess withholding requires a separate source method.');
        byOwner[owner] = ss;
        medicareCompensation = medicareCompensation.plus(med);
        additionalMedicareWithheld = additionalMedicareWithheld.plus(withheld);
    }
    for (const [owner, record] of tips)
        if (!amount(record.sourceFacts?.railroadRetirementCompensation).eq(byOwner[owner] ?? new Decimal(0)))
            throw Error('RRTA complete owner compensation inventory does not reconcile.');
    return {
        sourceFactsVerified: true as const, byOwnerSocialSecurityCompensation: byOwner, medicareCompensation, additionalMedicareWithheld
    };
}
