import type { TaxYearInput } from '@/models/inputs';
import { priorCharitableNolInput } from './charitable-prior-nol';

/** Fictional originals and independently completed histories; no current allowance input. */
export function charitableNolOriginsInput(options: { prior?: boolean; alternative?: string; year?: number } = {}): TaxYearInput {
  const input = priorCharitableNolInput({ regular: options.prior ? '60000' : '0', alternative: options.prior ? options.alternative ?? '60000' : '0' });
  input.donations = [{ organization:'Synthetic public ordinary-property recipient', type:'property', amount:'10000',
    dateOfDonation:'2025-05-01', qualifiedOrganization:true, recipientCategory:'fifty-percent',
    isPrivateFoundation:false, costBasis:'10000', isLongTermCapitalGain:false }];
  if (!options.prior) input.donations.push({ organization:'Synthetic public capital-property recipient', type:'appreciated_stock', amount:'60000',
    dateOfDonation:'2025-05-01', qualifiedOrganization:true, recipientCategory:'fifty-percent',
    isPrivateFoundation:false, costBasis:'30000', isLongTermCapitalGain:true,
    qualifiedAppreciatedStock:true });
  if (options.year === 2026) {
    input.taxpayer.taxYear = 2026;
    input.donations.forEach(row => { row.dateOfDonation = row.dateOfDonation.replace('2025','2026'); });
    if (!input.netOperatingLoss?.alternativeTax || !input.charitableCarryoverSources) throw new Error('Missing fictional history');
    input.netOperatingLoss.sourceTaxYear = 2026;
    input.netOperatingLoss.vintages?.forEach(row => { row.adjustedThroughTaxYear = 2025; row.history?.push({ taxYear:2025, nolUsed:'0', attributeReduction:'0', sourceReference:'Synthetic completed no-use year' }); });
    const history = input.netOperatingLoss.alternativeTax.charitableCarryoverHistory;
    if (!history?.alternativeCarryoverSources) throw new Error('Missing fictional independent history');
    history.sourceTaxYear = 2025;
    for (const packet of [input.charitableCarryoverSources, history.alternativeCarryoverSources]) {
      packet.sourceTaxYear = 2026;
      packet.vintages?.forEach(row => { row.adjustedThroughTaxYear = 2025; row.history?.push({ taxYear:2025, treatedAsPaid:'0', nolReduction:'0', sourceReference:'Synthetic completed no-use year' }); });
    }
  }
  return input;
}
