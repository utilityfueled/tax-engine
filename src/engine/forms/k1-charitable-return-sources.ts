/** Original-source handoff only; spec/federal/k1-charitable-return-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput, ScheduleK1 } from '@/models/inputs.js';
import type { K1CharitableReturnSources } from '@/models/k1-charitable-return-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { CharitableContributionWorksheetInput } from './charitable-contribution-worksheet.js';
import { calculatePartnerBasisSchedule, type PartnerBasisScheduleResult } from './partner-basis-schedule.js';
import { calculateForm6198 } from './form-6198.js';
import { calculateK1CharitableAtRisk, type K1CharitableAtRiskResult } from './k1-charitable-at-risk.js';
import { calculateK1PriorAtRiskSources, type K1PriorAtRiskSourcesResult } from './k1-prior-charitable-at-risk.js';
import { calculateK1CapitalCharacterSources, type K1CapitalCharacterResult } from './k1-capital-character-sources.js';
import { calculateK1CashDistributionGain, type K1CashDistributionGain } from './k1-cash-distribution-gain.js';
import { resolveCharitableRecipient } from '@/utils/charitable-recipient.js';
import { d, sum } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { isNonitemizedPriorPropertySource } from '@/utils/k1-nonitemized-prior-property.js';
type Identity = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
type Taxpayer = {
    taxYear: number;
    filingStatus: TaxYearInput['taxpayer']['filingStatus'];
    primary: Identity;
    spouse?: Identity;
};
type Receipt = NonNullable<NonNullable<K1CharitableReturnSources['statements']>[number]['receipts']>[number];
export interface K1CharitableReturnInput {
    taxpayer: Taxpayer;
    deductionElection?: TaxYearInput['deductionElection'];
    scheduleK1: ScheduleK1[];
    k1CharitableSources?: K1CharitableReturnSources;
    qbiLossSources?: TaxYearInput['qbiLossSources'];
    standardDeductionFacts?: TaxYearInput['standardDeductionFacts'];
    eic?: Pick<NonNullable<TaxYearInput['eic']>, 'claimantEligibility'>;
}
export interface K1CharitableStatementResult {
    k1Index: number;
    accountHolder: 'primary' | 'spouse';
    basis: PartnerBasisScheduleResult;
    distributionGain?: K1CashDistributionGain;
    nonbindingRiskRequired: Decimal;
    amountAtRisk: Decimal;
    ordinaryAmount: Decimal;
    shortTermAmount: Decimal;
    longTermAmount: Decimal;
    atRiskAllocation?: K1CharitableAtRiskResult;
    priorAtRisk: K1PriorAtRiskSourcesResult;
    capitalCharacter?: K1CapitalCharacterResult;
}
export interface K1CharitableReturnResult {
    sourceFactsVerified: true;
    statements: K1CharitableStatementResult[];
    amounts: CharitableContributionWorksheetInput['amounts'];
    nonitemizedEligibleCash: Decimal;
    lines: CalculatedLine[];
}
const zeroFields = [
    'netRentalIncome', 'otherNetRentalIncome', 'royalties', 'otherIncome', 'section1231Gain', 'unrecapturedSection1250Gain', 'collectiblesGain',
    'section179Deduction', 'otherDeductions', 'investmentInterestExpense', 'amtDepreciationAdjustment', 'amtAdjustedGainOrLoss', 'amtDepletion', 'amtOtherItems',
] as const;
function text(value: string | undefined, label: string): string { if (!value?.trim())
    throw new Error(`K1 charitable ${label} is unknown`); return value.trim(); }
function amount(value: string | undefined, label: string): Decimal {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite())
        throw new Error(`K1 charitable ${label} requires an actual finite nonnegative amount`);
    return d(value);
}
function date(value: string | undefined, label: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
        throw new Error(`K1 charitable ${label} requires an actual date`);
    return value;
}
const needsSource = (source: ScheduleK1) => [source.charitableCash, source.charitableCapitalGain30, source.charitableCapitalGain20, source.priorSuspendedLosses?.charitable].some(value => !d(value).isZero());
function reconcileDistributionOwnerTreatment(input: K1CharitableReturnInput, k1: ScheduleK1): void {
    const standard = input.standardDeductionFacts;
    const supplied = input.eic?.claimantEligibility;
    const claimant = supplied?.sourceTaxYear === input.taxpayer.taxYear && supplied.sourceFactsConfirmed === true && supplied.sourceReference?.trim() ? supplied : undefined;
    // The standard-deduction interview asks the primary person's status. The
    // confirmed EIC packet has separate owner facts; a spouse is not the owner
    // merely because both people file this return.
    const primaryKnown = standard?.nonresidentAlien === true || standard?.dualStatusAlien === true ? true
        : standard?.nonresidentAlien === false && standard.dualStatusAlien === false ? false : undefined;
    const ownerKnown = k1.accountHolder === 'spouse' ? claimant?.spouseNonresidentAlienDuringYear : claimant?.primaryNonresidentAlienDuringYear;
    if (k1.accountHolder === 'primary' && ownerKnown !== undefined && primaryKnown !== undefined && ownerKnown !== primaryKnown)
        throw new Error('K1 cash distribution actual owner residency sources conflict');
    if (claimant?.residentJointElection !== undefined && standard?.residentJointElection !== undefined
        && claimant.residentJointElection !== standard.residentJointElection)
        throw new Error('K1 cash distribution actual resident election sources conflict');
    const election = claimant?.residentJointElection ?? standard?.residentJointElection;
    const married = input.taxpayer.filingStatus === 'married_filing_jointly' || input.taxpayer.filingStatus === 'married_filing_separately';
    const effectiveElection = married && input.taxpayer.spouse !== undefined && election === true;
    if ((ownerKnown === true || (k1.accountHolder === 'primary' && primaryKnown === true)) && !effectiveElection)
        throw new Error('K1 cash distribution actual owner residency conflicts with confirmed ordinary U.S. individual tax treatment');
}
export function calculateK1CharitableReturnSources(input: K1CharitableReturnInput): K1CharitableReturnResult | undefined {
    const packet = input.k1CharitableSources;
    if (packet === undefined)
        return undefined;
    const year = input.taxpayer.taxYear;
    if (![2025, 2026].includes(year) || packet.sourceTaxYear !== year || packet.sourceFactsConfirmed !== true || packet.allK1CharitableSourcesIncluded !== true)
        throw new Error('K1 charitable requires confirmed complete actual return-year source statements');
    text(packet.sourceReference, 'complete attachment reference');
    if (!Array.isArray(packet.statements))
        throw new Error('K1 charitable requires the actual statement list, including none');
    const amounts = { cashPublic: d(0), noncashPublic: d(0), capitalGainPublic: d(0), cashPrivate: d(0), noncashPrivate: d(0), capitalGainPrivate: d(0) };
    let nonitemizedEligibleCash = d(0);
    const audit = new AuditTrail(), seen = new Set<number>();
    const statements = packet.statements.map((source): K1CharitableStatementResult => {
        const match = /^scheduleK1:(0|[1-9]\d*)$/.exec(source.k1SourceId ?? '');
        const index = match ? Number(match[1]) : -1, k1 = input.scheduleK1[index];
        if (!k1 || seen.has(index) || !source.basis)
            throw new Error('K1 charitable requires unique original indexed statement and basis sources');
        seen.add(index);
        if (source.sameRegularAmtTreatmentConfirmed !== true)
            throw new Error('K1 charitable requires actual same regular and AMT treatment; differences need their source method');
        for (const key of zeroFields)
            if (!d(k1[key]).isFinite() || !d(k1[key]).isZero())
                throw new Error(`K1 charitable ${key} requires its separate activity or character source method`);
        for (const [key, value] of Object.entries(k1.priorSuspendedLosses ?? {}))
            if (key !== 'charitable' && !d(value).isZero())
                throw new Error('K1 charitable prior noncharitable basis releases require their independent character and QBI history method');
        const basis = calculatePartnerBasisSchedule(k1, { taxpayer: input.taxpayer, sources: source.basis });
        if (k1.accountHolder !== 'primary' && k1.accountHolder !== 'spouse')
            throw new Error('K1 charitable original account holder is unknown');
        if (source.cashDistribution) reconcileDistributionOwnerTreatment(input, k1);
        const distributionGain = calculateK1CashDistributionGain(k1, basis, source.basis, source.cashDistribution);
        if (distributionGain?.passiveActivity && !input.qbiLossSources?.activities?.some(row => row.k1SourceId === source.k1SourceId))
            throw new Error('K1 passive distribution requires linked actual QBI and prior passive histories, including none');
        const charity = basis.charitableSources;
        if (!charity)
            throw new Error('K1 charitable original basis result is missing');
        if (!Array.isArray(source.receipts) || source.receipts.length !== charity.records.length)
            throw new Error('K1 charitable requires every original recipient receipt exactly once');
        const receiptIds = new Set<string>();
        const receiptTreatment = new Map<string, { key: keyof typeof amounts; eligibleCurrentCash: boolean }>();
        for (const row of charity.records) {
            const receipt: Receipt | undefined = source.receipts.find(item => item.basisSourceId === row.sourceId);
            if (!receipt || receiptIds.has(row.sourceId))
                throw new Error('K1 charitable missing or duplicate receipt binding');
            receiptIds.add(row.sourceId);
            text(receipt.sourceReference, 'original receipt reference');
            text(receipt.recipientName, 'recipient name');
            if (receipt.qualifiedOrganization !== true)
                throw new Error('K1 charitable original claimed amount conflicts with unknown or false recipient qualification');
            if (!receipt.recipientCategory)
                throw new Error('K1 charitable recipient category is unknown');
            const recipient = resolveCharitableRecipient(receipt), code = row.category === 'cash_60' ? 'A' : row.category === 'capital_gain_30' ? 'E' : 'F';
            if (receipt.originalBox !== (k1.entityType === 's_corporation' ? '12' : '13') || receipt.originalCode !== code
                || (code === 'F') !== (recipient.percentageCategory === 'other-thirty-percent'))
                throw new Error('K1 charitable original box code and recipient category must reconcile');
            const paid = date(receipt.contributionDate, 'actual payment date');
            const original = source.basis.currentContributions?.find(item => item.sourceId === row.sourceId);
            if (row.current ? paid !== original?.contributionDate : Number(paid.slice(0, 4)) > row.originTaxYear)
                throw new Error('K1 charitable original payment date conflicts with its basis source year');
            if (year === 2026 && !row.current && row.availableAfterBasis.gt(0)
                && !isNonitemizedPriorPropertySource(year, input.deductionElection, row.category))
                throw new Error('K1 charitable prior-basis release in2026 requires its separate section170(p) timing and floor/carry-year method');
            if (row.category === 'cash_60') {
                let eligibleCurrentCash = false;
                if (year === 2026) {
                    if (typeof receipt.donorAdvisedFund !== 'boolean' || typeof receipt.supportingOrganization !== 'boolean')
                        throw new Error('K1 charitable cash recipient qualification is unknown');
                    if (row.current && !receipt.donorAdvisedFund && !receipt.supportingOrganization)
                        eligibleCurrentCash = true;
                }
                receiptTreatment.set(row.sourceId, { key: 'cashPublic', eligibleCurrentCash });
            }
            else {
                const acquired = date(receipt.acquisitionDate, 'stock acquisition date');
                const anniversary = `${Number(acquired.slice(0, 4)) + 1}${acquired.slice(4)}`;
                if (receipt.propertyType !== 'appreciated_stock' || paid <= anniversary)
                    throw new Error('K1 charitable capital property requires actual stock held more than one year');
                const fmv = amount(receipt.fairMarketValueShare, 'allocated original stock FMV');
                if (fmv.lt(row.originalBasis))
                    throw new Error('K1 charitable decreased-value stock requires its separate basis method');
                let qualifiedValue = fmv;
                if (recipient.privateNonoperating) {
                    if (typeof receipt.qualifiedAppreciatedStock !== 'boolean')
                        throw new Error('K1 charitable private-foundation qualified stock is unknown');
                    if (!receipt.qualifiedAppreciatedStock)
                        qualifiedValue = Decimal.min(fmv, row.originalBasis);
                }
                if (!qualifiedValue.eq(row.contributionShare))
                    throw new Error('K1 charitable original property value basis and qualification must reconcile');
                const key = code === 'E' ? 'capitalGainPublic' : 'capitalGainPrivate';
                receiptTreatment.set(row.sourceId, { key, eligibleCurrentCash: false });
            }
        }
        if (source.receipts.some(row => !row.basisSourceId || !receiptIds.has(row.basisSourceId)) || new Set(source.receipts.map(row => row.basisSourceId)).size !== source.receipts.length)
            throw new Error('K1 charitable receipt identities must bind exactly once');
        const risk = source.atRisk, form = k1.form6198;
        if (!risk || !form || risk.sourceTaxYear !== year || risk.sourceFactsConfirmed !== true || risk.simplifiedMethodEligible !== true || risk.allActivityDeductionsIncluded !== true)
            throw new Error('K1 charitable requires complete actual eligible at-risk source facts');
        text(risk.sourceReference, 'at-risk source reference');
        if (distributionGain && source.cashDistribution?.atRiskSourceReference !== risk.sourceReference)
            throw new Error('K1 cash distribution must bind the same original at-risk activity source');
        for (const key of ['ordinaryIncome', 'gainLossFromDispositions', 'otherIncomeGains', 'otherDeductionsLosses'] as const) {
            const value = form[key];
            if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) {
                throw new Error('K1 charitable requires all four actual Form6198 PartI values, including explicit zero');
            }
        }
        const priorAtRisk = calculateK1PriorAtRiskSources({ taxpayer: input.taxpayer, k1, history: risk.priorLossHistory,
            basisSources: source.basis, receipts: source.receipts, deductionElection: input.deductionElection });
        audit.merge(priorAtRisk.lines.map(line => ({ ...line, line: `${line.line}-${index + 1}` })));
        if (k1.atRiskAmount !== undefined)
            throw new Error('K1 charitable calculated at-risk overrides cannot replace original source facts');
        if (form.activityName.trim().toLowerCase() !== k1.partnershipName.trim().toLowerCase())
            throw new Error('K1 charitable original at-risk activity identity differs');
        for (const key of ['adjustedBasisAtEffectiveDate', 'priorYearAmountAtRisk', 'currentYearIncreases', 'currentYearDecreases'] as const)
            if (!amount(risk[key], `at-risk ${key}`).eq(amount(form[key], `original at-risk ${key}`)))
                throw new Error('K1 charitable at-risk inputs must match the original source');
        if (risk.computation === 'first_year') {
            if (!d(form.priorYearAmountAtRisk).isZero() || priorAtRisk.total.gt(0))
                throw new Error('K1 charitable first-year at-risk source has a prior-year amount');
        }
        else if (risk.computation !== 'subsequent_year' || !d(form.adjustedBasisAtEffectiveDate).isZero())
            throw new Error('K1 charitable requires actual consistent first or subsequent-year at-risk sources');
        const allowed = (key: string) => basis.lossCategories.find(row => row.key === key)?.allowed ?? d(0);
        const ordinaryAmount = Decimal.max(0, d(k1.ordinaryIncome)).minus(allowed('ordinary'));
        const shortTermAmount = Decimal.max(0, d(k1.netShortTermCapitalGain)).minus(allowed('shortTermCapital'));
        const longTermAmount = Decimal.max(0, d(k1.netLongTermCapitalGain)).minus(allowed('longTermCapital'));
        if (!d(form.ordinaryIncome).eq(ordinaryAmount.minus(priorAtRisk.ordinary))
            || !d(form.gainLossFromDispositions).eq(shortTermAmount.plus(longTermAmount).minus(priorAtRisk.shortTerm).minus(priorAtRisk.longTerm).plus(distributionGain?.gain ?? 0))
            || !d(form.otherIncomeGains).eq(sum(d(k1.interestIncome), d(k1.ordinaryDividends))))
            throw new Error('K1 charitable original at-risk income sources must reconcile to basis-allowed character');
        const allCharity = sum(...Object.values(charity.availableAfterBasis), ...priorAtRisk.charitable.map(row => row.remaining));
        if (!d(form.otherDeductionsLosses).isZero() && !d(form.otherDeductionsLosses).eq(allCharity))
            throw new Error('K1 charitable at-risk other deductions contain an unreconciled source');
        const nonbindingRiskRequired = basis.totalAllowedLosses.minus(charity.basisAllowed).plus(allCharity)
            .plus(priorAtRisk.ordinary).plus(priorAtRisk.shortTerm).plus(priorAtRisk.longTerm);
        const amountAtRisk = calculateForm6198(form).amountAtRisk;
        let atRiskAllocation: K1CharitableAtRiskResult | undefined;
        if (risk.activityAllocation !== undefined) {
            const assignment = risk.activityAllocation;
            if (assignment.sourceTaxYear !== year || assignment.sourceFactsConfirmed !== true || assignment.allOriginalItemsBelongToActivityConfirmed !== true)
                throw new Error('K1 charitable at-risk allocation requires actual confirmed activity assignment');
            text(assignment.sourceReference, 'at-risk activity assignment reference');
            const ids = assignment.charitableSourceIds;
            const assignedGiftIds = new Set([...receiptIds, ...priorAtRisk.charitable.map(row => row.gift.basisSourceId)]);
            if (!Array.isArray(ids) || ids.length !== assignedGiftIds.size || new Set(ids).size !== ids.length || ids.some(id => !assignedGiftIds.has(id)))
                throw new Error('K1 charitable at-risk activity assignment must identify every original charitable source exactly once');
            if (!d(form.otherDeductionsLosses).eq(allCharity))
                throw new Error('K1 charitable at-risk activity line4 must include all assigned charitable deductions after basis');
            if (!d(k1.guaranteedPayments).isZero())
                throw new Error('K1 charitable at-risk guaranteed payment assignment requires its separate original activity method');
            if (k1.isPassiveActivity && !source.capitalCharacter && (!d(k1.netShortTermCapitalGain).isZero() || !d(k1.netLongTermCapitalGain).isZero()
                || priorAtRisk.shortTerm.gt(0) || priorAtRisk.longTerm.gt(0)))
                throw new Error('K1 charitable passive capital items require their separate original character source');
            atRiskAllocation = calculateK1CharitableAtRisk({ form, ordinaryAmount, shortTermAmount, longTermAmount,
                distributionGain: distributionGain?.gain ?? d(0), charitable: charity.records.map(row => {
                    const receipt = source.receipts?.find(item => item.basisSourceId === row.sourceId);
                    if (!receipt?.contributionDate) throw new Error('K1 charitable at-risk allocation requires the original gift date');
                    return { sourceId: row.sourceId, basisOriginTaxYear: row.originTaxYear, category: row.category,
                        contributionDate: receipt.contributionDate, amountAfterBasis: row.availableAfterBasis };
                }), prior: priorAtRisk });
            audit.merge(atRiskAllocation.lines.map(line => ({ ...line, line: `${line.line}-${index + 1}` })));
        }
        else if (priorAtRisk.total.gt(0))
            throw new Error('K1 prior at-risk release requires actual current activity assignment and complete character allocation');
        else if (amountAtRisk.lt(nonbindingRiskRequired))
            throw new Error('K1 charitable nonbinding at-risk capacity must cover all basis-allowed deductions and full charitable value');
        const capitalCharacter = source.capitalCharacter ? calculateK1CapitalCharacterSources({ taxYear: year, k1,
            source: source.capitalCharacter, priorAtRisk: priorAtRisk.records }) : undefined;
        if (capitalCharacter && !input.qbiLossSources?.activities?.some(row => row.k1SourceId === source.k1SourceId))
            throw new Error('K1 capital character requires linked actual ordinary and prior passive histories, including zero');
        for (const row of charity.records) {
            const treatment = receiptTreatment.get(row.sourceId);
            if (!treatment) throw new Error('K1 charitable original receipt treatment is missing');
            const available = atRiskAllocation?.charitable.find(item => item.sourceId === row.sourceId)?.allowed ?? row.availableAfterBasis;
            amounts[treatment.key] = amounts[treatment.key].plus(available);
            if (treatment.eligibleCurrentCash) nonitemizedEligibleCash = nonitemizedEligibleCash.plus(available);
        }
        for (const row of atRiskAllocation?.prior ?? []) if (row.gift) {
            const key = row.gift.category === 'cash_60' ? 'cashPublic' : row.gift.category === 'capital_gain_30' ? 'capitalGainPublic' : 'capitalGainPrivate';
            amounts[key] = amounts[key].plus(row.allowed);
        }
        if ((d(k1.ordinaryIncome).lt(0) || priorAtRisk.ordinary.gt(0)) && !input.qbiLossSources?.activities?.some(row => row.k1SourceId === source.k1SourceId))
            throw new Error('K1 charitable ordinary loss requires its independent actual QBI source history');
        audit.record('K1 Charitable Return', `source-${index + 1}`, 'Original attached charity after basis and actual activity proof', allCharity, 'Separate charity; no passive-loss deduction or taxpayer-entered final allowance', {
            'Charitable basis allowed': charity.basisAllowed, 'Appreciation outside basis limit': charity.appreciationExempt, 'Charitable basis suspended': charity.basisSuspended,
            'Conservative at-risk requirement': nonbindingRiskRequired, 'Actual amount at risk': amountAtRisk,
            'Ordinary amount after basis': ordinaryAmount, 'Short-term amount after basis': shortTermAmount, 'Long-term amount after basis': longTermAmount,
        });
        if (distributionGain) audit.merge(distributionGain.lines.map(line => ({ ...line, line: `${line.line}-${index + 1}` })));
        return { k1Index: index, accountHolder: k1.accountHolder, basis, distributionGain, nonbindingRiskRequired, amountAtRisk, ordinaryAmount, shortTermAmount, longTermAmount, atRiskAllocation, priorAtRisk, capitalCharacter };
    });
    if (input.scheduleK1.some((row, index) => needsSource(row) && !seen.has(index)))
        throw new Error('K1 charitable complete packet omits an actual current or prior basis source');
    return { sourceFactsVerified: true, statements, amounts, nonitemizedEligibleCash, lines: audit.getLines() };
}
