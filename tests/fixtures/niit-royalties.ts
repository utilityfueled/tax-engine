import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';

export function royaltyNiitFixture(k1: Record<string, unknown>[] = [], royalty = '0', wages = '200000') {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{...simpleW2Fixture.w2s[0], wages, federalWithheld:'0', socialSecurityWages:'176100',socialSecurityWithheld:'10918.20',
      medicareWages:wages,medicareWithheld:new Decimal(wages).times('0.0145').toFixed() }],
    form1099Misc: [{ taxYear:2025,sourceId:'actual-royalty-source',accountHolder:'primary',payer:'Fictional portfolio royalty payer',royalties:royalty }],
    scheduleK1: k1.map((source,index)=>({taxYear:2025,accountHolder:'primary',partnershipName:`Fictional actual entity ${index}`,partnershipEIN:`${40+index}-4444444`,
      entityType:'s_corporation',ordinaryIncome:'0',isPassiveActivity:false,selfEmploymentFactsConfirmed:true,selfEmploymentEarnings:'0',
      selfEmploymentNetEarningsAfterAdjustments:'0',selfEmploymentIncomeType:'nonfarm',...source})),
  });
}
