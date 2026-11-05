/** Spec: state/oh-2026-school-sources.yaml. Standalone source proof; no final SD100 or parent-return admission. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { TaxpayerSchema, StandardDeductionFactsSchema, type TaxYearInput } from '@/models/inputs.js';
import { OhioResidencyFactsSchema, ohioNrcCategories } from '@/models/ohio-residency.js';
import { Ohio2026SchoolSourcesSchema } from '@/models/ohio-2026-school-sources.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { lookupOhio2026SchoolDistrict, OHIO_2026_SCHOOL_CATALOG } from './oh-2026-school-catalog.js';
const Exact = Decimal.clone({ precision: 128, rounding: Decimal.ROUND_HALF_UP });
function fail(message: string): never { throw new Error(`Ohio2026 school actual sources: ${message}`); }
function stable(value: unknown): unknown {
    if (Decimal.isDecimal(value))
        return value.toString();
    if (Array.isArray(value))
        return value.map(stable);
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
    return value;
}
const digest = (v: unknown) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(v)))));
const identity = (v: string) => v.replace(/\s+/g, '').toUpperCase();
const tin = (v: string) => v.replace(/\D/g, '');
function day(value: string): number { const n = Date.parse(`${value}T00:00:00Z`); if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value)
    fail('actual valid calendar date required'); return n; }
function cash(value: unknown): Decimal { if (typeof value !== 'string' || !/^\d{1,15}(?:\.\d{1,2})?$/.test(value))
    fail('actual nonnegative cash including explicit zero required'); return new Exact(value); }
export interface Ohio2026SchoolSourceProjection {
    taxYear: 2026;
    districtCode: string;
    districtName: string;
    taxBase: 'earned';
    rate: string;
    residentCompensation: string;
    schoolWithholding: string;
    taxLiability: null;
    payments: null;
    refund: null;
    underpaymentPenalty: null;
    lateInterest: null;
    filingQualified: false;
    calculationStatus: 'source-only-incomplete';
    limitations: string[];
}
export interface Ohio2026SchoolSourceContext {
    readonly methodId: 'oh-2026-earned-school-source-v1';
    readonly sourceCommitment: string;
}
const contexts = new WeakMap<Ohio2026SchoolSourceContext, {
    currentDigest: string;
    projection: Ohio2026SchoolSourceProjection;
}>();
export function readOhio2026SchoolSource(context: Ohio2026SchoolSourceContext, input: TaxYearInput, raw: unknown): Ohio2026SchoolSourceProjection {
    const actual = contexts.get(context);
    if (!actual || actual.currentDigest !== digest({ input, sources: raw }))
        fail('current context missing stale or forged');
    return structuredClone(actual.projection);
}
/** Validates current actual inputs without inferring liability, payment coverage or final form rules. */
export function calculateOhio2026SchoolSource(input: TaxYearInput, raw: unknown): Ohio2026SchoolSourceContext {
    const parsed = Ohio2026SchoolSourcesSchema.safeParse(raw), taxpayer = TaxpayerSchema.strict().safeParse(input.taxpayer), resident = OhioResidencyFactsSchema.safeParse(input.ohioResidency), standard = StandardDeductionFactsSchema.strict().safeParse(input.standardDeductionFacts);
    if (!parsed.success || !taxpayer.success || !resident.success || !standard.success)
        fail('complete actual source packet required');
    const s = parsed.data, t = taxpayer.data, facts = resident.data, sf = standard.data;
    if (!t.primary.firstName.trim() || !t.primary.lastName.trim())
        fail('actual owner names required');
    if (!Array.isArray(input.taxpayer.dependents))
        fail('actual known dependent inventory required');
    if (t.taxYear !== 2026 || facts.taxYear !== 2026 || t.filingStatus !== 'single' || t.spouse || t.dependents.length || !/^\d{9}$/.test(tin(t.primary.ssn)))
        fail('actual2026 single primary no-dependent owner required');
    day(t.primary.dateOfBirth);
    if (t.primary.dateOfBirth <= '1962-01-01' || t.primary.dateOfBirth > '2008-12-31')
        fail('ordinary adult under65 cohort required');
    if (sf.primaryCanBeClaimedAsDependent !== false || sf.primaryDeathDate !== null || sf.nonresidentAlien !== false || sf.dualStatusAlien !== false || sf.shortTaxYear !== false)
        fail('actual ordinary calendar owner eligibility required');
    const { ohioResidency: _residency, ohioPayments: _payments, ...originals } = input;
    if (digest(facts.originalFederalSources) !== digest(originals))
        fail('current canonical residency original snapshot differs');
    if (digest(s.originalTaxInput) !== digest(input) || digest(s.owner.originalTaxpayer) !== digest(t.primary))
        fail('current complete original input or owner differs');
    const r = s.residence, f = r.finder;
    day(r.from);
    day(r.through);
    day(f.lookupDate);
    if (r.from !== '2026-01-01' || r.through !== '2026-12-31' || f.lookupDate < '2026-01-01' || t.address.state !== 'OH' || digest(r.originalAddress) !== digest(t.address) || digest(f.originalAddress) !== digest(t.address))
        fail('actual full-year Ohio address and year-specific Finder original required');
    const district = lookupOhio2026SchoolDistrict(2026, r.districtCode);
    if (!district || district.taxBase !== 'earned' || f.districtCode !== district.code || f.districtName !== district.name || f.rate !== district.rate || f.taxBase !== district.taxBase)
        fail('actual Finder identity rate and earned base must match annual2026 authority');
    const emptyArrays = new Set(['form1099Int', 'form1099Div', 'form1099B', 'form1099Nec', 'form1099Misc', 'scheduleK1', 'form1098', 'form1095A', 'donations', 'form1099DA', 'form1099G', 'form1099OID', 'formW2G', 'form1099K', 'form1099C', 'form1099Q', 'scheduleK1Form1041', 'form1098E', 'rentalProperties', 'savingsBondRedemptions', 'form6252', 'form8814', 'homeSales', 'form8824']);
    const allowed = new Set(['taxpayer', 'w2s', 'standardDeductionFacts', 'ohioResidency', 'ohioPayments']);
    for (const [key, value] of Object.entries(input))
        if (value !== undefined && !allowed.has(key) && !(emptyArrays.has(key) && Array.isArray(value) && value.length === 0))
            fail('other retained income or adjustment originals require their separate method even at zero');
    if (!facts.allFederalSourcesIncludedConfirmed || !facts.noBusinessIncomeConfirmed || facts.businessSources || facts.reciprocalWageSources || facts.residentCreditSources || facts.schoolDistrictStatus !== 'actual_district_sources_required' || facts.owners.length !== 1)
        fail('complete actual ordinary school residence required; other source methods excluded');
    const owner = facts.owners[0];
    if (!owner || owner.accountHolder !== 'primary' || owner.status !== 'full_year_resident' || owner.periods.length !== 1)
        fail('actual full-year primary residency required');
    const period = owner.periods[0];
    if (!period || period.from !== r.from || period.to !== r.through || period.domicileState !== 'OH')
        fail('actual domicile and school residence differ');
    if (!Array.isArray(input.w2s) || input.w2s.length < 1 || input.w2s.length > 20 || s.employmentOriginals.length !== input.w2s.length || s.w2Sources.length !== input.w2s.length)
        fail('complete bounded actual W2/payroll/school inventory required');
    const indexes = new Set<number>(), documentIds = new Set<string>(), schoolIndexes = new Set<number>();
    let wages = new Exact(0), withheld = new Exact(0);
    for (const school of s.w2Sources) {
        if (schoolIndexes.has(school.w2Index) || !input.w2s[school.w2Index])
            fail('duplicate or unknown school W2 index');
        schoolIndexes.add(school.w2Index);
    }
    for (const employment of s.employmentOriginals) {
        const index = employment.w2Index, w = input.w2s[index], school = s.w2Sources.find(v => v.w2Index === index);
        if (indexes.has(index) || !w || !school || w.taxYear !== 2026 || w.accountHolder !== 'primary' || employment.accountHolder !== 'primary' || tin(employment.employerTin) !== tin(w.employer.ein) || identity(employment.employerName) !== identity(w.employer.name) || !/^\d{9}$/.test(tin(w.employer.ein)))
            fail('actual unique owner employer and W2 index required');
        indexes.add(index);
        const actual = calculateW2StateLocalSources(input, index, w.stateLocalSources);
        if (actual.stateRows.some(row => row.state !== 'OH'))
            fail('other-state reporting requires separate method');
        for (const key of ['socialSecurityTips', 'allocatedTips', 'box10DependentCareBenefits', 'box12CodeW', 'box12CodeD', 'box12CodeE', 'box12CodeF', 'box12CodeG', 'box12CodeH', 'box12CodeS', 'box12CodeAA', 'box12CodeBB', 'box12CodeEE', 'box12CodeT'] as const)
            if (!cash(w[key]).isZero())
                fail('actual nonspecial compensation including known zero required');
        for (const key of ['wages', 'federalWithheld', 'socialSecurityWages', 'socialSecurityWithheld', 'medicareWages', 'medicareWithheld'] as const)
            cash(w[key]);
        if (w.militaryService || w.box12CodeTP !== undefined || w.box12CodeTT !== undefined || w.treasuryTippedOccupationCodes !== undefined)
            fail('special compensation requires separate method');
        if (school.localRows.length !== actual.localRows.length || new Set(school.localRows.map(v => v.printedRow)).size !== school.localRows.length)
            fail('complete unique actual local row classifications required');
        for (const row of school.localRows) {
            const actualRow = actual.localRows.find(v => v.printedRow === row.printedRow);
            if (!actualRow || row.districtCode !== district.code)
                fail('school district classification conflicts with actual row or residence');
            // A caller classification cannot contradict the actual printed original.
            // Unnamed/ambiguous local rows need their separate documentary method.
            const printed = w.stateLocalSources?.localRows.find(original => original.printedRow === row.printedRow);
            const label = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();
            const names = OHIO_2026_SCHOOL_CATALOG.filter(entry => label(entry.name) === label(district.name));
            const admitted = new Set([district.code, ...(names.length === 1 ? [district.name] : []), `${district.code} ${district.name}`, `${district.name} ${district.code}`].map(label));
            if (!printed || printed.localityNameStatus !== 'reported' || !admitted.has(label(printed.localityName)))
                fail('actual printed locality does not establish this school district; separate original-bound method required');
            if (!cash(actualRow.wages.toFixed()).eq(cash(w.wages)))
                fail('ordinary full-year school wage row differs from current federal wages');
            withheld = withheld.plus(cash(actualRow.withheld.toFixed()));
        }
        let next = day('2026-01-01'), originalWages = new Exact(0);
        for (const row of [...employment.serviceRows].sort((a, b) => a.from.localeCompare(b.from))) {
            const from = day(row.from), to = day(row.to), paid = day(row.paymentDate), id = identity(row.sourceId), ref = identity(row.sourceReference);
            if (documentIds.has(`id:${id}`) || documentIds.has(`ref:${ref}`))
                fail('duplicate original payroll');
            documentIds.add(`id:${id}`);
            documentIds.add(`ref:${ref}`);
            if (from !== next || to < from || row.to > '2026-12-31' || row.paymentDate > '2026-12-31' || paid < to || row.serviceState !== 'OH')
                fail('complete current2026 ordinary Ohio payroll periods required');
            originalWages = originalWages.plus(cash(row.wages));
            next = to + 86400000;
        }
        if (next !== day('2027-01-01') || !originalWages.eq(cash(w.wages)))
            fail('complete actual original payroll wages differ');
        wages = wages.plus(originalWages);
    }
    if (!owner.amounts || !owner.stateAdditions || !owner.stateDeductions || owner.stateAdditions.length || owner.stateDeductions.length)
        fail('complete actual zero state adjustments required');
    for (const category of ohioNrcCategories) {
        const a = owner.amounts[category], expected = category === 'wages' ? wages : new Exact(0);
        if (!cash(a.federalAmount).eq(expected) || !cash(a.residentAmount).eq(expected) || !cash(a.nonresidentOhioAmount).isZero())
            fail('actual full-year wage categories differ');
    }
    const currentDigest = digest({ input, sources: raw }), context: Ohio2026SchoolSourceContext = Object.freeze({ methodId: 'oh-2026-earned-school-source-v1', sourceCommitment: currentDigest });
    contexts.set(context, { currentDigest, projection: { taxYear: 2026, districtCode: district.code, districtName: district.name, taxBase: 'earned', rate: district.rate,
            residentCompensation: wages.toFixed(), schoolWithholding: withheld.toFixed(), taxLiability: null, payments: null, refund: null, underpaymentPenalty: null, lateInterest: null,
            filingQualified: false, calculationStatus: 'source-only-incomplete', limitations: [
                'Actual single full-year under65 ordinary Ohio W2 earned-district source projection only; no PY, nonresident, traditional, joint, SE or specialized compensation method.',
                'Source wages and withholding are exact documentary amounts; no school liability, payment, refund, penalty, late-interest or final2026 SD100 qualification is inferred.',
                'Actual school payments and prior accounts require a separate current method; ordinary-return no-school guards and all filing/paper/native gates remain closed.',
            ] } });
    return context;
}
