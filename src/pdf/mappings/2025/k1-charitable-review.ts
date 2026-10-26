/** Source-bound basis and charity review; spec/k1-charitable-return-sources.yaml. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { charitableReviewOriginalSourceInput, type PreparedCharitableReview } from '@/pdf/charitable-review-context.js';
import { assertPdfExportAllowed, markReviewPdf } from '@/pdf/export-policy.js';
export const K1_CHARITABLE_REFERENCE_FILENAME = 'k1-charitable-reference-filled.pdf';
export function buildK1CharitableReview(input: TaxYearInput, result: TaxReturnResult, context?: PreparedCharitableReview): string[] {
    assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
    const original = charitableReviewOriginalSourceInput(input, result, context);
    const source = calculateK1CharitableReturnSources(original);
    if (!source)
        throw new Error('K1 charitable review requires original attached sources');
    const rows = [
        `Tax year ${result.taxYear}. Original K1 charitable contribution review.`,
        'Basis and at-risk suspensions are separate from section170 charitable carryovers. Do not add these amounts as deductions.',
        `Schedule A candidate charitable amount: $${result.scheduleA?.charitableTotal.toFixed() ?? '0'}`,
        `Selected deduction method: ${result.deductionUsed}`,
        `Selected section170 charitable carryforward: $${result.carryforwards.charitableContributions.toFixed()}`,
    ];
    for (const statement of source.statements) {
        const charity = statement.basis.charitableSources;
        if (!charity)
            throw new Error('K1 charitable review requires completed basis sources');
        rows.push(`Statement ${statement.k1Index + 1}, ${original.scheduleK1[statement.k1Index].accountHolder === 'spouse' ? 'spouse' : 'primary taxpayer'}`, `Conservative at-risk requirement: $${statement.nonbindingRiskRequired.toFixed()}; actual capacity: $${statement.amountAtRisk.toFixed()}`, `Ordinary amount after basis: $${statement.ordinaryAmount.toFixed()}`, `Short-term capital amount after basis: $${statement.shortTermAmount.toFixed()}`, `Long-term capital amount after basis: $${statement.longTermAmount.toFixed()}`);
        const risk = statement.atRiskAllocation;
        if (risk) rows.push(
            'Actual activity assignment verified against the original Form6198 item statement.',
            `Activity deductions after basis: $${risk.totalDeductions.toFixed()}; retained activity income: $${risk.totalIncome.toFixed()}`,
            `Disallowed activity loss: $${risk.disallowedLoss.toFixed()}; each deduction retains its proportional share.`,
            `Ordinary amount after at risk: $${risk.ordinaryAmount.toFixed()}; Ordinary suspended at risk: $${risk.ordinarySuspended.toFixed()}`,
            `Short-term capital amount after at risk: $${risk.shortTermAmount.toFixed()}; Short-term capital suspended at risk: $${risk.shortTermSuspended.toFixed()}`,
            `Long-term capital amount after at risk: $${risk.longTermAmount.toFixed()}; Long-term capital suspended at risk: $${risk.longTermSuspended.toFixed()}`,
            'At-risk suspensions retain their original source and character; these are not new section170 carryovers.',
        );
        const distribution = statement.distributionGain;
        if (distribution) rows.push(
            `Actual cash distribution: $${distribution.cash.toFixed()}; Basis before distribution: $${distribution.basisBeforeDistribution.toFixed()}`,
            `Basis recovered: $${distribution.recoveredBasis.toFixed()}; Owner capital gain: $${distribution.gain.toFixed()}`,
            `Acquisition date: ${distribution.acquisitionDate}; distribution date: ${distribution.distributionDate}; ${distribution.holdingPeriod}-term capital gain`,
            `Form8949 proceeds: $${distribution.proceeds.toFixed()}; reported basis: $${distribution.reportedBasis.toFixed()}`,
            'Distribution gain is not another entity income or charitable contribution.',
        );
        if (distribution?.passiveActivity) {
            const name = original.scheduleK1[statement.k1Index].partnershipName;
            const activity = result.form8582?.activityRows.find(row => row.name === name);
            const allocation = result.form8582?.activityAllocations.find(row => row.name === name);
            if (!activity || !allocation) throw new Error('K1 passive distribution review requires its original activity and ordinary loss allocation');
            rows.push(
                'Distribution character: single passive business; continuing ownership.',
                `Valuation date: ${distribution.passiveActivity.valuationDate}; holder underlying business FMV: $${distribution.passiveActivity.fairMarketValue.toFixed()}; adjusted basis: $${distribution.passiveActivity.adjustedBasis.toFixed()}`,
                `Form8582 activity income: $${activity.currentIncome.toFixed()}; owner capital gain remains on Form8949 and Schedule D.`,
                `Ordinary passive loss allowed: $${allocation.allowedLoss.toFixed()}; Passive loss remaining: $${allocation.suspendedLoss.toFixed()}`,
                'The owner gain does not restore entity basis or become qualified business income. No full-disposition loss release applies.',
            );
        }
        for (const [index, record] of charity.records.entries()) {
            const label = record.category === 'cash_60' ? 'public cash' : record.category === 'capital_gain_30' ? 'public capital property' : 'other capital property';
            rows.push(`Contribution ${index + 1}: ${label}; original year ${record.originTaxYear}; ${record.current ? 'current entity-year source' : 'prior basis source'}`, `Original contribution share: $${record.contributionShare.toFixed()}; original allocated basis: $${record.originalBasis.toFixed()}`, `Basis previously allowed: $${record.basisPreviouslyAllowed.toFixed()}; basis allowed this year: $${record.basisAllowed.toFixed()}`, `Current appreciation outside the basis limit: $${record.appreciationExempt.toFixed()}`, `Available after basis: $${record.availableAfterBasis.toFixed()}; Basis suspended: $${record.basisSuspended.toFixed()}`);
            const allocated = risk?.charitable.find(row => row.sourceId === record.sourceId);
            if (risk && !allocated) throw new Error('K1 charitable review requires every original at-risk allocation');
            if (allocated) rows.push(`Available for section170: $${allocated.allowed.toFixed()}; At-risk suspended: $${allocated.suspended.toFixed()}`);
        }
    }
    return rows;
}
export async function fillK1CharitableReview(input: TaxYearInput, result: TaxReturnResult, context?: PreparedCharitableReview): Promise<PDFDocument> {
    const rows = buildK1CharitableReview(input, result, context), doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let page = doc.addPage([612, 792]), y = 708, number = 1;
    const header = () => {
        page.drawText('K1 charitable sources and basis', { x: 42, y: 750, size: 15, font: bold });
        page.drawText(`Review appendix - page ${number}`, { x: 42, y: 732, size: 9, font, color: rgb(.35, .35, .35) });
        y = 708;
    };
    header();
    for (const row of rows) {
        // Static labels, enums, validated years and exact amounts only.
        let line = '';
        const write = () => {
            if (y < 66) {
                page = doc.addPage([612, 792]);
                number++;
                header();
            }
            page.drawText(line, { x: 42, y, size: 9.5, font });
            y -= 14;
        };
        for (const word of row.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(next, 9.5) > 528 && line) {
                write();
                line = word;
            }
            else
                line = next;
        }
        if (line)
            write();
        y -= 5;
    }
    await markReviewPdf(doc);
    return doc;
}
