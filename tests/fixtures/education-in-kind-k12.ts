import { TaxYearInputSchema } from '@/models/inputs.js';
import { inKindAssistanceFixture } from './education-in-kind-assistance.js';

/** Synthetic actual contracts and statements; not inferred production defaults. */
export function inKindK12Fixture(year=2026) {
  const input=inKindAssistanceFixture(year),facts=input.qualifiedEducationExpenses?.sourceFacts;
  if(!facts?.expenses?.[0]||!facts.allocations?.[0]||!facts.inKindBenefits?.[0]||!facts.beneficiaries?.[0])throw new Error('Missing source fixture');
  return TaxYearInputSchema.parse({...input,form1099Q:[
    {...input.form1099Q[0],distributionDate:`${year}-08-15`},
    {...input.form1099Q[0],sourceId:'cash',accountId:'actual-cash-account',distributionMedium:'cash',grossDistribution:'2000',earnings:'400',basis:'1600',distributionDate:`${year}-08-15`},
  ],qualifiedEducationExpenses:{sourceFacts:{...facts,
    beneficiaries:[{...facts.beneficiaries[0],outsideK12QualifiedDistributions:year===2026?'19000':'9000',outsideK12CashOnlyConfirmed:true}],
    expenses:[{...facts.expenses[0],category:'k12_tuition',amount:'6000',taxFreeAssistance:'0'}],
    allocations:[{...facts.allocations[0],amount:'4000'},{sourceId:'cash',expenseId:'tuition',amount:'2000',creditAmount:'0'}],
    inKindBenefits:[{...facts.inKindBenefits[0],prepaidPlanSponsor:'state',prepaidPlanQualifiedConfirmed:true,
      prepaidTuitionCreditRedeemed:true,prepaidPlanSourceReference:'Synthetic original qualified prepaid contract'}],
  }}});
}
