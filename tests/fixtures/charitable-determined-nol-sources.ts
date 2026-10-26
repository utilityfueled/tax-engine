import { priorCharitableGuideSources } from './charitable-prior-nol-sources';
/** Pure fictional source fixture shared by actual guide, DOM and browser checks. */
export function determinedCharitableGuideSources() {
  const {regular,loss}=priorCharitableGuideSources('5000');
  const vintage=regular.vintages?.[0],summary=loss.alternativeTax?.charitableCarryoverHistory?.priorRegularCarryovers?.[0];
  if(!vintage || !summary)throw new Error('Missing fictional actual history');
  vintage.originalExcess='60000';vintage.openingCarryforward='60000';summary.amount='60000';
  const current={organization:'Synthetic current property recipient',type:'property' as const,amount:'10000',costBasis:'10000',date:'2025-05-01',
    qualifiedOrganization:true,recipientCategory:'fifty-percent' as const,isPrivateFoundation:false,isLongTermCapitalGain:false};
  return {regular,loss,current};
}
